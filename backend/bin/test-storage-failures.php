<?php
declare(strict_types=1);

use TestBraid\Storage\JsonFileRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

/** Simulate a failed atomic rename after a complete temporary write. */
class FailingRepository extends JsonFileRepository
{
    protected function promote(string $temporary, string $destination): void
    {
        throw new RuntimeException('Injected atomic promotion failure.');
    }
}

$root = sys_get_temp_dir() . '/testbraid-storage-test-' . bin2hex(random_bytes(8));
mkdir($root, 0700, true);
try {
    $normal = new JsonFileRepository($root);
    $failed = new FailingRepository($root);
    $id = JsonFileRepository::uuid();
    $document = (object) ['id' => $id, 'name' => 'Original'];
    $normal->write('groups', $id, $document, true);
    if ($normal->get('groups', $id)?->name !== 'Original') {
        throw new RuntimeException('Initial JSON write was lost.');
    }

    try {
        $failed->write('groups', $id, (object) ['id' => $id, 'name' => 'Replacement'], false);
        throw new RuntimeException('Expected the injected rename failure.');
    } catch (RuntimeException $error) {
        if ($error->getMessage() !== 'Injected atomic promotion failure.') {
            throw $error;
        }
    }
    if ($normal->get('groups', $id)?->name !== 'Original') {
        throw new RuntimeException('A failed replacement corrupted the original document.');
    }
    if (glob($root . '/groups/.record-*') !== []) {
        throw new RuntimeException('Failed replacement leaked a temporary private file.');
    }

    foreach (['../escape', '/etc/passwd', 'foo/bar', '%2e%2e', 'abc', str_repeat('a', 128)] as $unsafe) {
        if (JsonFileRepository::validId($unsafe)) {
            throw new RuntimeException('Unsafe path ID passed validation.');
        }
        try {
            $normal->get('groups', $unsafe);
            throw new RuntimeException('Unsafe path ID was accepted.');
        } catch (DomainException) {
            // Expected.
        }
    }
    if (!JsonFileRepository::validId($id)) {
        throw new RuntimeException('Generated UUID v4 is not a valid entity ID.');
    }
    $items = $normal->all('groups');
    if (count($items) !== 1 || $items[0]->id !== $id) {
        throw new RuntimeException('Repository listing does not match persisted data.');
    }

    echo "PASS: atomic write rollback, temporary cleanup, path validation and listing\n";
} finally {
    foreach (glob($root . '/groups/*') ?: [] as $filename) {
        unlink($filename);
    }
    foreach (glob($root . '/groups/.*') ?: [] as $filename) {
        if (is_file($filename)) unlink($filename);
    }
    if (is_dir($root . '/groups')) rmdir($root . '/groups');
    rmdir($root);
}
