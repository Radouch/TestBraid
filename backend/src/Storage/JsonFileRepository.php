<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use DomainException;
use RuntimeException;
use stdClass;

/**
 * Private file-per-entity JSON repository for small PoC installations.
 *
 * All writers of one entity kind share flock on a stable lock file; temp files
 * are written in the destination directory and renamed only after completion.
 * Readers see either the previous complete document or the new complete one.
 * This does not supply multi-file transactions or edit conflict resolution.
 */
class JsonFileRepository
{
    private const KINDS = ['groups', 'tests', 'media'];

    public function __construct(private readonly string $root, ?string $publicRoot = null)
    {
        $this->ensureDirectory($this->root);
        // Placement is an operator decision. The author-only installation
        // diagnostic reports potentially exposed storage instead of blocking
        // application requests based on unreliable CGI document roots.
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
            . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    public static function validId(string $id): bool
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $id) === 1;
    }

    public function get(string $kind, string $id): ?stdClass
    {
        $path = $this->path($kind, $id);
        if (is_link($path)) {
            throw new RuntimeException('Refusing a symbolic link in private storage.');
        }
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        if ($raw === false || strlen($raw) > 1048576) {
            throw new RuntimeException('Cannot safely read the private JSON record.');
        }
        try {
            $value = json_decode($raw, false, 128, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new RuntimeException('Corrupt private JSON record.', 0, $e);
        }
        if (!$value instanceof stdClass || ($value->id ?? null) !== $id) {
            throw new RuntimeException('Private record ID or structure is invalid.');
        }
        return $value;
    }

    /** @return list<stdClass> */
    public function all(string $kind): array
    {
        $directory = $this->directory($kind);
        $entries = glob($directory . '/*.json');
        if ($entries === false) {
            throw new RuntimeException('Unable to list private records.');
        }
        $items = [];
        foreach ($entries as $entry) {
            $id = basename($entry, '.json');
            if (!self::validId($id)) {
                throw new RuntimeException('Unexpected private record filename.');
            }
            $record = $this->get($kind, $id);
            if ($record !== null) {
                $items[] = $record;
            }
        }
        usort($items, static fn (stdClass $a, stdClass $b): int => strcmp($a->id, $b->id));
        return $items;
    }

    /**
     * Write new or existing canonical entity. Caller is responsible for JSON
     * Schema validation and all authorization/semantic checks before calling.
     */
    public function write(string $kind, string $id, stdClass $document, bool $create): void
    {
        if (($document->id ?? null) !== $id) {
            throw new DomainException('Document ID does not match storage ID.');
        }
        $path = $this->path($kind, $id);
        $directory = dirname($path);
        $lock = fopen($directory . '/.write.lock', 'c+b');
        if ($lock === false) {
            throw new RuntimeException('Cannot open private storage lock.');
        }

        $temporary = null;
        try {
            @chmod($directory . '/.write.lock', 0600);
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Cannot lock private storage.');
            }
            if (is_link($path)) {
                throw new RuntimeException('Refusing a symbolic link in private storage.');
            }
            if ($create && file_exists($path)) {
                throw new DomainException('Entity already exists.');
            }
            if (!$create && !is_file($path)) {
                throw new DomainException('Cannot update a missing entity.');
            }

            $json = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
            if (strlen($json) > 1048576) {
                throw new DomainException('Document exceeds the storage limit.');
            }
            $temporary = tempnam($directory, '.record-');
            if ($temporary === false) {
                throw new RuntimeException('Cannot create temporary private JSON file.');
            }
            if (!chmod($temporary, 0600)) {
                throw new RuntimeException('Cannot restrict private JSON file permissions.');
            }
            $stream = fopen($temporary, 'wb');
            if ($stream === false) {
                throw new RuntimeException('Cannot open temporary private JSON file.');
            }
            try {
                $length = strlen($json);
                $offset = 0;
                while ($offset < $length) {
                    $written = fwrite($stream, substr($json, $offset));
                    if ($written === false || $written === 0) {
                        throw new RuntimeException('Partial private JSON write.');
                    }
                    $offset += $written;
                }
                if (!fflush($stream)) {
                    throw new RuntimeException('Failed to flush private JSON file.');
                }
                if (function_exists('fsync') && !fsync($stream)) {
                    throw new RuntimeException('Failed to sync private JSON file.');
                }
            } finally {
                fclose($stream);
            }

            // Overridable in an isolated test to simulate a failed rename.
            $this->promote($temporary, $path);
        } finally {
            if ($temporary !== null && file_exists($temporary)) {
                unlink($temporary);
            }
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * Permanently remove a single private JSON record.
     *
     * Use the same per-kind write lock as write(), so an in-flight atomic
     * rename cannot resurrect a deleted entity. Cross-entity reference
     * checks belong to the caller under the publication lock.
     */
    public function delete(string $kind, string $id): bool
    {
        $path = $this->path($kind, $id);
        $directory = dirname($path);
        $lockPath = $directory . '/.write.lock';
        if (is_link($lockPath)) {
            throw new RuntimeException('Refusing a symbolic link for private storage lock.');
        }
        $lock = fopen($lockPath, 'c+b');
        if ($lock === false) {
            throw new RuntimeException('Cannot open private storage lock.');
        }
        try {
            @chmod($lockPath, 0600);
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Cannot lock private storage.');
            }
            if (is_link($path)) {
                throw new RuntimeException('Refusing a symbolic link in private storage.');
            }
            if (!is_file($path)) {
                return false;
            }
            if (!unlink($path)) {
                throw new RuntimeException('Unable to delete private JSON record.');
            }
            return true;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    protected function promote(string $temporary, string $destination): void
    {
        if (!rename($temporary, $destination)) {
            throw new RuntimeException('Unable to replace private JSON record atomically.');
        }
    }

    private function path(string $kind, string $id): string
    {
        if (!self::validId($id)) {
            throw new DomainException('Invalid entity identifier.');
        }
        return $this->directory($kind) . '/' . $id . '.json';
    }

    private function directory(string $kind): string
    {
        if (!in_array($kind, self::KINDS, true)) {
            throw new DomainException('Unsupported private entity kind.');
        }
        $dir = rtrim($this->root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $kind;
        $this->ensureDirectory($dir);
        return $dir;
    }

    private function ensureDirectory(string $directory): void
    {
        if (is_link($directory)) {
            throw new RuntimeException('Refusing a symbolic link for private storage.');
        }
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Cannot initialize private storage directory.');
        }
    }
}
