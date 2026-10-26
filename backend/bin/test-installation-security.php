<?php
declare(strict_types=1);
require dirname(__DIR__) . '/vendor/autoload.php';
use TestBraid\Http\InstallationSecurityDiagnostics;

function checkSecurity(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
$tmp = sys_get_temp_dir() . '/testbraid-security-' . bin2hex(random_bytes(8));
$web = $tmp . '/www';
$nested = $web . '/tichotesty';
$backend = $tmp . '/tichotesty-backend';
$unsafe = $web . '/exposed-backend';
mkdir($nested, 0700, true);
mkdir($backend, 0700, true);
mkdir($unsafe, 0700, true);
file_put_contents($backend . '/.htaccess', "Require all denied\n");
file_put_contents($backend . '/security-probe.txt', "TESTBRAID_PRIVATE_BACKEND_PROBE_V1\n");
try {
    $_SERVER['DOCUMENT_ROOT'] = $tmp; // overbroad CGI metadata
    $safe = InstallationSecurityDiagnostics::inspect($backend, $nested, '/tichotesty');
    checkSecurity($safe['backendPlacement'] === 'outside-inferred-site-root', 'Wrong safe placement');
    checkSecurity($safe['denyDirectivePresent'] && $safe['probeFilePresent'], 'Missing probe/deny');
    checkSecurity($safe['probeUrlPath'] === null, 'Unknown Apache aliases must not be guessed');
    $risk = InstallationSecurityDiagnostics::inspect($unsafe, $nested, '/tichotesty');
    checkSecurity($risk['backendPlacement'] === 'within-inferred-site-root', 'Public backend missed');
    checkSecurity($risk['probeUrlPath'] === '/exposed-backend/security-probe.txt',
        'HTTP probe path should be suggested when the backend is within the web root');
    $mismatch = InstallationSecurityDiagnostics::inspect($backend, $nested, '/other-path');
    checkSecurity($mismatch['backendPlacement'] === 'unverified', 'Mismatched path must be unknown');
    echo "PASS: advisory diagnostics, safe response schema and overbroad CGI root\n";
} finally {
    @unlink($backend . '/.htaccess');
    @unlink($backend . '/security-probe.txt');
    @rmdir($backend);
    @rmdir($unsafe);
    @rmdir($nested);
    @rmdir($web);
    @rmdir($tmp);
}
