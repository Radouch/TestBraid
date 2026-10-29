<?php
declare(strict_types=1);

use TestBraid\Config\InstallationConfig;
use TestBraid\Publication\PublicationService;

require dirname(__DIR__) . '/vendor/autoload.php';

/**
 * Write the demo's public API responses as static files for GitHub Pages.
 *
 * Usage: php bin/export-static-demo.php <site-directory> <base-path>
 *   e.g. php bin/export-static-demo.php ../pages-site /TestBraid
 *
 * The learner screens only read api/public/config, api/public/catalog and
 * api/public/tests/<id>. This writes exactly those paths, produced by the same
 * services as a real installation, so the frontend runs unchanged against
 * them. It also copies the media files the tests reference into media/.
 *
 * Inputs: demo/storage (the published demo lessons) and demo/pages/app.json
 * (the demo site's name and languages). Nothing in the repository is written:
 * the services work on a temporary copy of the storage.
 */

if ($argc !== 3) {
    fwrite(STDERR, "Usage: php bin/export-static-demo.php <site-directory> <base-path>\n");
    exit(2);
}
[, $site, $basePath] = $argv;
$backend = dirname(__DIR__);
$demo = dirname($backend) . '/demo';
if (!is_dir($site) && !mkdir($site, 0755, true)) {
    fwrite(STDERR, "Cannot create $site\n");
    exit(1);
}
$site = (string) realpath($site);

function copyTree(string $source, string $target): void
{
    if (!is_dir($target)) mkdir($target, 0700, true);
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

/** Write one API response as a file named exactly like its URL path. */
function writeJson(string $file, mixed $data): void
{
    if (!is_dir(dirname($file))) mkdir(dirname($file), 0755, true);
    file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

$storage = sys_get_temp_dir() . '/testbraid-pages-' . bin2hex(random_bytes(8));
try {
    copyTree($demo . '/storage', $storage);
    putenv("TESTBRAID_STORAGE_DIR=$storage");
    putenv('TESTBRAID_APP_CONFIG_FILE=' . $demo . '/pages/app.json');
    // Media URLs and the frontend's base element both use this prefix.
    putenv("TESTBRAID_BASE_PATH=$basePath");

    $service = new PublicationService($backend, $site);
    writeJson("$site/api/public/config", InstallationConfig::publicConfiguration($backend));
    $catalog = $service->publicCatalog();
    writeJson("$site/api/public/catalog", $catalog);

    $media = 0;
    if (!is_dir("$site/media")) mkdir("$site/media", 0755, true);
    foreach ($catalog['groups'] as $group) {
        foreach ($group['tests'] as $summary) {
            $test = $service->publicTest($summary['id']);
            writeJson("$site/api/public/tests/{$summary['id']}", $test);
            foreach ((array) $test['mediaUrls'] as $url) {
                $name = basename((string) $url);
                if (!copy("$demo/storage/media-files/$name", "$site/media/$name")) {
                    throw new RuntimeException("Cannot copy media $name");
                }
                $media++;
            }
        }
    }
    printf("Exported %d lessons, %d tests and %d media references to %s\n",
        count($catalog['groups']), array_sum(array_map(static fn (array $g): int => count($g['tests']), $catalog['groups'])),
        $media, $site);
} finally {
    removeTree($storage);
}
