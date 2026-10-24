<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use Psr\Http\Message\UploadedFileInterface;
use RuntimeException;
use stdClass;
use TestBraid\Http\ApiProblem;
use TestBraid\Publication\PublicationService;
use TestBraid\Validation\SchemaValidator;

/**
 * Server-side upload policy. No untrusted name or MIME header forms a path.
 * Uploads remain private until a separate publication milestone.
 */
final class PrivateMediaService
{
    /** @var array<string, array{kind:string, extension:string, aliases:list<string>}> */
    private const FORMATS = [
        'image/jpeg' => ['kind' => 'image', 'extension' => 'jpg', 'aliases' => ['jpg', 'jpeg']],
        'image/png' => ['kind' => 'image', 'extension' => 'png', 'aliases' => ['png']],
        'image/webp' => ['kind' => 'image', 'extension' => 'webp', 'aliases' => ['webp']],
        'video/mp4' => ['kind' => 'video', 'extension' => 'mp4', 'aliases' => ['mp4']],
        'video/webm' => ['kind' => 'video', 'extension' => 'webm', 'aliases' => ['webm']],
    ];

    private JsonFileRepository $repository;
    private string $root;

    public function __construct(private readonly string $backendRoot, private readonly SchemaValidator $schemas)
    {
        $this->root = rtrim(getenv('TESTBRAID_STORAGE_DIR') ?: $backendRoot . '/storage', DIRECTORY_SEPARATOR);
        $this->repository = new JsonFileRepository($this->root);
    }

    public function upload(UploadedFileInterface $upload, ?string $groupId = null): stdClass
    {
        $limits = UploadLimits::fromBackendRoot($this->backendRoot);
        $maximum = max($limits->maxBytes('image'), $limits->maxBytes('video'));
        if ($upload->getError() !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($upload->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            throw new ApiProblem($tooLarge ? 413 : 400, $tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED', 'The file upload failed.');
        }

        $filename = $upload->getClientFilename();
        if (!is_string($filename) || $filename === '' || strlen($filename) > 1024
            || preg_match('/[\x00-\x1f\x7f]/', $filename) === 1 || preg_match('//u', $filename) !== 1) {
            throw new ApiProblem(422, 'INVALID_FILENAME', 'A valid file name is required.');
        }

        $original = basename(str_replace('\\', '/', $filename));
        if (strlen($original) > 1024 || $original === '' || !preg_match('/\.([A-Za-z0-9]{1,16})$/D', $original, $extensionMatch)) {
            throw new ApiProblem(422, 'INVALID_FILENAME', 'A supported file extension is required.');
        }
        // Unusual double extensions should not enter the media library at all.
        if (preg_match('/\.(?:php[0-9]?|phtml|phar|cgi|pl|py|exe|sh|html?|svg)\./i', $original)) {
            throw new ApiProblem(422, 'INVALID_FILENAME', 'Dangerous file name.');
        }
        $clientExtension = strtolower($extensionMatch[1]);

        $declaredSize = $upload->getSize();
        if ($declaredSize !== null && ($declaredSize < 1 || $declaredSize > $maximum)) {
            throw new ApiProblem(413, 'FILE_TOO_LARGE', 'The file exceeds the upload limit.');
        }

        $directory = $this->fileDirectory(true);
        $temporary = tempnam($directory, '.upload-');
        if ($temporary === false) {
            throw new RuntimeException('Unable to create a private upload staging file.');
        }
        $publishedPath = null;
        try {
            if (!chmod($temporary, 0600)) {
                throw new RuntimeException('Unable to protect a staged upload.');
            }
            $output = fopen($temporary, 'wb');
            if ($output === false) {
                throw new RuntimeException('Unable to write a staged upload.');
            }
            $length = 0;
            try {
                $source = $upload->getStream();
                while (!$source->eof()) {
                    $chunk = $source->read(8192);
                    if ($chunk === '') {
                        if (!$source->eof()) throw new RuntimeException('The upload stream stopped unexpectedly.');
                        break;
                    }
                    $length += strlen($chunk);
                    if ($length > $maximum) {
                        throw new ApiProblem(413, 'FILE_TOO_LARGE', 'The file exceeds the upload limit.');
                    }
                    $offset = 0;
                    while ($offset < strlen($chunk)) {
                        $written = fwrite($output, substr($chunk, $offset));
                        if ($written === false || $written === 0) {
                            throw new RuntimeException('Could not write the private upload.');
                        }
                        $offset += $written;
                    }
                }
                if (!fflush($output)) {
                    throw new RuntimeException('Could not flush the private upload.');
                }
            } finally {
                fclose($output);
            }

            if ($length === 0 || ($declaredSize !== null && $length !== $declaredSize)) {
                throw new ApiProblem(422, 'INVALID_MEDIA', 'The uploaded file is empty or incomplete.');
            }

            $info = new \finfo(FILEINFO_MIME_TYPE);
            $detected = $info->file($temporary);
            if (!is_string($detected)) {
                throw new ApiProblem(415, 'UNSUPPORTED_MEDIA', 'The file format is not supported.');
            }
            // Some fileinfo databases use application/mp4 for ISO BMFF.
            if ($detected === 'application/mp4') $detected = 'video/mp4';
            $format = self::FORMATS[$detected] ?? null;
            if ($format === null || !in_array($clientExtension, $format['aliases'], true)) {
                throw new ApiProblem(415, 'UNSUPPORTED_MEDIA', 'The file format and extension must match an allowed type.');
            }
            if ($length > $limits->maxBytes($format['kind'])) {
                throw new ApiProblem(413, 'FILE_TOO_LARGE', 'The file exceeds the limit for this media type.');
            }

            if ($format['kind'] === 'image') {
                $dimensions = @getimagesize($temporary);
                if (!is_array($dimensions) || $dimensions[0] < 1 || $dimensions[1] < 1
                    || ($dimensions[0] * $dimensions[1]) > 24000000
                    || ($dimensions['mime'] ?? '') !== $detected) {
                    throw new ApiProblem(415, 'INVALID_MEDIA', 'Image contents could not be verified.');
                }
            } else {
                // Fileinfo alone is not enough; verify container signatures.
                $fh = fopen($temporary, 'rb');
                if ($fh === false) throw new RuntimeException('Cannot inspect uploaded media.');
                try {
                    $first = fread($fh, 4096);
                } finally {
                    fclose($fh);
                }
                $validContainer = $detected === 'video/mp4'
                    ? $length >= 16 && strlen($first) >= 16
                        && substr($first, 4, 4) === 'ftyp'
                        && unpack('N', substr($first, 0, 4))[1] >= 16
                    : strlen($first) >= 12 && str_starts_with($first, "\x1a\x45\xdf\xa3")
                        && str_contains($first, 'webm');
                if (!$validContainer) {
                    throw new ApiProblem(415, 'INVALID_MEDIA', 'Video container could not be verified.');
                }
            }

            $id = JsonFileRepository::uuid();
            $metadata = (object) [
                'schemaVersion' => 1,
                'id' => $id,
                'kind' => $format['kind'],
                'mimeType' => $detected,
                'extension' => $format['extension'],
                'sizeBytes' => $length,
                'originalName' => $original,
                'groupId' => $groupId,
                'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
            ];
            if (!$this->schemas->validate('media', $metadata)['valid']) {
                throw new RuntimeException('Generated media metadata failed schema validation.');
            }

            $destination = $directory . '/' . $id . '.' . $format['extension'];
            if (file_exists($destination) || is_link($destination) || !rename($temporary, $destination)) {
                throw new RuntimeException('Unable to finalize private upload.');
            }
            $publishedPath = $destination;
            // Group deletion and media assignment share the publication lock.
            // Hold it only for the metadata commit, not the file transfer.
            (new PublicationService($this->backendRoot))->exclusive(function () use ($groupId, $id, $metadata): void {
                $this->assertGroup($groupId);
                $this->repository->write('media', $id, $metadata, true);
            });
            $publishedPath = null; // metadata and binary file are now committed
            return $metadata;
        } finally {
            if (is_file($temporary)) @unlink($temporary);
            if ($publishedPath !== null && is_file($publishedPath)) @unlink($publishedPath);
        }
    }

    /** Assign a virtual home lesson without changing test references or physical media paths. */
    public function assignGroup(string $id, ?string $groupId): stdClass
    {
        if (!JsonFileRepository::validId($id)) {
            throw new ApiProblem(400, 'INVALID_ID', 'Invalid media identifier.');
        }
        return (new PublicationService($this->backendRoot))->exclusive(function () use ($id, $groupId): stdClass {
            $media = $this->repository->get('media', $id);
            if ($media === null) {
                throw new ApiProblem(404, 'NOT_FOUND', 'Media not found.');
            }
            $this->assertGroup($groupId);
            $media->groupId = $groupId;
            if (!$this->schemas->validate('media', $media)['valid']) {
                throw new ApiProblem(422, 'VALIDATION_FAILED', 'Invalid media metadata.');
            }
            $this->repository->write('media', $id, $media, false);
            return $media;
        });
    }

    private function assertGroup(?string $groupId): void
    {
        if ($groupId === null) return;
        if (!JsonFileRepository::validId($groupId)) {
            throw new ApiProblem(422, 'INVALID_GROUP', 'Invalid lesson identifier.');
        }
        if ($this->repository->get('groups', $groupId) === null) {
            throw new ApiProblem(422, 'GROUP_MISSING', 'The lesson does not exist.');
        }
    }

    public function find(string $id): ?stdClass
    {
        if (!JsonFileRepository::validId($id)) {
            throw new ApiProblem(400, 'INVALID_ID', 'Invalid media identifier.');
        }
        return $this->repository->get('media', $id);
    }

    /**
     * Only call while holding the publication lock and after verifying that
     * *all* draft and published tests no longer reference this media ID.
     * Rename the original first to allow rollback if metadata removal fails.
     */
    public function delete(stdClass $metadata): void
    {
        $source = $this->previewSource($metadata);
        $original = $source['path'];
        $staged = $original . '.deleting';
        if (file_exists($staged) || is_link($staged) || !rename($original, $staged)) {
            throw new RuntimeException('Unable to stage private media deletion.');
        }
        try {
            if (!$this->repository->delete('media', $metadata->id)) {
                throw new RuntimeException('Media metadata disappeared during deletion.');
            }
        } catch (\Throwable $e) {
            if (!rename($staged, $original)) {
                throw new RuntimeException('Unable to restore private media after failed deletion.', 0, $e);
            }
            throw $e;
        }
        // A crash here can leave a .deleting file, but it cannot remove an
        // in-use asset: its metadata was removed only under the shared lock.
        if (!unlink($staged)) {
            throw new RuntimeException('Unable to remove staged private media file.');
        }
    }

    /** @return array{path:string,size:int,mime:string} */
    public function previewSource(stdClass $metadata): array
    {
        $mime = $metadata->mimeType ?? null;
        $format = is_string($mime) ? (self::FORMATS[$mime] ?? null) : null;
        if ($format === null || ($metadata->extension ?? '') !== $format['extension']
            || ($metadata->kind ?? '') !== $format['kind']) {
            throw new RuntimeException('Stored media metadata is inconsistent.');
        }
        $directory = $this->fileDirectory(false);
        $path = $directory . '/' . $metadata->id . '.' . $format['extension'];
        if (is_link($path) || !is_file($path) || !is_readable($path)) {
            throw new ApiProblem(404, 'MEDIA_MISSING', 'Media file not found.');
        }
        $size = filesize($path);
        if ($size === false || $size < 1 || $size !== $metadata->sizeBytes) {
            throw new RuntimeException('The private media file differs from metadata.');
        }
        return ['path' => $path, 'size' => $size, 'mime' => $mime];
    }

    private function fileDirectory(bool $create): string
    {
        $directory = $this->root . '/media-files';
        if (is_link($directory)) {
            throw new RuntimeException('Private media directory cannot be a symbolic link.');
        }
        if (!is_dir($directory)) {
            if (!$create) throw new ApiProblem(404, 'MEDIA_MISSING', 'Media file not found.');
            if (!mkdir($directory, 0700) && !is_dir($directory)) {
                throw new RuntimeException('Cannot initialize private media directory.');
            }
        }
        return $directory;
    }
}
