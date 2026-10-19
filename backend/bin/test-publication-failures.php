<?php
declare(strict_types=1);

use TestBraid\Publication\PublicationService;
use TestBraid\Storage\JsonFileRepository;

require dirname(__DIR__) . '/vendor/autoload.php';

/**
 * Verify an exception after public copies have been staged leaves both the
 * old private test document and public state intact. This isolated CLI test
 * uses a disposable web root; it never accesses a deployed host.
 */
class FailingPublicationService extends PublicationService
{
    protected function persist(stdClass $test): void
    {
        throw new RuntimeException('Injected publication metadata failure.');
    }
}

$backend = dirname(__DIR__);
$root = sys_get_temp_dir() . '/testbraid-publish-failure-' . bin2hex(random_bytes(8));
$web = $root . '/www';
$storage = $root . '/private-storage';
mkdir($web . '/media', 0700, true);
file_put_contents($web . '/media/.htaccess', "# Private fixture: Apache deny rules are tested separately\n");
putenv("TESTBRAID_STORAGE_DIR=$storage");
$repository = new JsonFileRepository($storage, $web);

try {
    $gid = JsonFileRepository::uuid();
    $mid = JsonFileRepository::uuid();
    $tid = JsonFileRepository::uuid();
    $now = '2026-10-19T19:00:00Z';

    $repository->write('groups', $gid, (object) [
        'schemaVersion' => 1, 'id' => $gid, 'name' => 'Example',
        'createdAt' => $now, 'updatedAt' => $now,
    ], true);

    mkdir($storage . '/media-files', 0700);
    $image = base64_decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAALHwEDmIWXfgAAAABJRU5ErkJggg==',
        true
    );
    if ($image === false) throw new RuntimeException('Broken PNG fixture.');
    file_put_contents($storage . '/media-files/' . $mid . '.png', $image);
    $repository->write('media', $mid, (object) [
        'schemaVersion' => 1, 'id' => $mid, 'kind' => 'image', 'mimeType' => 'image/png',
        'extension' => 'png', 'sizeBytes' => strlen($image),
        'originalName' => 'test.png', 'createdAt' => $now,
    ], true);

    $question = (object) [
        'id' => 'q1', 'type' => 'choice', 'mode' => 'single',
        'prompt' => [(object) ['id' => 'p1', 'type' => 'image', 'mediaId' => $mid]],
        'options' => [
            (object) ['id' => 'o1', 'content' => [(object) ['id' => 'a1', 'type' => 'text', 'text' => 'A']]],
            (object) ['id' => 'o2', 'content' => [(object) ['id' => 'a2', 'type' => 'text', 'text' => 'B']]],
        ],
        'correctOptionIds' => ['o1'],
    ];
    $draft = (object) [
        'schemaVersion' => 1, 'id' => $tid, 'groupId' => $gid,
        'language' => 'en', 'title' => 'Draft', 'description' => '',
        'status' => 'draft', 'createdAt' => $now, 'updatedAt' => $now,
        'publishedAt' => null, 'questions' => [$question],
    ];
    $repository->write('tests', $tid, $draft, true);

    $failing = new FailingPublicationService($backend, $web);
    try {
        $failing->publish($tid);
        throw new RuntimeException('The injected metadata failure did not fire.');
    } catch (RuntimeException $e) {
        if ($e->getMessage() !== 'Injected publication metadata failure.') throw $e;
    }
    $stored = $repository->get('tests', $tid);
    if ($stored?->status !== 'draft' || $stored->publishedAt !== null
        || file_exists($web . '/media/' . $mid . '.png')) {
        throw new RuntimeException('Failed publication leaked a file or changed the canonical document.');
    }

    // Simulate a crash after creating an orphaned public copy but before
    // completing the test's status change. Reconciliation removes the orphan.
    copy($storage . '/media-files/' . $mid . '.png', $web . '/media/' . $mid . '.png');
    $normal = new PublicationService($backend, $web);
    $normal->reconcile();
    if (file_exists($web . '/media/' . $mid . '.png')) {
        throw new RuntimeException('Reconciliation did not clean orphaned public media.');
    }

    echo "PASS: failed publication preserves JSON, removes new public copies and reconciles orphans\n";
} finally {
    putenv('TESTBRAID_STORAGE_DIR');
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($files as $file) {
        if ($file->isLink()) throw new RuntimeException('Unexpected symlink in test fixture.');
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }
    rmdir($root);
}
