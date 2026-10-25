<?php
declare(strict_types=1);

// Dynamic SPA shell: the Vite assets are built once, with relative URLs.
// Emit the trusted installation base before the browser resolves CSS/JS.
$backendEntry = getenv('TESTBRAID_BACKEND_ENTRY');
if (!is_string($backendEntry) || $backendEntry === '') {
    $backendEntry = dirname(__DIR__) . '/testbraid-backend/public/index.php';
}
$backendRoot = dirname($backendEntry, 2);
$autoload = $backendRoot . '/vendor/autoload.php';
$template = $backendRoot . '/templates/index.html';
if (!is_file($autoload) || !is_file($template)) {
    error_log('TestBraid backend dependencies or SPA template missing.');
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'TestBraid is not installed correctly.';
    exit;
}

try {
    require $autoload;
    $basePath = \TestBraid\Config\InstallationConfig::basePath($backendRoot);
    \TestBraid\Config\InstallationConfig::assertPrivateBackend($backendRoot, $basePath, __DIR__);
    $shell = file_get_contents($template);
    if ($shell === false || substr_count($shell, '<head>') !== 1) {
        throw new RuntimeException('Invalid SPA HTML template.');
    }
    $base = htmlspecialchars(($basePath === '' ? '' : $basePath) . '/', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $shell = str_replace('<head>', '<head>' . "\n    <base data-testbraid-base href=\"" . $base . "\">", $shell);
} catch (Throwable $error) {
    // Show a bounded, documented error *code* when hosting exposes no PHP logs.
    // Never disclose absolute paths, stack traces, private settings or error text.
    $code = $error instanceof \TestBraid\Http\ApiProblem
        ? $error->errorCode : 'BOOTSTRAP_UNAVAILABLE';
    if (!in_array($code, ['APP_CONFIG_INVALID', 'APP_BASE_PATH_INVALID',
        'APP_BASE_PATH_MISMATCH', 'PRIVATE_ROOT_UNVERIFIED', 'PRIVATE_ROOT_UNSAFE'], true)) {
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
