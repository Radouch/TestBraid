<?php
declare(strict_types=1);

$root = sys_get_temp_dir() . '/testbraid-bootstrap-' . bin2hex(random_bytes(8));
$web = $root . '/www/prasopes';
$backend = $root . '/unusual-private-name';
mkdir($web, 0700, true);
mkdir($backend, 0700, true);
$source = dirname(__DIR__, 2) . '/deploy/www/backend-path.php';
copy($source, $web . '/backend-path.php');
$old = getenv('TESTBRAID_BACKEND_ENTRY');
try {
    putenv('TESTBRAID_BACKEND_ENTRY');
    file_put_contents($web . '/bootstrap.local.php', "<?php return ['backendPath' => '../../unusual-private-name'];\n");
    $resolved = require $web . '/backend-path.php';
    if ($resolved !== realpath($backend)) throw new RuntimeException('Local path not resolved');
    // Local config wins over a legacy env override.
    putenv('TESTBRAID_BACKEND_ENTRY=' . $root . '/other/public/index.php');
    $resolved = require $web . '/backend-path.php';
    if ($resolved !== realpath($backend)) throw new RuntimeException('Local path did not win');
    file_put_contents($web . '/bootstrap.local.php', "<?php return ['backendPath' => 'https://example.org/backend'];\n");
    try {
        require $web . '/backend-path.php';
        throw new RuntimeException('Unsafe bootstrap URL was accepted');
    } catch (RuntimeException $error) {
        if ($error->getMessage() !== 'INVALID_BOOTSTRAP_CONFIG') throw $error;
    }
    echo "PASS: single public configuration for arbitrary private backend; invalid URL rejected\n";
} finally {
    $old === false ? putenv('TESTBRAID_BACKEND_ENTRY') : putenv('TESTBRAID_BACKEND_ENTRY=' . $old);
    @unlink($web . '/bootstrap.local.php');
    @unlink($web . '/backend-path.php');
    @rmdir($web);
    @rmdir($root . '/www');
    @rmdir($backend);
    @rmdir($root);
}
