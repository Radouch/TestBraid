<?php
declare(strict_types=1);

use TestBraid\Publication\PublicationService;
use TestBraid\Storage\JsonFileRepository;
use TestBraid\Validation\SchemaValidator;

require dirname(__DIR__) . '/vendor/autoload.php';

/**
 * Verify the demo lesson shipped in install packages (repository demo/).
 *
 * The demo is copied verbatim into a fresh installation as already published
 * data, so it never passes through the editor's checks. This test runs it
 * through the real services in a disposable directory instead: every record
 * must match its schema and its media file, the public catalog must list it,
 * and an author must be able to unpublish, republish and fully remove it.
 */

$backend = dirname(__DIR__);
$demo = dirname($backend) . '/demo/storage';
$failures = 0;
function check(bool $passed, string $label): void
{
    global $failures;
    if (!$passed) $failures++;
    echo ($passed ? 'PASS' : 'FAIL') . ' ' . $label . PHP_EOL;
}

/** @return array<string, stdClass> Records of one kind, keyed by ID. */
function records(string $directory): array
{
    $result = [];
    foreach (glob($directory . '/*.json') ?: [] as $path) {
        $record = json_decode((string) file_get_contents($path), false, 128, JSON_THROW_ON_ERROR);
        $result[basename($path, '.json')] = $record;
    }
    return $result;
}

function copyTree(string $source, string $target): void
{
    mkdir($target, 0700, true);
    foreach (new DirectoryIterator($source) as $item) {
        if ($item->isDot()) continue;
        $item->isDir()
            ? copyTree($item->getPathname(), $target . '/' . $item->getFilename())
            : copy($item->getPathname(), $target . '/' . $item->getFilename());
    }
}

function removeTree(string $path): void
{
    if (!is_dir($path)) return;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    rmdir($path);
}

// 1. Static checks on the committed files.
$schemas = new SchemaValidator(dirname($backend) . '/schemas');
$kinds = ['groups' => 'group', 'tests' => 'test', 'media' => 'media'];
$data = [];
foreach ($kinds as $directory => $schema) {
    $data[$directory] = records($demo . '/' . $directory);
    foreach ($data[$directory] as $id => $record) {
        check(JsonFileRepository::validId($id) && $record->id === $id, "$directory/$id has a UUIDv4 matching its file name");
        check($schemas->validate($schema, $record)['valid'], "$directory/$id matches the $schema schema");
    }
}
// The home page lists only tests whose content language matches the
// interface language, so each supplied interface language needs its own lesson.
check(count($data['groups']) === 2 && count($data['tests']) === 4, 'demo has two lessons and four tests');
foreach (['en', 'cs'] as $language) {
    $tests = array_filter($data['tests'], static fn (stdClass $test): bool => $test->language === $language);
    $lessons = array_unique(array_map(static fn (stdClass $test): string => $test->groupId, $tests));
    check(count($tests) === 2 && count($lessons) === 1, "demo has one $language lesson with two $language tests");
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
foreach ($data['media'] as $id => $media) {
    $file = $demo . '/media-files/' . $id . '.' . $media->extension;
    check(is_file($file) && filesize($file) === $media->sizeBytes, "media $id file exists with the recorded size");
    check(is_file($file) && $finfo->file($file) === $media->mimeType, "media $id content is really {$media->mimeType}");
}
$files = array_map('basename', glob($demo . '/media-files/*') ?: []);
check(count($files) === count($data['media']), 'every private media file has metadata');

// 2. Run the demo through the real publication services in a temporary site.
$root = sys_get_temp_dir() . '/testbraid-demo-' . bin2hex(random_bytes(8));
$storage = $root . '/storage';
$web = $root . '/www';
try {
    copyTree($demo, $storage);
    mkdir($web . '/media', 0700, true);
    file_put_contents($web . '/media/.htaccess', "# Disposable fixture\n");
    // An install package ships the public copies too; mirror that layout.
    foreach ($files as $name) copy($demo . '/media-files/' . $name, $web . '/media/' . $name);
    putenv("TESTBRAID_STORAGE_DIR=$storage");
    $service = new PublicationService($backend, $web);

    $catalog = $service->publicCatalog()['groups'];
    $languages = array_map(static fn (array $group): array => array_unique(array_column($group['tests'], 'language')), $catalog);
    check(count($catalog) === 2 && array_sum(array_map(static fn (array $group): int => count($group['tests']), $catalog)) === 4,
        'public catalog lists both demo lessons with all four tests');
    check(array_map('array_values', $languages) === [['en'], ['cs']], 'each listed demo lesson is in one language: English first, then Czech');
    foreach (array_keys($data['tests']) as $id) {
        $public = $service->publicTest((string) $id);
        foreach ((array) $public['mediaUrls'] as $url) {
            check(is_file($web . '/media/' . basename($url)), "public copy of $url is shipped");
        }
    }

    // Republishing proves the data passes every publication rule.
    foreach (array_keys($data['tests']) as $id) {
        $service->unpublish((string) $id);
        check($service->publish((string) $id)->status === 'published', "test $id can be unpublished and republished");
    }

    // The removal steps documented in the author guide must all succeed.
    $repository = new JsonFileRepository($storage, $web);
    foreach (array_keys($data['tests']) as $id) {
        $service->unpublish((string) $id);
        check($repository->delete('tests', (string) $id), "test $id can be deleted after unpublishing");
    }
    $remaining = array_diff(scandir($web . '/media') ?: [], ['.', '..', '.htaccess']);
    check($remaining === [], 'unpublishing removes all public demo media copies');
    foreach (array_keys($data['media']) as $id) {
        $service->deleteUnusedMedia((string) $id);
    }
    check(records($storage . '/media') === [], 'all demo media can be deleted once unused');
    foreach (array_keys($data['groups']) as $id) {
        check($repository->delete('groups', (string) $id), "the empty demo lesson $id can be deleted");
    }
} catch (Throwable $error) {
    check(false, 'publication round trip: ' . $error->getMessage());
} finally {
    removeTree($root);
}

echo ($failures === 0 ? 'Demo content is valid' : "$failures demo check(s) failed") . PHP_EOL;
exit($failures === 0 ? 0 : 1);
