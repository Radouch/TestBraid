<?php
declare(strict_types=1);

namespace TestBraid\Config;

use TestBraid\Http\ApiProblem;

/**
 * Private, operator-owned installation settings. Only site() may be returned
 * to anonymous visitors; upload limits stay on the PHP side.
 *
 * Site fields accept a language-independent string or a locale->text map,
 * without imposing a fixed list of supported interface languages.
 */
final class InstallationConfig
{
    private const DEFAULT_SITE = [
        'name' => ['cs' => 'TestBraid', 'en' => 'TestBraid'],
        'description' => [
            'cs' => 'Aplikace pro tvorbu a vyplňování multimediálních testů se samostatným vyhodnocením odpovědí.',
            'en' => 'An application for creating and taking multimedia self-assessment tests with immediate feedback.',
        ],
    ];

    /**
     * @param array{name:string|array<string,string>,description:string|array<string,string>} $site
     * @param array{maxImageSizeMiB:int,maxVideoSizeMiB:int} $uploads
     */
    private function __construct(
        private readonly array $site,
        private readonly array $uploads
    ) {}

    /** @return array{name:string|array<string,string>,description:string|array<string,string>} */
    public function site(): array
    {
        return $this->site;
    }

    /** @return array{maxImageSizeMiB:int,maxVideoSizeMiB:int} */
    public function uploads(): array
    {
        return $this->uploads;
    }

    /**
     * Public branding has defaults even before initial configuration.
     * An existing malformed app.json must not be silently ignored.
     *
     * @return array{name:string|array<string,string>,description:string|array<string,string>}
     */
    public static function publicSite(string $backendRoot): array
    {
        $override = getenv('TESTBRAID_APP_CONFIG_FILE');
        $explicit = is_string($override) && $override !== '';
        $path = $explicit ? $override : $backendRoot . '/config/app.json';
        if (!$explicit && !file_exists($path) && !is_link($path)) {
            return self::DEFAULT_SITE;
        }
        return self::fromFile($path)->site();
    }

    /**
     * Keep already deployed uploads.json working if no unified app.json
     * exists. Runtime app.json takes precedence over the old upload file.
     */
    public static function uploadFile(string $backendRoot): string
    {
        $appOverride = getenv('TESTBRAID_APP_CONFIG_FILE');
        if (is_string($appOverride) && $appOverride !== '') {
            return $appOverride;
        }
        $legacyOverride = getenv('TESTBRAID_UPLOAD_CONFIG_FILE');
        if (is_string($legacyOverride) && $legacyOverride !== '') {
            return $legacyOverride;
        }
        $appFile = $backendRoot . '/config/app.json';
        if (file_exists($appFile) || is_link($appFile)) {
            return $appFile;
        }
        return $backendRoot . '/config/uploads.json';
    }

    /**
     * @throws ApiProblem If private JSON or settings are invalid.
     */
    public static function fromFile(string $file, string $errorCode = 'APP_CONFIG_INVALID'): self
    {
        if (!is_file($file) || is_link($file) || !is_readable($file)) {
            throw new ApiProblem(503, $errorCode, 'Installation configuration is missing or unreadable.');
        }
        $raw = file_get_contents($file);
        if ($raw === false || strlen($raw) > 8192) {
            throw new ApiProblem(503, $errorCode, 'Installation configuration cannot be read.');
        }
        try {
            $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiProblem(503, $errorCode, 'Installation configuration is invalid JSON.');
        }
        if (!is_array($data)) {
            throw new ApiProblem(503, $errorCode, 'Installation configuration must be a JSON object.');
        }

        if (array_key_exists('site', $data) || array_key_exists('uploads', $data)) {
            if (count($data) !== 2 || !array_key_exists('site', $data)
                || !array_key_exists('uploads', $data) || !is_array($data['site'])
                || count($data['site']) !== 2
                || !array_key_exists('name', $data['site'])
                || !array_key_exists('description', $data['site'])) {
                throw new ApiProblem(503, $errorCode, 'Installation configuration has invalid site fields.');
            }
            $site = [
                'name' => self::siteText($data['site']['name'], false, 160, $errorCode),
                'description' => self::siteText($data['site']['description'], true, 500, $errorCode),
            ];
            $uploads = $data['uploads'];
        } else {
            // Legacy config/uploads.json has a flat pair of size limits.
            $site = self::DEFAULT_SITE;
            $uploads = $data;
        }

        if (!is_array($uploads) || count($uploads) !== 2
            || !array_key_exists('maxImageSizeMiB', $uploads)
            || !array_key_exists('maxVideoSizeMiB', $uploads)) {
            throw new ApiProblem(503, $errorCode, 'Upload limits configuration has invalid fields.');
        }
        foreach ($uploads as $value) {
            if (!is_int($value) || $value < 1 || $value > 2048) {
                throw new ApiProblem(503, $errorCode, 'Upload limits must be integers between 1 and 2048 MiB.');
            }
        }
        return new self($site, $uploads);
    }

    /**
     * @return string|array<string,string>
     */
    private static function siteText(mixed $input, bool $allowEmpty, int $maxLength, string $errorCode): string|array
    {
        if (is_string($input)) {
            return self::validText($input, $allowEmpty, $maxLength, $errorCode);
        }
        // A locale map must contain 1-20 named BCP-47-like keys. Never accept
        // numeric JSON arrays or nested translations as configuration.
        if (!is_array($input) || count($input) < 1 || count($input) > 20) {
            throw new ApiProblem(503, $errorCode, 'Site text must be a string or a nonempty locale map.');
        }
        $values = [];
        foreach ($input as $locale => $value) {
            if (!is_string($locale)
                || !preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $locale)
                || !is_string($value)) {
                throw new ApiProblem(503, $errorCode, 'Site text contains an invalid locale or translation.');
            }
            $values[$locale] = self::validText($value, $allowEmpty, $maxLength, $errorCode);
        }
        return $values;
    }

    private static function validText(string $value, bool $allowEmpty, int $maxLength, string $errorCode): string
    {
        $value = trim($value);
        if ((!$allowEmpty && $value === '') || strlen($value) > $maxLength
            || preg_match('/[\x00-\x1F\x7F]/', $value)) {
            throw new ApiProblem(503, $errorCode, 'Site name or description is invalid.');
        }
        return $value;
    }
}
