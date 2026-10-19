<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use RuntimeException;

/** Loads provisioned authors from a file outside Apache's public document root. */
final class AuthorStore
{
    public function __construct(private readonly string $filename)
    {
    }

    /** A valid existing account permanently disables browser bootstrap. */
    public function hasAuthors(): bool
    {
        return count($this->all()) > 0;
    }

    public function byUsername(string $username): ?array
    {
        foreach ($this->all() as $user) {
            if (hash_equals($user['username'], $username)) {
                return $user;
            }
        }
        return null;
    }

    public function byId(string $id): ?array
    {
        foreach ($this->all() as $user) {
            if (hash_equals($user['id'], $id)) {
                return $user;
            }
        }
        return null;
    }

    /** @return list<array{id:string,username:string,passwordHash:string}> */
    private function all(): array
    {
        if (!is_file($this->filename)) {
            return [];
        }
        $raw = file_get_contents($this->filename);
        if ($raw === false) {
            throw new RuntimeException('Author configuration is unreadable.');
        }
        $parsed = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($parsed) || !isset($parsed['users']) || !is_array($parsed['users'])) {
            throw new RuntimeException('Author configuration is invalid.');
        }

        $users = [];
        foreach ($parsed['users'] as $user) {
            if (!is_array($user) || !is_string($user['id'] ?? null)
                || !is_string($user['username'] ?? null) || !is_string($user['passwordHash'] ?? null)) {
                throw new RuntimeException('Author configuration contains an invalid account.');
            }
            $users[] = $user;
        }
        return $users;
    }
}
