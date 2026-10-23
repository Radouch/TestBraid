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
    echo "PASS: runtime media size policy, PHP ceilings, warnings and invalid configuration\n";
} finally {
    unlink($path);
}
