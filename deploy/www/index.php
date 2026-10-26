<?php
declare(strict_types=1);

// Runtime HTML shell for the prebuilt Vue app. Deployment-specific backend
// location is read from one shared, operator-owned bootstrap.local.php.
try {
    $backendRoot = require __DIR__ . '/backend-path.php';
} catch (Throwable $error) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    $code = in_array($error->getMessage(), ['INVALID_BOOTSTRAP_CONFIG', 'BACKEND_UNAVAILABLE'], true)
        ? $error->getMessage() : 'BACKEND_UNAVAILABLE';
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
