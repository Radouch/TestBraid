<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use TestBraid\Config\InstallationConfig;

/**
 * Upload policy loaded from the operator-owned private JSON file on every
 * request. The browser receives effective limits through an author-only API;
 * neither PHP nor the built Vue bundle carries a second copy of the limits.
 * Existing config/uploads.json remains supported until app.json is created.
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
        $limits = InstallationConfig::fromFile($file, 'UPLOAD_CONFIG_INVALID')->uploads();
        $this->imageConfigured = $limits['maxImageSizeMiB'] * self::MIB;
        $this->videoConfigured = $limits['maxVideoSizeMiB'] * self::MIB;
        $this->phpUploadMaximum = self::iniBytes($phpUploadSetting ?? (string) ini_get('upload_max_filesize'));
        $this->phpPostMaximum = self::iniBytes($phpPostSetting ?? (string) ini_get('post_max_size'));
        $this->uploadsEnabled = $uploadsEnabled ?? filter_var(ini_get('file_uploads'), FILTER_VALIDATE_BOOLEAN);
    }

    public static function fromBackendRoot(string $backendRoot): self
    {
        return new self(InstallationConfig::uploadFile($backendRoot));
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
