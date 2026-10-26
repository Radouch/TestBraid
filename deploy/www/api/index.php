<?php
declare(strict_types=1);

// Physical public entry path is also used for optional author diagnostics.
// Unlike CGI DOCUMENT_ROOT, this resolves to the actual installed public app.
if (!defined('TESTBRAID_PUBLIC_ROOT')) {
    define('TESTBRAID_PUBLIC_ROOT', realpath(dirname(__DIR__)) ?: dirname(__DIR__));
}
try {
    $backendRoot = require dirname(__DIR__) . '/backend-path.php';
} catch (Throwable $error) {
    $code = in_array($error->getMessage(), ['INVALID_BOOTSTRAP_CONFIG', 'BACKEND_UNAVAILABLE'], true)
        ? $error->getMessage() : 'BACKEND_UNAVAILABLE';
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => ['code' => $code, 'message' => 'Service unavailable.']]);
    exit;
}
$privateEntry = $backendRoot . '/public/index.php';
$autoload = $backendRoot . '/vendor/autoload.php';
if (!is_file($privateEntry) || !is_readable($privateEntry) || !is_file($autoload)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo '{"error":{"code":"BACKEND_DEPENDENCIES_MISSING","message":"Service unavailable."}}';
    exit;
}
try {
    require $privateEntry;
} catch (Throwable $error) {
    $code = $error instanceof \TestBraid\Http\ApiProblem
        ? $error->errorCode : 'BOOTSTRAP_UNAVAILABLE';
    if (!in_array($code, ['APP_CONFIG_INVALID', 'APP_BASE_PATH_INVALID',
        'APP_BASE_PATH_MISMATCH'], true)) {
        $code = 'BOOTSTRAP_UNAVAILABLE';
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => ['code' => $code, 'message' => 'Service unavailable.']]);
    exit;
}
