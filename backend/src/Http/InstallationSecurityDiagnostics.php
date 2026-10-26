<?php
declare(strict_types=1);

namespace TestBraid\Http;

/**
 * Author-only, advisory checks. We cannot infer all Apache aliases or prove
 * that .htaccess is honored, so no placement result may block application use.
 * Never return a server filesystem path, a private file or a test secret.
 */
final class InstallationSecurityDiagnostics
{
    private static function inside(string $path, string $root): bool
    {
        return $path === $root || str_starts_with($path, $root . DIRECTORY_SEPARATOR);
    }

    /** @return array<string, bool|string|null> */
    public static function inspect(string $backendRoot, ?string $publicAppRoot, string $basePath): array
    {
        $backend = realpath($backendRoot);
        $public = $publicAppRoot !== null ? realpath($publicAppRoot) : false;
        $siteRoot = $public;
        if ($siteRoot !== false && $basePath !== '') {
            foreach (array_reverse(explode('/', ltrim($basePath, '/'))) as $segment) {
                if (basename($siteRoot) !== $segment) {
                    $siteRoot = false;
                    break;
                }
                $siteRoot = dirname($siteRoot);
            }
        }

        $placement = 'unverified';
        if ($backend !== false && $public !== false && self::inside($backend, $public)) {
            $placement = 'within-public-app';
        } elseif ($backend !== false && $siteRoot !== false) {
            $placement = self::inside($backend, $siteRoot)
                ? 'within-inferred-site-root' : 'outside-inferred-site-root';
        }

        $htaccess = $backend !== false ? $backend . '/.htaccess' : null;
        $denyFile = $htaccess !== null && is_file($htaccess);
        $denyRule = false;
        if ($denyFile) {
            $contents = file_get_contents($htaccess);
            $denyRule = is_string($contents) && (str_contains($contents, 'Require all denied')
                || str_contains($contents, 'Deny from all'));
        }
        $probeFile = $backend !== false && is_file($backend . '/security-probe.txt');

        $storageSetting = getenv('TESTBRAID_STORAGE_DIR');
        $storagePath = is_string($storageSetting) && $storageSetting !== ''
            ? $storageSetting : $backendRoot . '/storage';
        $storage = realpath($storagePath);
        $storagePlacement = 'unverified';
        if ($storage !== false && $public !== false && self::inside($storage, $public)) {
            $storagePlacement = 'within-public-app';
        } elseif ($storage !== false && $siteRoot !== false) {
            $storagePlacement = self::inside($storage, $siteRoot)
                ? 'within-inferred-site-root' : 'outside-inferred-site-root';
        }

        // An HTTP probe URL can only be suggested when the backend is
        // physically below the inferred web-served root. A backend outside
        // that tree may still be exposed by an unknown Apache Alias, but
        // guessing a URL would falsely imply that we know the mapping.
        $probeUrlPath = null;
        if ($backend !== false && $siteRoot !== false && self::inside($backend, $siteRoot)) {
            $relative = ltrim(substr($backend, strlen($siteRoot)), DIRECTORY_SEPARATOR);
            $parts = $relative === '' ? [] : explode(DIRECTORY_SEPARATOR, $relative);
            $probeUrlPath = '/' . ($parts === [] ? ''
                : implode('/', array_map('rawurlencode', $parts)) . '/')
                . 'security-probe.txt';
        }

        return [
            'probeUrlPath' => $probeUrlPath,
            'backendPlacement' => $placement,
            'storagePlacement' => $storagePlacement,
            'denyFilePresent' => $denyFile,
            'denyDirectivePresent' => $denyRule,
            'probeFilePresent' => $probeFile,
        ];
    }
}
