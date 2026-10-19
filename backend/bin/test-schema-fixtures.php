<?php
declare(strict_types=1);

use TestBraid\Validation\PublicationValidator;
use TestBraid\Validation\SchemaValidator;

require dirname(__DIR__) . '/vendor/autoload.php';

// The same test script works both in the repository and in the deployed
// private backend, where the schemas are copied under backend/schemas.
$localSchemas = dirname(__DIR__) . '/schemas';
$repositorySchemas = dirname(__DIR__, 2) . '/schemas';
$schemas = is_file($localSchemas . '/test.schema.json') ? $localSchemas : $repositorySchemas;

$manifest = json_decode(file_get_contents($schemas . '/fixtures/manifest.json'), false, 512, JSON_THROW_ON_ERROR);
$validator = new SchemaValidator($schemas);
$publicationValidator = new PublicationValidator();
$groups = array_fill_keys($manifest->knownGroups, true);
$media = [];
foreach ($manifest->knownMedia as $item) {
    $media[$item->id] = $item->kind;
}
$groupExists = static fn (string $id): bool => isset($groups[$id]);
$mediaExists = static fn (string $id, string $kind): bool => ($media[$id] ?? null) === $kind;

$failed = 0;
foreach ($manifest->cases as $fixture) {
    $filename = $schemas . '/fixtures/' . $fixture->path;
    $data = json_decode(file_get_contents($filename), false, 512, JSON_THROW_ON_ERROR);
    if (!$data instanceof stdClass) {
        throw new RuntimeException('A schema fixture must be a JSON object.');
    }

    $structural = $validator->validate($fixture->kind, $data);
    $passed = $structural['valid'] === $fixture->structural;
    $description = $structural['valid'] ? 'structurally valid' : 'structurally invalid';

    if ($structural['valid'] && $fixture->kind === 'test' && property_exists($fixture, 'publish')) {
        $issues = $publicationValidator->validate($data, $groupExists, $mediaExists);
        $publishable = count($issues) === 0;
        $passed = $passed && $publishable === $fixture->publish;
        $description .= $publishable ? ', publishable' : ', not publishable';
    }

    if (!$passed) {
        $failed++;
    }
    echo ($passed ? 'PASS' : 'FAIL') . ' ' . $fixture->path . ': ' . $description . PHP_EOL;
}
$total = count($manifest->cases);
echo ($total - $failed) . '/' . $total . ' fixtures passed' . PHP_EOL;
exit($failed > 0 ? 1 : 0);
