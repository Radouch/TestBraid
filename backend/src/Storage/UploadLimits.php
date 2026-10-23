<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use TestBraid\Http\ApiProblem;

/**
 * Upload policy loaded from the operator-owned private JSON file on every
 * request. The browser receives effective limits through an author-only API;
 * neither PHP nor the built Vue bundle carries a second copy of the limits.
 * The operator creates config/uploads.json from uploads.example.json on install.
 */
final class UploadLimits
{
    private const MIB = 1048576;
    private const POST_OVERHEAD_BYTES = 1048576;

    private int $imageConfigured;
    private int $videoConfigured;
    private ?int $phpUploadMaximum;
    private ?int $phpPostMaximum;
    private bool $uploadsEnabled;

    public function __construct(
        string $file,
        ?string $phpUploadSetting = null,
        ?string $phpPostSetting = null,
        ?bool $uploadsEnabled = null
    ) {
        if (!is_file($file) || is_link($file) || !is_readable($file)) {
            throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Upload limits configuration is missing or unreadable.');
        }
        $raw = file_get_contents($file);
        if ($raw === false || strlen($raw) > 4096) {
            throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Upload limits configuration cannot be read.');
        }
        try {
            $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Upload limits configuration is invalid JSON.');
        }
        if (!is_array($data) || count($data) !== 2
            || !array_key_exists('maxImageSizeMiB', $data)
            || !array_key_exists('maxVideoSizeMiB', $data)) {
            throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Upload limits configuration has invalid fields.');
        }
        foreach ($data as $value) {
            if (!is_int($value) || $value < 1 || $value > 2048) {
                throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Upload limits must be integers between 1 and 2048 MiB.');
            }
        }
        $this->imageConfigured = $data['maxImageSizeMiB'] * self::MIB;
        $this->videoConfigured = $data['maxVideoSizeMiB'] * self::MIB;
        $this->phpUploadMaximum = self::iniBytes($phpUploadSetting ?? (string) ini_get('upload_max_filesize'));
        $this->phpPostMaximum = self::iniBytes($phpPostSetting ?? (string) ini_get('post_max_size'));
        $this->uploadsEnabled = $uploadsEnabled ?? filter_var(ini_get('file_uploads'), FILTER_VALIDATE_BOOLEAN);
    }

    public static function fromBackendRoot(string $backendRoot): self
    {
        // An explicit path lets isolated tests use disposable configuration
        // without writing a runtime file into the source checkout.
        $override = getenv('TESTBRAID_UPLOAD_CONFIG_FILE');
        $file = is_string($override) && $override !== ''
            ? $override
            : $backendRoot . '/config/uploads.json';
        return new self($file);
    }

    /** Return null for the documented unlimited (0) PHP setting. */
    private static function iniBytes(string $setting): ?int
    {
        if (!preg_match('/^\s*(\d+)([KMG]?)\s*$/iD', $setting, $matches)) {
            throw new ApiProblem(503, 'UPLOAD_CONFIG_INVALID', 'Unable to interpret PHP upload settings.');
        }
        $number = (int) $matches[1];
        if ($number === 0) return null;
        $factor = match (strtoupper($matches[2])) {
            'G' => 1073741824,
            'M' => 1048576,
            'K' => 1024,
            default => 1,
        };
        return $number > intdiv(PHP_INT_MAX, $factor) ? PHP_INT_MAX : $number * $factor;
    }

    public function maxBytes(string $kind): int
    {
        $configured = match ($kind) {
            'image' => $this->imageConfigured,
            'video' => $this->videoConfigured,
            default => throw new \InvalidArgumentException('Unknown media kind.'),
        };
        if (!$this->uploadsEnabled) return 0;
        $maximum = $configured;
        if ($this->phpUploadMaximum !== null) $maximum = min($maximum, $this->phpUploadMaximum);
        // Multipart requests include headers/form fields as well as file bytes.
        // This 1 MiB margin is conservative, not a guarantee against proxy caps.
        if ($this->phpPostMaximum !== null) {
            $maximum = min($maximum, max(0, $this->phpPostMaximum - self::POST_OVERHEAD_BYTES));
        }
        return $maximum;
    }

    /** @return array<string, mixed> */
    public function asResponse(): array
    {
        $warnings = [];
        foreach (['image' => $this->imageConfigured, 'video' => $this->videoConfigured] as $kind => $configured) {
            $effective = $this->maxBytes($kind);
            if ($effective < $configured) {
                $warnings[] = [
                    'kind' => $kind,
                    'configuredMaxBytes' => $configured,
                    'effectiveMaxBytes' => $effective,
                ];
            }
        }
        return [
            'imageMaxBytes' => $this->maxBytes('image'),
            'videoMaxBytes' => $this->maxBytes('video'),
            'configuredImageMaxBytes' => $this->imageConfigured,
            'configuredVideoMaxBytes' => $this->videoConfigured,
            'phpUploadMaxBytes' => $this->phpUploadMaximum,
            'phpPostMaxBytes' => $this->phpPostMaximum,
            'fileUploadsEnabled' => $this->uploadsEnabled,
            'warnings' => $warnings,
        ];
    }
}
