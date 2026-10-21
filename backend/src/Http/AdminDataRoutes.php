<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;
use stdClass;
use TestBraid\Publication\PublicationService;
use TestBraid\Storage\JsonFileRepository;
use TestBraid\Validation\SchemaValidator;

/**
 * First persistence API. All routes MUST be installed only in the existing
 * authenticated /api/admin route group with CSRF middleware.
 *
 * Publication transitions and published updates go through PublicationService.
 * All updates of test documents share its private publication lock.
 */
final class AdminDataRoutes
{
    private ?JsonFileRepository $storage = null;
    private ?SchemaValidator $schemas = null;
    private ?PublicationService $publication = null;

    public function __construct(private readonly string $backendRoot)
    {
    }

    public function register(RouteCollectorProxy $group): void
    {
        // Troubleshooting endpoint intentionally lives behind the author and
        // CSRF-protected admin route group. Never return absolute filesystem
        // paths, environment values or unfiltered PHP exception messages.
        $group->get('/storage-diagnostics', fn (Request $r, Response $p): Response =>
            JsonResponse::send($p, $this->storageDiagnostics())
        );

        // Inspect web PHP runtime and effective author cookie policy without
        // disclosing absolute paths, credentials or phpinfo() output.
        $group->get('/environment-diagnostics', static fn (Request $r, Response $p): Response =>
            JsonResponse::send($p, EnvironmentDiagnostics::collect())
        );

        $group->get('/groups', fn (Request $r, Response $p): Response => $this->handle($p, function (): array {
            return ['groups' => $this->store()->all('groups')];
        }));

        $group->post('/groups', fn (Request $r, Response $p): Response => $this->handle($p, function () use ($r): stdClass {
            $data = JsonRequest::fields($r, ['name']);
            $group = (object) [
                'schemaVersion' => 1,
                'id' => JsonFileRepository::uuid(),
                'name' => $data->name,
                'createdAt' => self::now(),
                'updatedAt' => self::now(),
            ];
            if (!is_string($data->name) || trim($data->name) === '') {
                throw new ApiProblem(422, 'VALIDATION_FAILED', 'Group name is required.');
            }
            $this->validate('group', $group);
            $this->store()->write('groups', $group->id, $group, true);
            return $group;
        }, 201));

        $group->patch('/groups/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, function () use ($r, $args): stdClass {
                $id = $this->id($args['id']);
                $existing = $this->store()->get('groups', $id);
                if ($existing === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Group not found.');
                }
                $data = JsonRequest::fields($r, ['name']);
                if (!is_string($data->name) || trim($data->name) === '') {
                    throw new ApiProblem(422, 'VALIDATION_FAILED', 'Group name is required.');
                }
                $existing->name = $data->name;
                $existing->updatedAt = self::now();
                $this->validate('group', $existing);
                $this->store()->write('groups', $id, $existing, false);
                return $existing;
            })
        );

        // Never cascade-delete lesson content: require the group to be empty.
        // Serialize with test creation/updates to prevent orphaned group IDs.
        $group->delete('/groups/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): array =>
                $this->publisher()->exclusive(function () use ($args): array {
                    $id = $this->id($args['id']);
                    if ($this->store()->get('groups', $id) === null) {
                        throw new ApiProblem(404, 'NOT_FOUND', 'Group not found.');
                    }
                    foreach ($this->store()->all('tests') as $test) {
                        if ($test->groupId === $id) {
                            throw new ApiProblem(409, 'GROUP_NOT_EMPTY', 'Move or delete all tests before removing this group.');
                        }
                    }
                    if (!$this->store()->delete('groups', $id)) {
                        throw new ApiProblem(404, 'NOT_FOUND', 'Group not found.');
                    }
                    return ['deleted' => true, 'id' => $id];
                })
            )
        );

        $group->get('/tests', fn (Request $r, Response $p): Response => $this->handle($p, function () use ($r): array {
            $params = $r->getQueryParams();
            if (array_diff(array_keys($params), ['groupId']) !== []) {
                throw new ApiProblem(400, 'INVALID_QUERY', 'Unsupported query parameter.');
            }
            $filter = $params['groupId'] ?? null;
            if ($filter !== null && !is_string($filter)) {
                throw new ApiProblem(400, 'INVALID_QUERY', 'Invalid group filter.');
            }
            if (is_string($filter)) {
                $this->id($filter);
            }
            $tests = $this->store()->all('tests');
            if ($filter !== null) {
                $tests = array_values(array_filter($tests, static fn (stdClass $test): bool => $test->groupId === $filter));
            }
            return ['tests' => $tests];
        }));

        $group->post('/tests', fn (Request $r, Response $p): Response => $this->handle($p, fn (): stdClass =>
            $this->publisher()->exclusive(function () use ($r): stdClass {
            $data = JsonRequest::fields($r, ['groupId', 'language', 'title', 'description'], ['questions']);
            $this->checkGroup($data->groupId);
            $test = (object) [
                'schemaVersion' => 1,
                'id' => JsonFileRepository::uuid(),
                'groupId' => $data->groupId,
                'language' => $data->language,
                'title' => $data->title,
                'description' => $data->description,
                'status' => 'draft',
                'createdAt' => self::now(),
                'updatedAt' => self::now(),
                'publishedAt' => null,
                'questions' => $data->questions ?? [],
            ];
            $this->validate('test', $test);
            $this->checkDraft($test);
            $this->store()->write('tests', $test->id, $test, true);
            return $test;
            })
        , 201));

        $group->get('/tests/readiness', fn (Request $r, Response $p): Response =>
            $this->handle($p, fn (): array => ['tests' => $this->publisher()->readiness()])
        );

        $group->post('/tests/{id}/duplicate', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): stdClass => $this->publisher()->exclusive(function () use ($args): stdClass {
                $id = $this->id($args['id']);
                $source = $this->store()->get('tests', $id);
                if ($source === null) throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                $this->checkGroup($source->groupId);
                $copy = clone $source;
                $copy->id = JsonFileRepository::uuid();
                $copy->title = mb_substr($source->title, 0, 243) . ' (copy)';
                $copy->status = 'draft';
                $copy->publishedAt = null;
                $copy->createdAt = self::now();
                $copy->updatedAt = self::now();
                $this->validate('test', $copy);
                $this->store()->write('tests', $copy->id, $copy, true);
                return $copy;
            }), 201)
        );

        $group->get('/tests/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, function () use ($args): stdClass {
                $id = $this->id($args['id']);
                $test = $this->store()->get('tests', $id);
                if ($test === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                }
                return $test;
            })
        );

        // Deletion is explicit and limited to drafts. Published tests must
        // first be withdrawn so that public media references are reconciled.
        // Private original uploads are intentionally never deleted here.
        $group->delete('/tests/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): array =>
                $this->publisher()->exclusive(function () use ($args): array {
                    $id = $this->id($args['id']);
                    $test = $this->store()->get('tests', $id);
                    if ($test === null) {
                        throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                    }
                    if ($test->status !== 'draft') {
                        throw new ApiProblem(409, 'TEST_PUBLISHED', 'Unpublish the test before deleting it.');
                    }
                    if (!$this->store()->delete('tests', $id)) {
                        throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                    }
                    return ['deleted' => true, 'id' => $id];
                })
            )
        );

        $group->put('/tests/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): stdClass =>
                $this->publisher()->exclusive(function () use ($r, $args): stdClass {
                $id = $this->id($args['id']);
                $previous = $this->store()->get('tests', $id);
                if ($previous === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                }
                // Replace all editable fields. Server-owned fields are preserved.
                $data = JsonRequest::fields($r, ['groupId', 'language', 'title', 'description', 'questions']);
                $this->checkGroup($data->groupId);
                $test = (object) [
                    'schemaVersion' => $previous->schemaVersion,
                    'id' => $previous->id,
                    'groupId' => $data->groupId,
                    'language' => $data->language,
                    'title' => $data->title,
                    'description' => $data->description,
                    'status' => $previous->status,
                    'createdAt' => $previous->createdAt,
                    'updatedAt' => self::now(),
                    'publishedAt' => $previous->publishedAt,
                    'questions' => $data->questions,
                ];
                $this->validate('test', $test);
                $this->checkDraft($test);
                if ($previous->status === 'published') {
                    return $this->publisher()->replacePublished($test);
                }
                $this->store()->write('tests', $id, $test, false);
                return $test;
                })
            )
        );

        $group->post('/tests/{id}/publish', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): stdClass => $this->publisher()->publish($this->id($args['id'])))
        );
        $group->post('/tests/{id}/unpublish', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, fn (): stdClass => $this->publisher()->unpublish($this->id($args['id'])))
        );
    }

    /**
     * Diagnose host-specific storage failures from web PHP (which may run
     * as a different OS user or see a different DOCUMENT_ROOT than PHP CLI).
     *
     * The final listing probe performs the same initialization as GET /groups.
     * Only boolean flags and a small allowlist of storage errors are
     * returned; never expose filesystem paths, environment values or secrets.
     *
     * @return array<string, bool|string|null>
     */
    private function storageDiagnostics(): array
    {
        $configured = getenv('TESTBRAID_STORAGE_DIR');
        $root = is_string($configured) && $configured !== ''
            ? $configured
            : $this->backendRoot . '/storage';
        $root = rtrim($root, DIRECTORY_SEPARATOR);
        $groups = $root . '/groups';
        $rootResolved = realpath($root);
        $publicSetting = $_SERVER['DOCUMENT_ROOT'] ?? '';
        $publicResolved = is_string($publicSetting) && $publicSetting !== ''
            ? realpath($publicSetting)
            : false;
        $servedPublicSetting = defined('TESTBRAID_PUBLIC_ROOT')
            ? (string) constant('TESTBRAID_PUBLIC_ROOT')
            : $publicSetting;
        $servedPublicResolved = is_string($servedPublicSetting) && $servedPublicSetting !== ''
            ? realpath($servedPublicSetting)
            : false;

        $status = [
            'storageDirectoryExists' => is_dir($root),
            'storageDirectoryWritable' => is_writable($root),
            'groupsDirectoryExists' => is_dir($groups),
            'groupsDirectoryWritable' => is_writable($groups),
            'storageIsSymbolicLink' => is_link($root),
            'documentRootResolved' => $publicResolved !== false,
            'publicRootSource' => defined('TESTBRAID_PUBLIC_ROOT') ? 'bootstrap' : 'document-root-fallback',
            'servedPublicRootResolved' => $servedPublicResolved !== false,
            'storageUnderServedPublicRoot' => $rootResolved !== false && $servedPublicResolved !== false
                ? $rootResolved === $servedPublicResolved
                    || str_starts_with($rootResolved, $servedPublicResolved . DIRECTORY_SEPARATOR)
                : null,
            // This is informational: DOCUMENT_ROOT may be an ancestor of the
            // actual served root when the host uses aliases or rewrites.
            'storageUnderDocumentRoot' => $rootResolved !== false && $publicResolved !== false
                ? $rootResolved === $publicResolved
                    || str_starts_with($rootResolved, $publicResolved . DIRECTORY_SEPARATOR)
                : null,
            'storageOverrideConfigured' => is_string($configured) && $configured !== '',
            'groupListing' => 'not-checked',
            'failure' => null,
        ];

        try {
            // This is the same safe, idempotent operation as GET /groups.
            $this->store()->all('groups');
            $status['groupListing'] = 'ok';
        } catch (\Throwable $e) {
            error_log('TestBraid storage diagnostic probe failed: ' . get_class($e));
            $status['groupListing'] = 'failed';
            $message = $e->getMessage();
            $safeMessages = [
                'Cannot initialize private storage directory.',
                'Private storage cannot be located within the public document root.',
                'Refusing a symbolic link for private storage.',
                'Unable to list private records.',
                'Unexpected private record filename.',
                'Refusing a symbolic link in private storage.',
                'Cannot safely read the private JSON record.',
                'Corrupt private JSON record.',
                'Private record ID or structure is invalid.',
            ];
            $status['failure'] = in_array($message, $safeMessages, true)
                ? $message
                : 'Unexpected storage error (' . get_class($e) . ').';
        }

        // The listing operation may have created storage/ and groups/.
        // Report the resulting filesystem state, not a stale preflight state.
        clearstatcache(true);
        $status['storageDirectoryExists'] = is_dir($root);
        $status['storageDirectoryWritable'] = is_writable($root);
        $status['groupsDirectoryExists'] = is_dir($groups);
        $status['groupsDirectoryWritable'] = is_writable($groups);
        $rootResolved = realpath($root);
        $status['storageUnderDocumentRoot'] = $rootResolved !== false && $publicResolved !== false
            ? $rootResolved === $publicResolved
                || str_starts_with($rootResolved, $publicResolved . DIRECTORY_SEPARATOR)
            : null;
        $status['storageUnderServedPublicRoot'] = $rootResolved !== false && $servedPublicResolved !== false
            ? $rootResolved === $servedPublicResolved
                || str_starts_with($rootResolved, $servedPublicResolved . DIRECTORY_SEPARATOR)
            : null;

        return $status;
    }

    private function publisher(): PublicationService
    {
        return $this->publication ??= new PublicationService($this->backendRoot);
    }

    private function store(): JsonFileRepository
    {
        // Lazy initialization: /api/health and login must keep working even if
        // a new host has not granted write permission to the storage folder.
        return $this->storage ??= new JsonFileRepository(
            getenv('TESTBRAID_STORAGE_DIR') ?: $this->backendRoot . '/storage'
        );
    }

    private function validator(): SchemaValidator
    {
        if ($this->schemas !== null) {
            return $this->schemas;
        }

        // Production copies schemas into the private backend; a source checkout
        // keeps the same canonical schemas at the repository root. Resolve both
        // layouts, as the standalone schema fixture runner already does.
        $deployedSchemas = $this->backendRoot . '/schemas';
        $checkoutSchemas = dirname($this->backendRoot) . '/schemas';
        $directory = is_file($deployedSchemas . '/test.schema.json')
            ? $deployedSchemas
            : $checkoutSchemas;

        return $this->schemas = new SchemaValidator($directory);
    }

    private function validate(string $kind, stdClass $document): void
    {
        $result = $this->validator()->validate($kind, $document);
        if (!$result['valid']) {
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'JSON document does not match its schema.');
        }
    }

    private function checkGroup(mixed $value): void
    {
        if (!is_string($value) || !JsonFileRepository::validId($value)) {
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'A valid group ID is required.');
        }
        if ($this->store()->get('groups', $value) === null) {
            throw new ApiProblem(422, 'GROUP_MISSING', 'The referenced group does not exist.');
        }
    }

    private function checkDraft(stdClass $document): void
    {
        if (count($document->questions) > 200) {
            throw new ApiProblem(422, 'TOO_MANY_QUESTIONS', 'A draft can contain at most 200 questions.');
        }

        // Media metadata must exist and have the correct kind, even for drafts.
        // This does not publish any files or create public media URLs.
        foreach ($document->questions as $question) {
            $this->checkBlocks($question->prompt);
            if ($question->type === 'choice') {
                foreach ($question->options as $option) {
                    $this->checkBlocks($option->content);
                }
            } else {
                foreach ([$question->leftItems, $question->rightItems] as $items) {
                    foreach ($items as $item) {
                        $this->checkBlocks($item->content);
                    }
                }
            }
        }
    }

    /** @param list<stdClass> $blocks */
    private function checkBlocks(array $blocks): void
    {
        foreach ($blocks as $block) {
            if ($block->type === 'text') {
                continue;
            }
            if (!JsonFileRepository::validId($block->mediaId)) {
                throw new ApiProblem(422, 'MEDIA_MISSING', 'Referenced media does not exist.');
            }
            $media = $this->store()->get('media', $block->mediaId);
            if ($media === null || ($media->kind ?? null) !== $block->type) {
                throw new ApiProblem(422, 'MEDIA_MISSING', 'Referenced media does not exist or has a different type.');
            }
        }
    }

    private function id(string $value): string
    {
        if (!JsonFileRepository::validId($value)) {
            throw new ApiProblem(400, 'INVALID_ID', 'Invalid resource ID.');
        }
        return $value;
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    /**
     * Convert only anticipated request errors into safe public responses.
     * Filesystem failures bubble into Slim's generic 500 without leaking paths.
     *
     * @param callable(): mixed $callback
     */
    private function handle(Response $response, callable $callback, int $success = 200): Response
    {
        try {
            $result = $callback();
            return JsonResponse::send($response, (array) $result, $success);
        } catch (ApiProblem $e) {
            return JsonResponse::error($response, $e->status, $e->errorCode, $e->getMessage());
        }
    }
}
