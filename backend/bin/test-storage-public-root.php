<?php
declare(strict_types=1);

use TestBraid\Storage\JsonFileRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

/**
 * A shared host may report DOCUMENT_ROOT as the application domain directory,
 * while the real publicly served directory is its www/ child. Storage must
 * remain outside that actual web root, but still inside the hosting account.
 */
$root = sys_get_temp_dir() . '/testbraid-public-root-' . bin2hex(random_bytes(8));
$public = $root . '/www';
$private = $root . '/testbraid-backend/storage';
mkdir($public, 0700, true);
mkdir($private, 0700, true);
$previousDocumentRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
$_SERVER['DOCUMENT_ROOT'] = $root;

try {
    // Explicit physical bootstrap location wins over misleading DOCUMENT_ROOT.
    $repository = new JsonFileRepository($private, $public);
    if ($repository->all('groups') !== []) {
        throw new RuntimeException('Expected empty private group listing.');
    }

    // The security guard must continue to reject storage inside served www/.
    $unsafe = $public . '/private-storage';
    try {
        new JsonFileRepository($unsafe, $public);
        throw new RuntimeException('Storage inside www/ was not rejected.');
    } catch (RuntimeException $e) {
        if ($e->getMessage() !== 'Private storage cannot be located within the public document root.') {
            throw $e;
        }
    }

    // Direct calls without a trusted physical public root still check
    // DOCUMENT_ROOT, rather than silently bypassing the guard.
    try {
        new JsonFileRepository($private);
        throw new RuntimeException('Broad-document-root fallback was unexpectedly ignored.');
    } catch (RuntimeException $e) {
        if ($e->getMessage() !== 'Private storage cannot be located within the public document root.') {
            throw $e;
        }
    }

    echo "PASS: physical served root overrides broad DOCUMENT_ROOT; public storage remains forbidden\n";
} finally {
    if ($previousDocumentRoot === null) {
        unset($_SERVER['DOCUMENT_ROOT']);
    } else {
        $_SERVER['DOCUMENT_ROOT'] = $previousDocumentRoot;
    }
    if (is_dir($private . '/groups')) rmdir($private . '/groups');
    if (is_dir($private)) rmdir($private);
    if (is_dir(dirname($private))) rmdir(dirname($private));
    if (is_dir($public . '/private-storage')) rmdir($public . '/private-storage');
    if (is_dir($public)) rmdir($public);
    if (is_dir($root)) rmdir($root);
}
