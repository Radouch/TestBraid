<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use RuntimeException;

/**
 * PHP-managed author sessions. Never accept session IDs via URLs, and never
 * let an HTTP deployment silently create production authentication cookies.
 */
final class SessionManager
{
    private const IDLE_SECONDS = 8 * 60 * 60;

    public function __construct(private readonly string $cookiePath)
    {
    }

    public function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // Only PHP's built-in CLI web server may use insecure test cookies.
        // The production Apache/PHP runtime always marks cookies Secure.
        $insecureLocal = PHP_SAPI === 'cli-server'
            && getenv('TESTBRAID_ALLOW_HTTP_LOCAL') === '1'
            && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);

        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_trans_sid', '0');
        session_name('TESTBRAIDSESSID');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => $this->cookiePath,
            'secure' => !$insecureLocal,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        if (!session_start()) {
            throw new RuntimeException('Unable to start the author session.');
        }

        if (isset($_SESSION['last_active']) && is_int($_SESSION['last_active'])
            && time() - $_SESSION['last_active'] > self::IDLE_SECONDS) {
            unset($_SESSION['author_id'], $_SESSION['authenticated_at']);
            // Expired authentication cannot keep its previous CSRF token.
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        $_SESSION['last_active'] = time();
    }

    public function csrfToken(): string
    {
        $this->start();
        if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];
    }

    public function csrfMatches(string $candidate): bool
    {
        return $candidate !== '' && hash_equals($this->csrfToken(), $candidate);
    }

    public function authorId(): ?string
    {
        $this->start();
        return isset($_SESSION['author_id']) && is_string($_SESSION['author_id'])
            ? $_SESSION['author_id'] : null;
    }

    /** Rotate both session ID and CSRF token at each privilege transition. */
    public function login(string $authorId): void
    {
        $this->start();
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Unable to rotate the session ID.');
        }
        $_SESSION['author_id'] = $authorId;
        $_SESSION['authenticated_at'] = time();
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    public function logout(): void
    {
        $this->start();
        $_SESSION = [];
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Unable to rotate the session ID.');
        }
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $_SESSION['last_active'] = time();
    }

    /**
     * Derive the cookie scope from the front controller's public URL.
     * /api/index.php -> / ; /subdir/api/index.php -> /subdir/
     */
    public static function cookiePathFromScript(string $scriptName): string
    {
        $normalized = str_replace('\\', '/', $scriptName);
        $index = strrpos($normalized, '/api/');
        if ($index === false) {
            return '/';
        }

        $prefix = substr($normalized, 0, $index);
        return $prefix === '' ? '/' : $prefix . '/';
    }
}
