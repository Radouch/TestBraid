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

require __DIR__ . '/public/index.php';
