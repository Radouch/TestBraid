<?php
declare(strict_types=1);

namespace TestBraid\Publication;

use RuntimeException;
use stdClass;
use TestBraid\Http\ApiProblem;
use TestBraid\Storage\JsonFileRepository;
use TestBraid\Storage\PrivateMediaService;
use TestBraid\Validation\PublicationValidator;
use TestBraid\Validation\SchemaValidator;

/**
 * Publish transition and immutable Apache-served media copies.
 *
 * All test mutations (including draft edits) must use the same publication
 * lock to avoid stale draft writes overtaking a publish transition.
 *
 * Filesystem changes are not a multi-file transaction. Promoting public files
 * first guarantees that a newly visible test never points at missing assets.
 * Rollback removes newly exposed copies on a rejected/failed metadata write.
 * Safe cleanup can be repeated after an interrupted operation.
 */
class PublicationService
{
    private JsonFileRepository $store;
    private PrivateMediaService $media;
    private SchemaValidator $schemas;
    private PublicationValidator $rules;
    private string $publicDir;
    private string $storageDir;
    private string $basePath;

    public function __construct(
        private readonly string $backendRoot,
        ?string $publicRoot = null
    ) {
        $publicRoot ??= defined('TESTBRAID_PUBLIC_ROOT')
            ? (string) constant('TESTBRAID_PUBLIC_ROOT')
            : '';
        $canonicalPublic = $publicRoot !== '' ? realpath($publicRoot) : false;
        if ($canonicalPublic === false) {
            throw new RuntimeException('Public directory must be configured by a trusted bootstrap.');
        }

        $this->storageDir = rtrim(getenv('TESTBRAID_STORAGE_DIR') ?: $backendRoot . '/storage', DIRECTORY_SEPARATOR);
        $this->store = new JsonFileRepository($this->storageDir, $canonicalPublic);
        $deployed = $backendRoot . '/schemas';
        $source = dirname($backendRoot) . '/schemas';
        $this->schemas = new SchemaValidator(is_file($deployed . '/test.schema.json') ? $deployed : $source);
        $this->rules = new PublicationValidator();
        $this->media = new PrivateMediaService($backendRoot, $this->schemas);
        $this->publicDir = $canonicalPublic . '/media';

        $configuredBase = getenv('TESTBRAID_BASE_PATH');
        $this->basePath = is_string($configuredBase) ? rtrim($configuredBase, '/') : '';
        if ($this->basePath !== '' &&
            !preg_match('~^/(?:[A-Za-z0-9._-]+)(?:/[A-Za-z0-9._-]+)*$~D', $this->basePath)) {
            throw new RuntimeException('Invalid application base path.');
        }
    }

    /**
     * Serialize every draft or publication write through one stable lock.
     * The lock file itself is private; it never sits in the Apache directory.
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    public function exclusive(callable $callback): mixed
    {
        $file = $this->storageDir . '/.publication.lock';
        if (is_link($file)) throw new RuntimeException('Refusing publication lock symlink.');
        $lock = fopen($file, 'c+b');
        if ($lock === false) throw new RuntimeException('Cannot open publication lock.');
        try {
            @chmod($file, 0600);
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Cannot acquire publication lock.');
            }
            return $callback();
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function publish(string $id): stdClass
    {
        return $this->exclusive(function () use ($id): stdClass {
            $old = $this->findTest($id);
            if ($old->status !== 'draft') {
                throw new ApiProblem(409, 'ALREADY_PUBLISHED', 'The test is already published.');
            }
            $next = clone $old;
            $next->status = 'published';
            $next->publishedAt = self::now();
            $next->updatedAt = self::now();
            return $this->commitPublished($next);
        });
    }

    public function unpublish(string $id): stdClass
    {
        return $this->exclusive(function () use ($id): stdClass {
            $old = $this->findTest($id);
            if ($old->status !== 'published') {
                throw new ApiProblem(409, 'NOT_PUBLISHED', 'Only published tests can be withdrawn.');
            }
            $this->assertPublicDirectory();
            $next = clone $old;
            $next->status = 'draft';
            $next->publishedAt = null;
            $next->updatedAt = self::now();
            $this->persist($next);
            // Once hidden from public JSON, remove copies not referenced by any
            // remaining published test. Failures here can leave orphan copies;
            // the next successful transition or an explicit reconciliation
            // removes them safely, never deleting an in-use shared asset.
            $this->reconcileUnlocked();
            return $next;
        });
    }

    /**
     * Called inside exclusive() after validation and draft/editable-field
     * normalization by the HTTP layer. Published updates remain live.
     */
    public function replacePublished(stdClass $next): stdClass
    {
        if ($next->status !== 'published') {
            throw new ApiProblem(409, 'INVALID_STATE', 'A published update requires published status.');
        }
        return $this->commitPublished($next);
    }

    /**
     * A deliberately small anonymous catalog: only groups containing at
     * least one published test, and only safe learner-facing metadata.
     *
     * Never serialize full private test/group records here: draft titles,
     * answer keys, private media IDs and unpublished lesson names must not
     * escape through a list endpoint. Each test's detail route independently
     * checks its current published status after a withdrawal.
     *
     * @return array{groups: list<array{id: string, name: string, tests: list<array{id: string, title: string, language: string}>}>}
     */
    public function publicCatalog(): array
    {
        $groups = [];
        foreach ($this->store->all('groups') as $group) {
            $groups[$group->id] = ['id' => $group->id, 'name' => $group->name, 'tests' => []];
        }

        foreach ($this->store->all('tests') as $test) {
            if (($test->status ?? null) !== 'published'
                || !is_string($test->groupId ?? null)
                || !isset($groups[$test->groupId])) {
                continue;
            }
            $groups[$test->groupId]['tests'][] = [
                'id' => $test->id,
                'title' => $test->title,
                'language' => $test->language,
            ];
        }

        $publishedGroups = [];
        foreach ($groups as $group) {
            if ($group['tests'] === []) {
                continue;
            }
            usort($group['tests'], static fn (array $a, array $b): int =>
                strnatcasecmp($a['title'], $b['title']) ?: strcmp($a['id'], $b['id'])
            );
            $publishedGroups[] = $group;
        }
        usort($publishedGroups, static fn (array $a, array $b): int =>
            strnatcasecmp($a['name'], $b['name']) ?: strcmp($a['id'], $b['id'])
        );

        return ['groups' => $publishedGroups];
    }

    public function publicTest(string $id): array
    {
        if (!JsonFileRepository::validId($id)) {
            throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
        }
        $test = $this->store->get('tests', $id);
        if ($test === null || $test->status !== 'published') {
            throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
        }
        $urls = [];
        foreach ($this->references($test) as $id => $kind) {
            $media = $this->store->get('media', $id);
            if ($media === null || $media->kind !== $kind) {
                throw new RuntimeException('Published test has inconsistent media.');
            }
            $urls[$id] = $this->publicUrl($media);
        }
        return ['test' => $test, 'mediaUrls' => (object) $urls];
    }

    private function commitPublished(stdClass $next): stdClass
    {
        $this->assertPublicDirectory();
        if (!$this->schemas->validate('test', $next)['valid']) {
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'The test fails schema validation.');
        }
        $issues = $this->rules->validate(
            $next,
            fn (string $groupId): bool => JsonFileRepository::validId($groupId)
                && $this->store->get('groups', $groupId) !== null,
            function (string $mediaId, string $kind): bool {
                if (!JsonFileRepository::validId($mediaId)) return false;
                $meta = $this->store->get('media', $mediaId);
                return $meta !== null && $meta->kind === $kind;
            }
        );
        if ($issues !== []) {
            throw new ApiProblem(422, 'NOT_PUBLISHABLE', 'The test is incomplete or has invalid references.');
        }

        $files = [];
        foreach ($this->references($next) as $id => $kind) {
            $metadata = $this->store->get('media', $id);
            if ($metadata === null || $metadata->kind !== $kind) {
                throw new ApiProblem(422, 'MEDIA_MISSING', 'A referenced media file is missing.');
            }
            try {
                $files[] = [$this->media->previewSource($metadata), $this->publicPath($metadata)];
            } catch (ApiProblem) {
                throw new ApiProblem(422, 'MEDIA_MISSING', 'A referenced media file is missing.');
            }
        }

        $created = [];
        try {
            foreach ($files as [$source, $target]) {
                if (is_link($target)) throw new RuntimeException('Refusing published media symlink.');
                if (is_file($target)) {
                    if (filesize($target) !== $source['size']
                        || !hash_equals(hash_file('sha256', $target), hash_file('sha256', $source['path']))) {
                        throw new RuntimeException('Published media does not match its validated private source.');
                    }
                    continue;
                }
                $this->publishCopy($source['path'], $target);
                $created[] = $target;
            }
            $this->persist($next);
        } catch (\Throwable $e) {
            // A public copy created by this request may repair a missing file
            // that another published test already references. Never roll such
            // a repair back, even if this new publication fails afterwards.
            try {
                $active = $this->activeFiles();
                foreach ($created as $path) {
                    if (!isset($active[basename($path)]) && !is_link($path) && is_file($path)) {
                        @unlink($path);
                    }
                }
            } catch (\Throwable $rollbackError) {
                // Fail closed on uncertainty: retain copies rather than
                // delete an asset used by a currently published test.
                error_log('TestBraid publication rollback requires reconciliation: ' . get_class($rollbackError));
            }
            throw $e;
        }
        // Best effort cleanup only AFTER the newly published test is visible.
        // Garbage collection must never remove media referenced by another test.
        try {
            $this->reconcileUnlocked();
        } catch (\Throwable $e) {
            error_log('TestBraid publication cleanup failed: ' . get_class($e));
        }
        return $next;
    }

    /** Atomic final pathname promotion of a complete, validated binary. */
    protected function publishCopy(string $source, string $target): void
    {
        $temporary = tempnam($this->publicDir, '.stage-');
        if ($temporary === false) throw new RuntimeException('Cannot stage published media.');
        try {
            $input = fopen($source, 'rb');
            $output = fopen($temporary, 'wb');
            if ($input === false || $output === false) {
                if (is_resource($input)) fclose($input);
                if (is_resource($output)) fclose($output);
                throw new RuntimeException('Cannot stream staged media.');
            }
            try {
                $total = stream_copy_to_stream($input, $output);
                if ($total === false || !fflush($output)) {
                    throw new RuntimeException('Could not finish staging published media.');
                }
                if (function_exists('fsync') && !fsync($output)) {
                    throw new RuntimeException('Could not sync staged published media.');
                }
            } finally {
                fclose($input);
                fclose($output);
            }
            if (filesize($temporary) !== filesize($source)
                || !hash_equals(hash_file('sha256', $temporary), hash_file('sha256', $source))) {
                throw new RuntimeException('Staged public copy differs from private media.');
            }
            if (!chmod($temporary, 0644) || is_link($target)
                || file_exists($target) || !rename($temporary, $target)) {
                throw new RuntimeException('Cannot promote staged media.');
            }
        } finally {
            if (is_file($temporary)) @unlink($temporary);
        }
    }

    protected function persist(stdClass $test): void
    {
        $this->store->write('tests', $test->id, $test, false);
    }

    /** @return array<string, string> map mediaId -> kind */
    private function references(stdClass $test): array
    {
        $refs = [];
        $blocks = static function (array $list) use (&$refs): void {
            foreach ($list as $block) {
                if ($block->type !== 'text') $refs[$block->mediaId] = $block->type;
            }
        };
        foreach ($test->questions as $q) {
            $blocks($q->prompt);
            if ($q->type === 'choice') {
                foreach ($q->options as $item) $blocks($item->content);
            } else {
                foreach ($q->leftItems as $item) $blocks($item->content);
                foreach ($q->rightItems as $item) $blocks($item->content);
            }
        }
        return $refs;
    }

    private function publicPath(stdClass $media): string
    {
        if (!JsonFileRepository::validId($media->id)
            || !in_array($media->extension, ['jpg', 'png', 'webp', 'mp4', 'webm'], true)) {
            throw new RuntimeException('Invalid public media metadata.');
        }
        return $this->publicDir . '/' . $media->id . '.' . $media->extension;
    }

    private function publicUrl(stdClass $media): string
    {
        return $this->basePath . '/media/' . basename($this->publicPath($media));
    }

    private function findTest(string $id): stdClass
    {
        if (!JsonFileRepository::validId($id)) {
            throw new ApiProblem(400, 'INVALID_ID', 'Invalid test identifier.');
        }
        $test = $this->store->get('tests', $id);
        if ($test === null) throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
        return $test;
    }

    /**
     * Called with publication lock held. Prune only allowlisted media names
     * that are unreferenced by every currently published test.
     */
    public function reconcile(): void
    {
        $this->exclusive(fn () => $this->reconcileUnlocked());
    }

    /** @return array<string, true> Filenames still needed by published tests. */
    private function activeFiles(): array
    {
        $active = [];
        foreach ($this->store->all('tests') as $test) {
            if ($test->status !== 'published') continue;
            foreach ($this->references($test) as $id => $_kind) {
                $meta = $this->store->get('media', $id);
                if ($meta !== null) $active[basename($this->publicPath($meta))] = true;
            }
        }
        return $active;
    }

    private function reconcileUnlocked(): void
    {
        $this->assertPublicDirectory();
        $active = $this->activeFiles();
        $iterator = new \DirectoryIterator($this->publicDir);
        foreach ($iterator as $item) {
            if ($item->isDot()) continue;
            $name = $item->getFilename();
            // An interrupted stream_copy_to_stream can leave an unpublished
            // temporary stage. It cannot be in use: every publisher holds the
            // same exclusive lock. Apache denies all .stage-* paths.
            if (preg_match('/^\\.stage-[A-Za-z0-9]{6}$/D', $name)) {
                if ($item->isLink() || !$item->isFile() || !unlink($item->getPathname())) {
                    throw new RuntimeException('Cannot remove abandoned publication stage.');
                }
                continue;
            }
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|mp4|webm)$/D', $name)) continue;
            if ($item->isLink()) throw new RuntimeException('Refusing public media symlink during reconciliation.');
            if (!isset($active[$name]) && $item->isFile() && !unlink($item->getPathname())) {
                throw new RuntimeException('Cannot clean up obsolete public media.');
            }
        }
    }

    private function assertPublicDirectory(): void
    {
        // Do not create a publicly writable folder until the operator has
        // deployed protective Apache rules. Never follow a directory symlink.
        if (is_link($this->publicDir) || !is_dir($this->publicDir)
            || !is_file($this->publicDir . '/.htaccess')
            || is_link($this->publicDir . '/.htaccess')) {
            throw new RuntimeException('Protected public media directory is missing.');
        }
    }

    private static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
}
