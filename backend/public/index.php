<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use TestBraid\Auth\AuthorMiddleware;
use TestBraid\Auth\AuthorStore;
use TestBraid\Auth\CsrfMiddleware;
use TestBraid\Auth\LoginLimiter;
use TestBraid\Auth\SessionManager;
use TestBraid\Http\JsonResponse;

// This application is private; only the separate public api/index.php is web-accessible.
$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';

$app = AppFactory::create();

// Apache rewrites may report SCRIPT_NAME as an internal/private script path.
// Never infer Slim's public route prefix from CGI metadata: the default
// deployment lives at the domain root and must remain independent of rewrites.
// Subdirectory deployments opt in using TESTBRAID_BASE_PATH (e.g. /testbraid).
$configuredBase = getenv('TESTBRAID_BASE_PATH');
$basePath = is_string($configuredBase) ? rtrim($configuredBase, '/') : '';
if ($basePath !== '' && !preg_match('~^/(?:[A-Za-z0-9._-]+)(?:/[A-Za-z0-9._-]+)*$~D', $basePath)) {
    throw new RuntimeException('Invalid TESTBRAID_BASE_PATH deployment setting.');
}
if ($basePath !== '') {
    $app->setBasePath($basePath);
}
$sessions = new SessionManager($basePath === '' ? '/' : $basePath . '/');
$authors = new AuthorStore(getenv('TESTBRAID_AUTHORS_FILE') ?: $root . '/config/authors.json');
$limiterDir = getenv('TESTBRAID_LOGIN_DIR') ?: $root . '/storage/login-attempts';
$csrf = new CsrfMiddleware($sessions, $app->getResponseFactory());
$authorAccess = new AuthorMiddleware($sessions, $authors, $app->getResponseFactory());

$app->addRoutingMiddleware();
// Never expose PHP stack traces or private filesystem paths in HTTP responses.
$app->addErrorMiddleware(false, true, true);

$app->get('/api/health', static function (Request $request, Response $response): Response {
    return JsonResponse::send($response, ['status' => 'ok', 'service' => 'testbraid-api']);
});

$app->get('/api/auth/session', static function (Request $request, Response $response) use ($sessions, $authors): Response {
    $id = $sessions->authorId();
    $user = $id === null ? null : $authors->byId($id);
    $result = ['authenticated' => $user !== null, 'csrfToken' => $sessions->csrfToken()];
    if ($user !== null) {
        $result['user'] = ['id' => $user['id'], 'username' => $user['username']];
    }
    return JsonResponse::send($response, $result);
});

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

// Every future admin route must be registered in this protected route group.
$app->group('/api/admin', static function (RouteCollectorProxy $group): void {
    $group->get('/ping', static function (Request $request, Response $response): Response {
        return JsonResponse::send($response, ['status' => 'ok', 'user' => $request->getAttribute('author')]);
    });
})->add($csrf)->add($authorAccess);

$app->run();
