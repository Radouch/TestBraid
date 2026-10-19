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
$privateEntry = getenv('TESTBRAID_BACKEND_ENTRY');
if (!is_string($privateEntry) || $privateEntry === '') {
    $privateEntry = dirname(__DIR__, 2) . '/testbraid-backend/public/index.php';
}

$autoload = dirname($privateEntry, 2) . '/vendor/autoload.php';
if (!is_file($privateEntry) || !is_readable($privateEntry) || !is_file($autoload)) {
    // Do not disclose private filesystem paths to anonymous HTTP clients.
    error_log('TestBraid backend entry point or Composer autoload file is missing.');
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo '{"error":{"code":"BACKEND_UNAVAILABLE","message":"Service unavailable."}}';
    exit;
}

require $privateEntry;
