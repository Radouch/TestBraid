<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use RuntimeException;

/**
 * One-time browser onboarding authorized by an SFTP-provisioned private key.
 * There is no unrestricted public registration: the secret must exist outside
 * the document root, and an author created by any method disables bootstrap.
 */
final class FirstAuthorSetup
{
    public function __construct(
        private readonly AuthorStore $authors,
        private readonly string $authorsFile,
        private readonly string $keyFile
    ) {
    }

    /** @return 'complete'|'ready'|'needs-key' */
    public function state(): string
    {
        if ($this->authors->hasAuthors()) {
            return 'complete';
        }
        return is_file($this->keyFile) ? 'ready' : 'needs-key';
    }

    /**
     * Atomically create only the FIRST author using the same lock as SSH
     * provisioning, preventing two concurrent setup requests from succeeding.
     *
     * @return array{state:'created', id:string}|array{state:'complete'|'needs-key'|'invalid-key'}
     */
    public function provision(string $username, string $password, string $providedKey): array
    {
        $directory = dirname($this->authorsFile);
        if (!is_dir($directory) || !is_writable($directory)) {
            throw new RuntimeException('Private author configuration directory is not writable.');
        }
        if (is_link($this->authorsFile) || is_link($this->keyFile)) {
            throw new RuntimeException('Refusing symlinked private configuration.');
        }

        $lock = fopen($directory . '/.authors.lock', 'c');
        if ($lock === false) {
            throw new RuntimeException('Cannot open the author configuration lock.');
        }
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Cannot lock author configuration.');
            }
            // Recheck under the lock even if GET /auth/session said setup was ready.
            if ($this->authors->hasAuthors()) {
                return ['state' => 'complete'];
            }
            if (!is_file($this->keyFile) || !is_readable($this->keyFile)) {
                return ['state' => 'needs-key'];
            }
            $key = file_get_contents($this->keyFile);
            if ($key === false) {
                throw new RuntimeException('Cannot read the private setup key.');
            }
            $key = trim($key);
            if (strlen($key) < 32 || strlen($key) > 256) {
                throw new RuntimeException('Private setup key must contain 32–256 characters.');
            }
            if (!hash_equals($key, $providedKey)) {
                return ['state' => 'invalid-key'];
            }

            // Do not silently overwrite a preexisting author configuration.
            if (is_file($this->authorsFile)) {
                throw new RuntimeException('Unexpected existing author configuration.');
            }

            $id = 'author-' . bin2hex(random_bytes(16));
            $data = ['users' => [[
                'id' => $id,
                'username' => $username,
                'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
            ]]];
            $temporary = tempnam($directory, '.authors-');
            if ($temporary === false) {
                throw new RuntimeException('Unable to create a private temporary credential file.');
            }
            try {
                if (!chmod($temporary, 0600)
                    || file_put_contents($temporary, json_encode($data, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n") === false
                    || !rename($temporary, $this->authorsFile)) {
                    throw new RuntimeException('Unable to atomically create the first author.');
                }
            } finally {
                if (file_exists($temporary)) {
                    unlink($temporary);
                }
            }

            // Even if deletion fails, a second setup is disabled by hasAuthors().
            if (!unlink($this->keyFile)) {
                error_log('TestBraid: first-author setup key cleanup failed.');
            }
            return ['state' => 'created', 'id' => $id];
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
