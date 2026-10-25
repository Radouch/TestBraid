<?php
declare(strict_types=1);

/**
 * Shared public entry-point resolver. Both index.php and api/index.php load
 * this file from the same directory. Installation-specific settings live in
 * bootstrap.local.php, which is never part of an upgrade package.
 */
$publicRoot = __DIR__;
$localConfig = $publicRoot . '/bootstrap.local.php';
$backendPath = null;
if (is_file($localConfig)) {
    $settings = require $localConfig;
    if (!is_array($settings) || count($settings) !== 1
        || !isset($settings['backendPath']) || !is_string($settings['backendPath'])) {
        throw new RuntimeException('INVALID_BOOTSTRAP_CONFIG');
    }
    $backendPath = $settings['backendPath'];
} else {
    // Backwards-compatible deployments may already use this environment var.
    $environment = getenv('TESTBRAID_BACKEND_ENTRY');
    if (is_string($environment) && $environment !== '') {
        $backendPath = dirname($environment, 2);
    } else {
        $backendPath = dirname($publicRoot) . '/testbraid-backend';
    }
}
if ($backendPath === '' || strlen($backendPath) > 4096
    || str_contains($backendPath, "\0") || preg_match('/[\r\n]/', $backendPath)
    || preg_match('~^[a-z][a-z0-9+.-]*://~i', $backendPath)) {
    throw new RuntimeException('INVALID_BOOTSTRAP_CONFIG');
}
if ($backendPath[0] !== '/') {
    $backendPath = $publicRoot . '/' . $backendPath;
}
$resolved = realpath($backendPath);
if ($resolved === false || !is_dir($resolved)) {
    throw new RuntimeException('BACKEND_UNAVAILABLE');
}
return $resolved;
