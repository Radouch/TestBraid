<?php
declare(strict_types=1);

// Dynamic SPA shell: the Vite assets are built once, with relative URLs.
// Emit the trusted installation base before the browser resolves CSS/JS.
$backendEntry = getenv('TESTBRAID_BACKEND_ENTRY');
if (!is_string($backendEntry) || $backendEntry === '') {
    // Temporary host-specific layout: <domain>/www/tichotesty/ and <domain>/tichotesty-backend/.
    $backendEntry = dirname(__DIR__, 2) . '/tichotesty-backend/public/index.php';
}
$backendRoot = dirname($backendEntry, 2);
$autoload = $backendRoot . '/vendor/autoload.php';
$template = $backendRoot . '/templates/index.html';
if (!is_file($autoload) || !is_file($template)) {
    // Distinguish missing Composer dependencies from a missing SPA template
    // without disclosing private paths on hosts without readable PHP logs.
    $code = !is_file($autoload) ? 'COMPOSER_AUTOLOAD_MISSING' : 'SPA_TEMPLATE_MISSING';
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'TestBraid installation unavailable (' . $code . ').';
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
