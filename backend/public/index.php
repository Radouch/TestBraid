<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use TestBraid\Auth\AuthorMiddleware;
use TestBraid\Auth\AuthorStore;
use TestBraid\Auth\CsrfMiddleware;
use TestBraid\Auth\FirstAuthorSetup;
use TestBraid\Auth\LoginLimiter;
use TestBraid\Auth\SessionManager;
use TestBraid\Http\JsonResponse;
use TestBraid\Http\AdminDataRoutes;
use TestBraid\Http\AdminMediaRoutes;
use TestBraid\Http\InstallationSecurityDiagnostics;
use TestBraid\Http\PublicTestRoutes;
use TestBraid\Config\InstallationConfig;
use TestBraid\Http\ApiProblem;

// This application is private; only the separate public api/index.php is web-accessible.
$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';

$app = AppFactory::create();

// Apache rewrites may report SCRIPT_NAME as an internal/private script path.
// Never infer Slim's public route prefix from CGI metadata: the default
// deployment lives at the domain root and must remain independent of rewrites.
// Subdirectory deployments opt in using TESTBRAID_BASE_PATH (e.g. /testbraid).
$basePath = InstallationConfig::basePath($root);
if ($basePath !== '') {
    $app->setBasePath($basePath);
}
$sessions = new SessionManager($basePath === '' ? '/' : $basePath . '/');
$authorsFile = getenv('TESTBRAID_AUTHORS_FILE') ?: $root . '/config/authors.json';
$authors = new AuthorStore($authorsFile);
$setup = new FirstAuthorSetup(
    $authors,
    $authorsFile,
    getenv('TESTBRAID_SETUP_KEY_FILE') ?: $root . '/config/setup.key'
);
$limiterDir = getenv('TESTBRAID_LOGIN_DIR') ?: $root . '/storage/login-attempts';
$csrf = new CsrfMiddleware($sessions, $app->getResponseFactory());
$authorAccess = new AuthorMiddleware($sessions, $authors, $app->getResponseFactory());

$app->addRoutingMiddleware();
// Never expose PHP stack traces or private filesystem paths in HTTP responses.
$app->addErrorMiddleware(false, true, true);

$app->get('/api/health', static function (Request $request, Response $response): Response {
    return JsonResponse::send($response, ['status' => 'ok', 'service' => 'testbraid-api']);
});

// Expose only public branding, never the private app.json or upload settings.
$app->get('/api/public/config', static function (Request $request, Response $response) use ($root): Response {
    try {
        return JsonResponse::send($response, InstallationConfig::publicConfiguration($root))
            ->withHeader('Cache-Control', 'no-store');
    } catch (ApiProblem $problem) {
        return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage())
            ->withHeader('Cache-Control', 'no-store');
    }
});

$app->get('/api/auth/session', static function (Request $request, Response $response) use ($sessions, $authors, $setup): Response {
    $id = $sessions->authorId();
    $user = $id === null ? null : $authors->byId($id);
    $result = ['authenticated' => $user !== null, 'csrfToken' => $sessions->csrfToken(), 'setupState' => $setup->state()];
    if ($user !== null) {
        $result['user'] = ['id' => $user['id'], 'username' => $user['username']];
    }
    return JsonResponse::send($response, $result);
});


// This public endpoint is available only before the first author is created.
// Proof of authorization requires BOTH a session CSRF token and a secret
// uploaded separately via SFTP to the private backend configuration directory.
$app->post('/api/auth/setup', static function (Request $request, Response $response) use (
    $sessions, $setup, $limiterDir
): Response {
    $type = strtolower(trim(explode(';', $request->getHeaderLine('Content-Type'))[0]));
    if ($type !== 'application/json') {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'A JSON setup request is required.');
    }
    $raw = (string) $request->getBody();
    if (strlen($raw) > 4096) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'The setup request is too large.');
    }
    try {
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (\JsonException) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'Invalid JSON request.');
    }
    if (!is_array($data) || !is_string($data['username'] ?? null)
        || !is_string($data['password'] ?? null) || !is_string($data['setupKey'] ?? null)
        || !preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $data['username'])
        || strlen($data['password']) < 12 || strlen($data['password']) > 4096
        || strlen($data['setupKey']) < 32 || strlen($data['setupKey']) > 256) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'Invalid setup fields.');
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $limiter = new LoginLimiter($limiterDir);
    // One shared identifier limits setup-key guesses independently of username.
    if (!$limiter->allowed($ip, '__first_author_setup__')) {
        return JsonResponse::error($response, 429, 'RATE_LIMITED', 'Too many setup attempts. Try later.');
    }
    $created = $setup->provision($data['username'], $data['password'], $data['setupKey']);
    if ($created['state'] === 'complete') {
        return JsonResponse::error($response, 409, 'SETUP_COMPLETE', 'First-author setup is already complete.');
    }
    if ($created['state'] === 'needs-key') {
        return JsonResponse::error($response, 409, 'SETUP_NOT_ENABLED', 'Private setup key is missing.');
    }
    if ($created['state'] === 'invalid-key') {
        $limiter->failure($ip, '__first_author_setup__');
        return JsonResponse::error($response, 403, 'INVALID_SETUP_KEY', 'Invalid setup key.');
    }

    $sessions->login($created['id']);
    return JsonResponse::send($response, [
        'authenticated' => true,
        'user' => ['id' => $created['id'], 'username' => $data['username']],
        'csrfToken' => $sessions->csrfToken(),
        'setupState' => 'complete',
    ], 201);
})->add($csrf);

$app->post('/api/auth/login', static function (Request $request, Response $response) use ($sessions, $authors, $limiterDir): Response {
    $type = strtolower(trim(explode(';', $request->getHeaderLine('Content-Type'))[0]));
    if ($type !== 'application/json') {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'A JSON login request is required.');
    }
    $raw = (string) $request->getBody();
    if (strlen($raw) > 4096) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'The login request is too large.');
    }
    try {
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (\JsonException) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'Invalid JSON request.');
    }
    if (!is_array($data) || !is_string($data['username'] ?? null)
        || !is_string($data['password'] ?? null)
        || !preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $data['username'])
        || strlen($data['password']) > 4096) {
        return JsonResponse::error($response, 400, 'INVALID_REQUEST', 'Invalid login fields.');
    }

    // Trust REMOTE_ADDR, not client-provided forwarding headers.
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $limiter = new LoginLimiter($limiterDir);
    if (!$limiter->allowed($ip, $data['username'])) {
        return JsonResponse::error($response, 429, 'RATE_LIMITED', 'Too many login attempts. Try later.');
    }
    $user = $authors->byUsername($data['username']);
    if ($user === null || !password_verify($data['password'], $user['passwordHash'])) {
        $limiter->failure($ip, $data['username']);
        return JsonResponse::error($response, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
    }

    $sessions->login($user['id']);
    return JsonResponse::send($response, [
        'authenticated' => true,
        'user' => ['id' => $user['id'], 'username' => $user['username']],
        'csrfToken' => $sessions->csrfToken(),
    ]);
})->add($csrf);

$app->post('/api/auth/logout', static function (Request $request, Response $response) use ($sessions): Response {
    $sessions->logout();
    return JsonResponse::send($response, [
        'authenticated' => false,
        'csrfToken' => $sessions->csrfToken(),
    ]);
})->add($csrf)->add($authorAccess);

// Published test data is public, but only for records in published state.
// This route performs its own state gate; it never exposes author credentials.
(new PublicTestRoutes($root))->register($app);

// Every future admin route must be registered in this protected route group.
$adminData = new AdminDataRoutes($root);
$adminMedia = new AdminMediaRoutes($root);
$app->group('/api/admin', static function (RouteCollectorProxy $group) use ($adminData, $adminMedia, $root, $basePath): void {
    $group->get('/ping', static function (Request $request, Response $response): Response {
        return JsonResponse::send($response, ['status' => 'ok', 'user' => $request->getAttribute('author')]);
    });
    $group->get('/installation/security', static function (Request $request, Response $response) use ($root, $basePath): Response {
        $publicRoot = defined('TESTBRAID_PUBLIC_ROOT')
            ? (string) constant('TESTBRAID_PUBLIC_ROOT') : null;
        return JsonResponse::send($response, InstallationSecurityDiagnostics::inspect($root, $publicRoot, $basePath));
    });
    // All persistence routes inherit both guards from the enclosing group.
    $adminData->register($group);
    $adminMedia->register($group);
})->add($csrf)->add($authorAccess);

$app->run();
