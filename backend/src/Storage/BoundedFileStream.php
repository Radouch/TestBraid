<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use Psr\Http\Message\StreamInterface;
use RuntimeException;

/**
 * Bounded seekable view of a private file for HTTP byte-range responses.
 * The stream never exposes bytes outside the requested range, regardless of
 * how the PSR-7 emitter chooses its read chunk size.
 */
final class BoundedFileStream implements StreamInterface
{
    /** @var resource|null */
    private $file;
    private int $position = 0;

    /** @param resource $file */
    public function __construct($file, private readonly int $start, private readonly int $length)
    {
        if (!is_resource($file) || $start < 0 || $length < 0 || fseek($file, $start) !== 0) {
            throw new RuntimeException('Cannot initialize private media stream.');
        }
        $this->file = $file;
    }

    public function __toString(): string
    {
        try {
            $this->rewind();
            return $this->getContents();
        } catch (\Throwable) {
            return '';
        }
    }

    public function close(): void
    {
        if (is_resource($this->file)) {
            fclose($this->file);
        }
        $this->file = null;
    }

    public function detach()
    {
        // The resource cannot be detached without escaping the range boundary.
        $this->close();
        return null;
    }

    public function getSize(): ?int { return $this->length; }

    public function tell(): int { return $this->position; }

    public function eof(): bool { return $this->position >= $this->length; }

    public function isSeekable(): bool { return is_resource($this->file); }

    public function seek(int $offset, int $whence = SEEK_SET): void
    {
        $target = match ($whence) {
            SEEK_SET => $offset,
            SEEK_CUR => $this->position + $offset,
            SEEK_END => $this->length + $offset,
            default => throw new RuntimeException('Invalid media stream seek mode.'),
        };
        if (!is_resource($this->file) || $target < 0 || $target > $this->length
            || fseek($this->file, $this->start + $target, SEEK_SET) !== 0) {
            throw new RuntimeException('Media stream seek failed.');
        }
        $this->position = $target;
    }

    public function rewind(): void { $this->seek(0); }

    public function isWritable(): bool { return false; }

    public function write(string $string): int
    {
        throw new RuntimeException('Private media streams are read-only.');
    }

    public function isReadable(): bool { return is_resource($this->file); }

    public function read(int $length): string
    {
        if ($length < 0 || !is_resource($this->file)) {
            throw new RuntimeException('Invalid private media stream read.');
        }
        if ($length === 0 || $this->eof()) {
            return '';
        }
        $data = fread($this->file, min($length, $this->length - $this->position));
        if ($data === false || $data === '') {
            throw new RuntimeException('Private media stream could not be read.');
        }
        $this->position += strlen($data);
        return $data;
    }

    public function getContents(): string
    {
        $result = '';
        while (!$this->eof()) {
            $result .= $this->read(8192);
        }
        return $result;
    }

    public function getMetadata(?string $key = null)
    {
        if (!is_resource($this->file)) {
            return $key === null ? [] : null;
        }
        // Do not expose the underlying absolute filesystem URI to consumers.
        $metadata = stream_get_meta_data($this->file);
        unset($metadata['uri']);
        return $key === null ? $metadata : ($metadata[$key] ?? null);
    }

    public function __destruct() { $this->close(); }
}
