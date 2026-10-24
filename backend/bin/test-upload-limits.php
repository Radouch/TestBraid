<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use TestBraid\Http\ApiProblem;
use TestBraid\Storage\UploadLimits;

function check(bool $passed, string $message): void
{
    if (!$passed) throw new RuntimeException($message);
}

$path = tempnam(sys_get_temp_dir(), 'testbraid-upload-');
if ($path === false) throw new RuntimeException('Unable to create temporary config.');
try {
    file_put_contents($path, '{"maxVideoSizeMiB":64,"maxImageSizeMiB":10}');
    $limits = new UploadLimits($path, '256M', '256M', true);
    $normal = $limits->asResponse();
    check($normal['imageMaxBytes'] === 10 * 1048576, 'Incorrect image limit.');
    check($normal['videoMaxBytes'] === 64 * 1048576, 'Incorrect video limit.');
    check($normal['warnings'] === [], 'Unexpected warning.');

    $restricted = new UploadLimits($path, '20M', '18M', true);
    $report = $restricted->asResponse();
    check($report['imageMaxBytes'] === 10 * 1048576, 'Image should retain its own limit.');
    check($report['videoMaxBytes'] === 17 * 1048576, 'Video should allow multipart overhead.');
    check(count($report['warnings']) === 1 && $report['warnings'][0]['kind'] === 'video', 'Expected video warning.');
    check($report['phpUploadMaxBytes'] === 20 * 1048576, 'Wrong PHP upload size.');
    check($report['phpPostMaxBytes'] === 18 * 1048576, 'Wrong PHP POST size.');

    $disabled = new UploadLimits($path, '256M', '256M', false);
    check($disabled->maxBytes('image') === 0 && $disabled->maxBytes('video') === 0, 'Disabled uploads must be rejected.');

    foreach ([
        '{"maxImageSizeMiB":0,"maxVideoSizeMiB":64}',
        '{"maxImageSizeMiB":"10","maxVideoSizeMiB":64}',
        '{"maxImageSizeMiB":10}',
        '{"maxImageSizeMiB":10,"maxVideoSizeMiB":64,"unexpected":1}',
        '{invalid json',
    ] as $invalid) {
        file_put_contents($path, $invalid);
        try {
            new UploadLimits($path, '256M', '256M', true);
            throw new RuntimeException('Invalid upload configuration was accepted.');
        } catch (ApiProblem $problem) {
            check($problem->errorCode === 'UPLOAD_CONFIG_INVALID', 'Wrong invalid configuration error.');
        }
    }
    // Unified configuration must preserve the old default limits.
    file_put_contents($path, '{"site":{"name":"Learning Center","description":"Self-assessment tests"},"uploads":{"maxImageSizeMiB":12,"maxVideoSizeMiB":80}}');
    $unified = new UploadLimits($path, '256M', '256M', true);
    check($unified->maxBytes('image') === 12 * 1048576, 'Unified image limit ignored.');
    check($unified->maxBytes('video') === 80 * 1048576, 'Unified video limit ignored.');
    $site = \TestBraid\Config\InstallationConfig::fromFile($path)->site();
    check($site['name'] === 'Learning Center' && $site['description'] === 'Self-assessment tests', 'Wrong public branding.');

    // Maps are exposed unchanged to the frontend; legacy string fields also work.
    file_put_contents($path, '{"site":{"name":{"cs":"Český název","en":"English title"},"description":{"cs":"Český perex","en":"English intro"}},"uploads":{"maxImageSizeMiB":12,"maxVideoSizeMiB":80}}');
    $translations = \TestBraid\Config\InstallationConfig::fromFile($path)->site();
    check($translations['name']['cs'] === 'Český název' && $translations['name']['en'] === 'English title',
        'Multilingual site name is incorrect.');
    check($translations['description']['cs'] === 'Český perex', 'Multilingual introduction is incorrect.');
    check((new UploadLimits($path, '256M', '256M', true))->asResponse()['configuredImageMaxBytes'] === 12 * 1048576,
        'Multilingual config must preserve upload limits.');

    // Invalid branding must not be accepted along with otherwise valid limits.
    foreach ([
        '{"site":{"name":"","description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":"Test","description":42},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":"Test","description":""},"uploads":{"maxImageSizeMiB":0,"maxVideoSizeMiB":64}}',
        '{"site":{"name":"Test","description":"","extra":1},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":{},"description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":[],"description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":{"xx":""},"description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":{"invalid_locale_key":"Test"},"description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
        '{"site":{"name":{"cs":123},"description":""},"uploads":{"maxImageSizeMiB":10,"maxVideoSizeMiB":64}}',
    ] as $invalidApp) {
        file_put_contents($path, $invalidApp);
        try {
            new UploadLimits($path, '256M', '256M', true);
            throw new RuntimeException('Invalid unified configuration was accepted.');
        } catch (ApiProblem $problem) {
            check($problem->errorCode === 'UPLOAD_CONFIG_INVALID', 'Wrong invalid app configuration error.');
        }
    }

    // Upgrading an existing host without app.json must keep its prior limits.
    $directory = sys_get_temp_dir() . '/testbraid-config-' . bin2hex(random_bytes(8));
    mkdir($directory . '/config', 0700, true);
    try {
        file_put_contents($directory . '/config/uploads.json', '{"maxImageSizeMiB":25,"maxVideoSizeMiB":100}');
        check(\TestBraid\Config\InstallationConfig::publicSite($directory)['name']['en'] === 'TestBraid',
            'Legacy installation lost its default branding.');
        $legacy = UploadLimits::fromBackendRoot($directory);
        check($legacy->asResponse()['configuredImageMaxBytes'] === 25 * 1048576, 'Legacy upload limits were not preserved.');

        file_put_contents($directory . '/config/app.json', '{"site":{"name":"My Tests","description":"Hello"},"uploads":{"maxImageSizeMiB":15,"maxVideoSizeMiB":90}}');
        check(\TestBraid\Config\InstallationConfig::publicSite($directory)['name'] === 'My Tests',
            'New branding did not replace default.');
        $current = UploadLimits::fromBackendRoot($directory);
        check($current->asResponse()['configuredImageMaxBytes'] === 15 * 1048576, 'app.json should take precedence over uploads.json.');
    } finally {
        unlink($directory . '/config/uploads.json');
        if (is_file($directory . '/config/app.json')) unlink($directory . '/config/app.json');
        rmdir($directory . '/config');
        rmdir($directory);
    }

    echo "PASS: runtime media size policy, unified/legacy configuration and validation\n";
} finally {
    unlink($path);
}
