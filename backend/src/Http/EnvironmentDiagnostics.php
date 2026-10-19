<?php
declare(strict_types=1);

namespace TestBraid\Http;

/**
 * Small, author-only runtime capability report for shared-host validation.
 *
 * Intentionally returns allowlisted settings only. phpinfo(), ini_get_all(),
 * filesystem paths, cookie values, environment variables and hostnames must
 * never become part of the API response.
 */
final class EnvironmentDiagnostics
{
    /** @return array<string, bool|string|int|null> */
    public static function collect(): array
    {
        // Called after AuthorMiddleware started the PHP session. Read the
        // effective cookie attributes configured by our SessionManager.
        $cookie = session_get_cookie_params();

        return [
            'phpVersion' => PHP_VERSION,
            'phpSapi' => PHP_SAPI,
            'fileinfoEnabled' => extension_loaded('fileinfo'),
            'jsonEnabled' => extension_loaded('json'),
            'fileUploadsEnabled' => filter_var(ini_get('file_uploads'), FILTER_VALIDATE_BOOLEAN),
            'uploadMaxFilesize' => self::iniValue('upload_max_filesize'),
            'postMaxSize' => self::iniValue('post_max_size'),
            'maxInputTimeSeconds' => self::iniInteger('max_input_time'),
            'maxExecutionTimeSeconds' => self::iniInteger('max_execution_time'),
            'sessionCookieSecure' => (bool) ($cookie['secure'] ?? false),
            'sessionCookieHttpOnly' => (bool) ($cookie['httponly'] ?? false),
            'sessionCookieSameSite' => (string) ($cookie['samesite'] ?? ''),
            'sessionStrictMode' => ini_get('session.use_strict_mode') === '1',
            'sessionUseOnlyCookies' => ini_get('session.use_only_cookies') === '1',
        ];
    }

    private static function iniValue(string $setting): ?string
    {
        $value = ini_get($setting);
        if (!is_string($value) || !preg_match('/^[0-9]+(?:[KMG])?$/iD', $value)) {
            return null;
        }
        return $value;
    }

    private static function iniInteger(string $setting): ?int
    {
        $value = ini_get($setting);
        if (!is_string($value) || !preg_match('/^-?[0-9]+$/D', $value)) {
            return null;
        }
        return (int) $value;
    }
}
