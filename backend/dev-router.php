<?php
declare(strict_types=1);

// Local development only: php -S 127.0.0.1:8080 -t public dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path)) {
    http_response_code(400);
    exit;
}

$publicRoot = realpath(__DIR__ . '/public');
$candidate = realpath(__DIR__ . '/public' . $path);
if ($publicRoot !== false && $candidate !== false
    && str_starts_with($candidate, $publicRoot . DIRECTORY_SEPARATOR)
    && is_file($candidate)) {
    return false;
}

// Simulate an Apache/FastCGI rewrite reporting an internal SCRIPT_NAME.
// This catches regressions where Slim guesses its public base path from CGI
// metadata rather than from explicit deployment configuration.
$simulatedScriptName = getenv('TESTBRAID_TEST_REWRITTEN_SCRIPT_NAME');
if (PHP_SAPI === 'cli-server' && is_string($simulatedScriptName) && $simulatedScriptName !== '') {
    $_SERVER['SCRIPT_NAME'] = $simulatedScriptName;
}

// Serve using the same canonical public-root signal as the production
// bootstrap. This remains independent of CGI SCRIPT_NAME and DOCUMENT_ROOT.
if (!defined('TESTBRAID_PUBLIC_ROOT')) {
    define('TESTBRAID_PUBLIC_ROOT', realpath(__DIR__ . '/public') ?: __DIR__ . '/public');
}

require __DIR__ . '/public/index.php';
