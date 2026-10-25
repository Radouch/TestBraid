<?php
declare(strict_types=1);

// Smoke-test the actual public SPA entry, with fake hosting roots and a private
// compiled HTML template. No HTTP requests or operator files are used.
$tmp = sys_get_temp_dir() . '/testbraid-spa-' . bin2hex(random_bytes(8));
$root = $tmp . '/testbraid-backend';
$docRoot = $tmp . '/public_html';
mkdir($root . '/public', 0700, true);
mkdir($root . '/templates', 0700, true);
mkdir($root . '/config', 0700, true);
mkdir($docRoot . '/courses/testbraid', 0700, true);
mkdir($docRoot . '/testbraid', 0700, true);
if (!symlink(dirname(__DIR__) . '/vendor', $root . '/vendor')) {
    throw new RuntimeException('Cannot link test Composer vendor.');
}
$template = '<!doctype html><html><head><link rel="stylesheet" href="./assets/main.css">'
    . '</head><body><script type="module" src="./assets/main.js"></script></body></html>';
file_put_contents($root . '/templates/index.html', $template);
$config = json_decode((string) file_get_contents(dirname(__DIR__) . '/config/app.json'), true, 16, JSON_THROW_ON_ERROR);
$oldEntry = getenv('TESTBRAID_BACKEND_ENTRY');
$oldConfig = getenv('TESTBRAID_APP_CONFIG_FILE');
$oldBase = getenv('TESTBRAID_BASE_PATH');
$oldRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
try {
    putenv('TESTBRAID_BACKEND_ENTRY=' . $root . '/public/index.php');
    putenv('TESTBRAID_APP_CONFIG_FILE=' . $root . '/config/app.json');
    putenv('TESTBRAID_BASE_PATH');
    $_SERVER['DOCUMENT_ROOT'] = $docRoot;

    foreach (['/' => '/', '/testbraid' => '/testbraid/',
        '/courses/testbraid' => '/courses/testbraid/'] as $setting => $expected) {
        $config['basePath'] = $setting;
        file_put_contents($root . '/config/app.json', json_encode($config, JSON_THROW_ON_ERROR));
        // __DIR__ of the actual PHP entry must match its public URL directory.
        $site = $setting === '/' ? $docRoot : $docRoot . $setting;
        copy(dirname(__DIR__, 2) . '/deploy/www/index.php', $site . '/index.php');
        copy(dirname(__DIR__, 2) . '/deploy/www/backend-path.php', $site . '/backend-path.php');
        ob_start();
        require $site . '/index.php';
        $html = (string) ob_get_clean();
        $baseTag = '<base data-testbraid-base href="' . $expected . '">';
        if (substr_count($html, $baseTag) !== 1
            || strpos($html, $baseTag) >= strpos($html, '<link rel="stylesheet"')
            || !str_contains($html, 'src="./assets/main.js"')) {
            throw new RuntimeException('Incorrect generated SPA shell for ' . $setting);
        }
    }
    echo "PASS: dynamic PHP shell injects base ahead of relative assets at all three paths\n";
} finally {
    $oldEntry === false ? putenv('TESTBRAID_BACKEND_ENTRY') : putenv('TESTBRAID_BACKEND_ENTRY=' . $oldEntry);
    $oldConfig === false ? putenv('TESTBRAID_APP_CONFIG_FILE') : putenv('TESTBRAID_APP_CONFIG_FILE=' . $oldConfig);
    $oldBase === false ? putenv('TESTBRAID_BASE_PATH') : putenv('TESTBRAID_BASE_PATH=' . $oldBase);
    if ($oldRoot === null) unset($_SERVER['DOCUMENT_ROOT']); else $_SERVER['DOCUMENT_ROOT'] = $oldRoot;
    @unlink($root . '/config/app.json');
    @unlink($root . '/templates/index.html');
    @unlink($root . '/vendor');
    @rmdir($root . '/config');
    @rmdir($root . '/templates');
    @rmdir($root . '/public');
    @rmdir($root);
    @unlink($docRoot . '/backend-path.php');
    @unlink($docRoot . '/testbraid/backend-path.php');
    @unlink($docRoot . '/courses/testbraid/backend-path.php');
    @unlink($docRoot . '/index.php');
    @unlink($docRoot . '/testbraid/index.php');
    @unlink($docRoot . '/courses/testbraid/index.php');
    @rmdir($docRoot . '/testbraid');
    @rmdir($docRoot . '/courses/testbraid');
    @rmdir($docRoot . '/courses');
    @rmdir($docRoot);
    @rmdir($tmp);
}
