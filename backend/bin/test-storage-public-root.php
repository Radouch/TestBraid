<?php
declare(strict_types=1);
use TestBraid\Storage\JsonFileRepository;
require dirname(__DIR__) . '/vendor/autoload.php';

$root = sys_get_temp_dir() . '/testbraid-public-root-' . bin2hex(random_bytes(8));
$public = $root . '/www';
$private = $root . '/testbraid-backend/storage';
mkdir($public, 0700, true);
mkdir($private, 0700, true);
$old = $_SERVER['DOCUMENT_ROOT'] ?? null;
$_SERVER['DOCUMENT_ROOT'] = $root;
try {
    foreach ([$private, $public . '/operator-storage'] as $directory) {
        $repo = new JsonFileRepository($directory, $public);
        if ($repo->all('groups') !== []) throw new RuntimeException('Unexpected storage content.');
    }
    echo "PASS: storage location is operator-controlled; private exposure is diagnosed separately\n";
} finally {
    if ($old === null) unset($_SERVER['DOCUMENT_ROOT']);
    else $_SERVER['DOCUMENT_ROOT'] = $old;
    foreach ([$private, $public . '/operator-storage'] as $dir) {
        @rmdir($dir . '/groups');
        @rmdir($dir);
    }
    @rmdir($root . '/testbraid-backend');
    @rmdir($public);
    @rmdir($root);
}
