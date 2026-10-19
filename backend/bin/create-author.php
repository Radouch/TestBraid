<?php
declare(strict_types=1);

// Provision authors via SSH. Read the password from STDIN, never process arguments.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}
$username = $argv[1] ?? '';
if (!is_string($username) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $username)) {
    fwrite(STDERR, "Usage: php bin/create-author.php <username> < password-from-stdin\n");
    exit(2);
}
$password = stream_get_contents(STDIN, 8193);
if (!is_string($password)) {
    fwrite(STDERR, "Cannot read password from STDIN.\n");
    exit(2);
}
$password = rtrim($password, "\r\n");
if (strlen($password) < 12 || strlen($password) > 4096) {
    fwrite(STDERR, "Password must contain 12–4096 bytes.\n");
    exit(2);
}
$filename = getenv('TESTBRAID_AUTHORS_FILE') ?: dirname(__DIR__) . '/config/authors.json';
$directory = dirname($filename);
umask(0077);
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
    fwrite(STDERR, "Cannot create a private config directory.\n");
    exit(2);
}
if (is_link($filename)) {
    fwrite(STDERR, "Refusing a symlinked author configuration.\n");
    exit(2);
}
// Serialize concurrent CLI changes and replace the JSON atomically.
$lock = fopen($directory . '/.authors.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    fwrite(STDERR, "Cannot lock the configuration file.\n");
    exit(2);
}
try {
    $data = ['users' => []];
    if (is_file($filename)) {
        $raw = file_get_contents($filename);
        $data = json_decode($raw ?: '', true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !isset($data['users']) || !is_array($data['users'])) {
            throw new RuntimeException('Invalid author configuration.');
        }
    }
    foreach ($data['users'] as $user) {
        if (($user['username'] ?? null) === $username) {
            throw new RuntimeException('An author with this username already exists.');
        }
    }
    $data['users'][] = [
        'id' => 'author-' . bin2hex(random_bytes(16)),
        'username' => $username,
        'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
    ];
    $temp = tempnam($directory, '.authors-');
    if ($temp === false) throw new RuntimeException('Cannot create a temporary file.');
    try {
        chmod($temp, 0600);
        if (file_put_contents($temp, json_encode($data, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n") === false
            || !rename($temp, $filename)) {
            throw new RuntimeException('Cannot write author configuration.');
        }
    } finally {
        if (file_exists($temp)) unlink($temp);
    }
    echo "Author provisioned: " . $username . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}
