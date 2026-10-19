<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use RuntimeException;

/**
 * Persistent, flock-protected rate limit. IP and username are hashed before
 * filenames are created; caller input cannot escape the private directory.
 */
final class LoginLimiter
{
    private const WINDOW_SECONDS = 15 * 60;
    private const MAX_FAILURES = 6;

    public function __construct(private readonly string $directory)
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new RuntimeException('Unable to create the private login throttling directory.');
        }
    }

    public function allowed(string $ip, string $username): bool
    {
        foreach ($this->keys($ip, $username) as $key) {
            if (count($this->access($key, false)) >= self::MAX_FAILURES) {
                return false;
            }
        }
        return true;
    }

    public function failure(string $ip, string $username): void
    {
        foreach ($this->keys($ip, $username) as $key) {
            $this->access($key, true);
        }
    }

    private function keys(string $ip, string $username): array
    {
        // Rate-limit credential stuffing across IPs as well as repeated use of one IP.
        return ['ip:' . $ip, 'user:' . strtolower($username)];
    }

    /** @return list<int> */
    private function access(string $key, bool $recordFailure): array
    {
        $filename = $this->directory . '/' . hash('sha256', $key) . '.json';
        $stream = fopen($filename, 'c+b');
        if ($stream === false) {
            throw new RuntimeException('Unable to access the private login throttling state.');
        }
        try {
            @chmod($filename, 0600);
            if (!flock($stream, LOCK_EX)) {
                throw new RuntimeException('Unable to lock the login throttling state.');
            }
            $raw = stream_get_contents($stream);
            $entries = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($entries)) {
                throw new RuntimeException('Invalid login throttling state.');
            }
            $cutoff = time() - self::WINDOW_SECONDS;
            $entries = array_values(array_filter($entries, static fn ($time): bool =>
                is_int($time) && $time >= $cutoff
            ));
            if ($recordFailure) {
                $entries[] = time();
            }

            rewind($stream);
            if (!ftruncate($stream, 0)
                || fwrite($stream, json_encode($entries, JSON_THROW_ON_ERROR)) === false
                || !fflush($stream)) {
                throw new RuntimeException('Unable to persist the login throttling state.');
            }
            flock($stream, LOCK_UN);
            return $entries;
        } finally {
            fclose($stream);
        }
    }
}
