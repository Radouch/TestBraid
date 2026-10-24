<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use TestBraid\Config\InstallationConfig;
use TestBraid\Http\ApiProblem;

$filename = tempnam(sys_get_temp_dir(), 'testbraid-languages-');
if ($filename === false) {
    throw new RuntimeException('Cannot create temporary config.');
}
$base = [
    'site' => ['name' => 'Test', 'description' => 'Description'],
    'uploads' => ['maxImageSizeMiB' => 10, 'maxVideoSizeMiB' => 64],
];
try {
    file_put_contents($filename, json_encode($base, JSON_THROW_ON_ERROR));
    $legacy = InstallationConfig::fromFile($filename);
    if ($legacy->uiLanguages() !== ['en', 'cs']) throw new RuntimeException('Old config must default to en/cs.');

    $base['uiLanguages'] = ['cs'];
    file_put_contents($filename, json_encode($base, JSON_THROW_ON_ERROR));
    if (InstallationConfig::fromFile($filename)->uiLanguages() !== ['cs']) {
        throw new RuntimeException('Czech-only configuration was not applied.');
    }

    foreach ([[], ['cs', 'cs'], ['../secret'], ['CS'], [12], ['cs', 'en', 'bad/path']] as $invalid) {
        $base['uiLanguages'] = $invalid;
        file_put_contents($filename, json_encode($base, JSON_THROW_ON_ERROR));
        try {
            InstallationConfig::fromFile($filename);
        } catch (ApiProblem) {
            continue;
        }
        throw new RuntimeException('Invalid uiLanguages was accepted: ' . json_encode($invalid));
    }
} finally {
    unlink($filename);
}
echo "PASS: uiLanguages allowlist and backwards-compatible app.json\n";
