<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use TestBraid\Config\InstallationConfig;
use TestBraid\Http\ApiProblem;

function check(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
function expectInvalid(callable $fn, string $code): void {
    try { $fn(); } catch (ApiProblem $e) {
        check($e->errorCode === $code, 'Unexpected config error: ' . $e->errorCode);
        return;
    }
    throw new RuntimeException('Expected ' . $code);
}

$tmp = sys_get_temp_dir() . '/testbraid-url-base-' . bin2hex(random_bytes(8));
mkdir($tmp, 0700, true);
$file = $tmp . '/app.json';
$originalConfig = getenv('TESTBRAID_APP_CONFIG_FILE');
$originalBase = getenv('TESTBRAID_BASE_PATH');
$originalRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
try {
    $baseline = json_decode((string) file_get_contents(dirname(__DIR__) . '/config/app.json'), true, 16, JSON_THROW_ON_ERROR);
    putenv('TESTBRAID_APP_CONFIG_FILE=' . $file);
    putenv('TESTBRAID_BASE_PATH');
    foreach (['/' => '', '/testbraid' => '/testbraid', '/courses/testbraid' => '/courses/testbraid',
        '/courses/testbraid/' => '/courses/testbraid'] as $configured => $expected) {
        $config = $baseline;
        $config['basePath'] = $configured;
        file_put_contents($file, json_encode($config, JSON_THROW_ON_ERROR));
        check(InstallationConfig::basePath(dirname(__DIR__)) === $expected,
            'Base path not normalized: ' . $configured);
        check(InstallationConfig::publicConfiguration(dirname(__DIR__))['basePath'] === $expected,
            'Public configuration base disagrees');
    }
    foreach (['', '//', '/a//b', '/a/../b', '/./a', '/a?x=1', '/a#x', '/a%2Fb',
        'https://example.org/a', '/a\\b'] as $invalid) {
        $config = $baseline;
        $config['basePath'] = $invalid;
        file_put_contents($file, json_encode($config, JSON_THROW_ON_ERROR));
        expectInvalid(fn() => InstallationConfig::basePath(dirname(__DIR__)), 'APP_CONFIG_INVALID');
    }

    // Existing app.json without a basePath remains valid, with optional legacy env override.
    unset($baseline['basePath']);
    file_put_contents($file, json_encode($baseline, JSON_THROW_ON_ERROR));
    check(InstallationConfig::basePath(dirname(__DIR__)) === '', 'Legacy root default broken');
    putenv('TESTBRAID_BASE_PATH=/training');
    check(InstallationConfig::basePath(dirname(__DIR__)) === '/training', 'Legacy env override broken');
    $baseline['basePath'] = '/another';
    file_put_contents($file, json_encode($baseline, JSON_THROW_ON_ERROR));
    expectInvalid(fn() => InstallationConfig::basePath(dirname(__DIR__)), 'APP_BASE_PATH_MISMATCH');
    putenv('TESTBRAID_BASE_PATH');

    // Nested installs must not treat a sibling of the app as private
    // if both directories are actually under the hosting document root.
    mkdir($tmp . '/public_html/testbraid', 0700, true);
    mkdir($tmp . '/public_html/testbraid-backend', 0700, true);
    mkdir($tmp . '/private-backend', 0700, true);
    $_SERVER['DOCUMENT_ROOT'] = $tmp . '/public_html';
    expectInvalid(fn() => InstallationConfig::assertPrivateBackend(
        $tmp . '/public_html/testbraid-backend', '/testbraid'), 'PRIVATE_ROOT_UNSAFE');
    InstallationConfig::assertPrivateBackend($tmp . '/private-backend', '/testbraid');
    InstallationConfig::assertPrivateBackend($tmp . '/public_html/testbraid-backend', '');
    unset($_SERVER['DOCUMENT_ROOT']);
    expectInvalid(fn() => InstallationConfig::assertPrivateBackend($tmp . '/private-backend', '/testbraid'),
        'PRIVATE_ROOT_UNVERIFIED');
    echo "PASS: configurable runtime URL path, strict validation and private root checks\n";
} finally {
    $originalConfig === false ? putenv('TESTBRAID_APP_CONFIG_FILE') : putenv('TESTBRAID_APP_CONFIG_FILE=' . $originalConfig);
    $originalBase === false ? putenv('TESTBRAID_BASE_PATH') : putenv('TESTBRAID_BASE_PATH=' . $originalBase);
    if ($originalRoot === null) unset($_SERVER['DOCUMENT_ROOT']); else $_SERVER['DOCUMENT_ROOT'] = $originalRoot;
    @unlink($file);
    @rmdir($tmp . '/public_html/testbraid-backend');
    @rmdir($tmp . '/public_html/testbraid');
    @rmdir($tmp . '/public_html');
    @rmdir($tmp . '/private-backend');
    @rmdir($tmp);
}
