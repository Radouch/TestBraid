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
try {
    require $autoload;
    $basePath = \TestBraid\Config\InstallationConfig::basePath($backendRoot);
    $shell = file_get_contents($template);
    if ($shell === false || substr_count($shell, '<head>') !== 1) {
        throw new RuntimeException('Invalid SPA HTML template.');
    }
    $base = htmlspecialchars(($basePath === '' ? '' : $basePath) . '/', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $shell = str_replace('<head>', '<head>' . "\n    <base data-testbraid-base href=\"" . $base . "\">", $shell);
} catch (Throwable $error) {
    $code = $error instanceof \TestBraid\Http\ApiProblem
        ? $error->errorCode : 'BOOTSTRAP_UNAVAILABLE';
    if (!in_array($code, ['APP_CONFIG_INVALID', 'APP_BASE_PATH_INVALID',
        'APP_BASE_PATH_MISMATCH'], true)) {
        $code = 'BOOTSTRAP_UNAVAILABLE';
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
