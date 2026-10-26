<?php
declare(strict_types=1);

// Runtime HTML shell for the prebuilt Vue app. Deployment-specific backend
// location is read from one shared, operator-owned bootstrap.local.php.
try {
    $resolver = __DIR__ . '/backend-path.php';
    if (!is_file($resolver) || !is_readable($resolver)) {
        throw new RuntimeException('BACKEND_RESOLVER_MISSING');
    }
    $backendRoot = require $resolver;
    if (!is_string($backendRoot) || $backendRoot === '') {
        throw new RuntimeException('BACKEND_RESOLVER_INVALID');
    }
} catch (Throwable $error) {
    // Hosting without PHP logs: tell an operator which bootstrap step failed,
    // but never expose a filesystem path or arbitrary exception message.
    $code = match ($error->getMessage()) {
        'BACKEND_RESOLVER_MISSING' => 'BACKEND_RESOLVER_MISSING',
        'BACKEND_RESOLVER_INVALID' => 'BACKEND_RESOLVER_INVALID',
        'INVALID_BOOTSTRAP_CONFIG' => 'INVALID_BOOTSTRAP_CONFIG',
        'BACKEND_UNAVAILABLE' => 'BACKEND_PATH_NOT_FOUND',
        default => $error instanceof ParseError
            ? 'BOOTSTRAP_PHP_INVALID' : 'BACKEND_RESOLVER_FAILED',
    };
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'TestBraid installation unavailable (' . $code . ').';
    exit;
}
$autoload = $backendRoot . '/vendor/autoload.php';
$template = $backendRoot . '/templates/index.html';
if (!is_file($autoload) || !is_file($template)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'TestBraid installation unavailable (BACKEND_DEPENDENCIES_MISSING).';
    exit;
}
// Return only an allowlisted stage code when hosting provides no accessible
// PHP error logs. No private filesystem paths, settings or exception messages.
$stage = 'PHP_AUTOLOAD_FAILED';
try {
    require $autoload;
    $stage = 'BASE_PATH_LOAD_FAILED';
    $basePath = \TestBraid\Config\InstallationConfig::basePath($backendRoot);
    $stage = 'SPA_TEMPLATE_READ_FAILED';
    $shell = file_get_contents($template);
    if ($shell === false) {
        throw new RuntimeException('SPA template cannot be read.');
    }
    $stage = 'SPA_TEMPLATE_INVALID';
    if (substr_count($shell, '<head>') !== 1) {
        throw new RuntimeException('SPA template does not have exactly one head tag.');
    }
    $stage = 'SPA_RENDER_FAILED';
    $base = htmlspecialchars(($basePath === '' ? '' : $basePath) . '/', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $shell = str_replace('<head>', '<head>' . "\n    <base data-testbraid-base href=\"" . $base . "\">", $shell);
} catch (Throwable $error) {
    $code = $error instanceof \TestBraid\Http\ApiProblem
        ? $error->errorCode : $stage;
    if (!in_array($code, ['APP_CONFIG_INVALID', 'APP_BASE_PATH_INVALID',
        'APP_BASE_PATH_MISMATCH', 'PHP_AUTOLOAD_FAILED',
        'BASE_PATH_LOAD_FAILED', 'SPA_TEMPLATE_READ_FAILED',
        'SPA_TEMPLATE_INVALID', 'SPA_RENDER_FAILED'], true)) {
        $code = $stage;
    }
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'TestBraid installation unavailable (' . $code . ').';
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo $shell;
