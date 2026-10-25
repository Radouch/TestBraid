<?php
declare(strict_types=1);

// Public HTTP entry point. Keep application code, Composer dependencies,
// credentials and future JSON storage outside Apache's document root.
//
// Default hosting layout:
//   <domain directory>/www/api/index.php          (this file)
//   <domain directory>/testbraid-backend/public/index.php
//
// For other layouts, set TESTBRAID_BACKEND_ENTRY to the absolute path of
// the private backend entry point; no domain name is embedded in the code.
// Apache DOCUMENT_ROOT may name a wider directory on shared hosting, not
// the directory that actually serves the TestBraid frontend. Derive the
// public root from this physically executed bootstrap, not CGI metadata.
// The private storage layer rejects any storage location inside this root.
if (!defined('TESTBRAID_PUBLIC_ROOT')) {
    define('TESTBRAID_PUBLIC_ROOT', realpath(dirname(__DIR__)) ?: dirname(__DIR__));
}

$privateEntry = getenv('TESTBRAID_BACKEND_ENTRY');
if (!is_string($privateEntry) || $privateEntry === '') {
    // Temporary host-specific layout: <domain>/www/tichotesty/api/ and <domain>/tichotesty-backend/.
    $privateEntry = dirname(__DIR__, 3) . '/tichotesty-backend/public/index.php';
}

$autoload = dirname($privateEntry, 2) . '/vendor/autoload.php';
if (!is_file($privateEntry) || !is_readable($privateEntry) || !is_file($autoload)) {
    // Host-specific diagnostic: emit only an allowlisted code, never private paths.
    $code = !is_file($privateEntry) ? 'BACKEND_ENTRY_MISSING'
        : (!is_readable($privateEntry) ? 'BACKEND_ENTRY_UNREADABLE' : 'COMPOSER_AUTOLOAD_MISSING');
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => ['code' => $code, 'message' => 'Service unavailable.']], JSON_THROW_ON_ERROR);
    exit;
}

try {
    require $privateEntry;
} catch (Throwable $error) {
    // Shared hosting may not expose PHP error logs to its users.
    // Return only a predefined safe diagnosis, never exception messages.
    $code = $error instanceof \TestBraid\Http\ApiProblem
        ? $error->errorCode : 'BOOTSTRAP_UNAVAILABLE';
    if (!in_array($code, ['APP_CONFIG_INVALID', 'APP_BASE_PATH_INVALID',
        'APP_BASE_PATH_MISMATCH', 'PRIVATE_ROOT_UNVERIFIED', 'PRIVATE_ROOT_UNSAFE'], true)) {
        $code = 'BOOTSTRAP_UNAVAILABLE';
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => [
        'code' => $code,
        'message' => 'TestBraid installation is unavailable.',
    ]], JSON_THROW_ON_ERROR);
    exit;
}
