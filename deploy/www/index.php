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
    \TestBraid\Config\InstallationConfig::assertPrivateBackend($backendRoot, $basePath);
    $shell = file_get_contents($template);
    if ($shell === false || substr_count($shell, '<head>') !== 1) {
        throw new RuntimeException('Invalid SPA HTML template.');
    }
    $base = htmlspecialchars(($basePath === '' ? '' : $basePath) . '/', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $shell = str_replace('<head>', '<head>' . "\n    <base data-testbraid-base href=\"" . $base . "\">", $shell);
} catch (Throwable $error) {
    error_log('TestBraid SPA bootstrap failed: ' . $error->getMessage());
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'TestBraid installation configuration is unavailable.';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo $shell;
