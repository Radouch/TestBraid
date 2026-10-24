<?php
declare(strict_types=1);

namespace TestBraid\Config;

use TestBraid\Http\ApiProblem;

/**
 * Operator-owned configuration. Only site() may be published through the API;
 * upload limits and future private settings must stay on the PHP side.
 *
 * The legacy flat uploads.json format is read only to allow safe upgrades.
 */
final class InstallationConfig
{
    private const DEFAULT_SITE = ['name' => 'TestBraid', 'description' => ''];

    /** @param array{name:string,description:string} $site
     *  @param array{maxImageSizeMiB:int,maxVideoSizeMiB:int} $uploads
     */
    private function __construct(
        private readonly array $site,
        private readonly array $uploads
    ) {}

    /** @return array{name:string,description:string} */
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
     * Public branding has safe defaults even before first-time setup.
     * An existing, malformed app.json is never silently ignored.
     *
     * @return array{name:string,description:string}
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
     * Prefer the unified file, but keep an existing uploads.json working until
     * the operator migrates its actual limits into config/app.json.
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
            $name = $data['site']['name'];
            $description = $data['site']['description'];
            if (!is_string($name) || trim($name) === '' || strlen($name) > 160
                || preg_match('/[\x00-\x1F\x7F]/', $name)
                || !is_string($description) || strlen($description) > 500
                || preg_match('/[\x00-\x1F\x7F]/', $description)) {
                throw new ApiProblem(503, $errorCode, 'Site name or description is invalid.');
            }
            $site = ['name' => trim($name), 'description' => trim($description)];
            $uploads = $data['uploads'];
        } else {
            // Older installations have a flat config/uploads.json.
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
}
