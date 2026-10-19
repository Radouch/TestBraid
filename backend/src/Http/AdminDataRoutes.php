<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;
use stdClass;
use TestBraid\Storage\JsonFileRepository;
use TestBraid\Validation\SchemaValidator;

/**
 * First persistence API. All routes MUST be installed only in the existing
 * authenticated /api/admin route group with CSRF middleware.
 *
 * No publish transition exists here; published documents are not mutable
 * until media/publication consistency is implemented in the later milestone.
 */
final class AdminDataRoutes
{
    private ?JsonFileRepository $storage = null;
    private ?SchemaValidator $schemas = null;

    public function __construct(private readonly string $backendRoot)
    {
    }

    public function register(RouteCollectorProxy $group): void
    {
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

        $group->post('/tests', fn (Request $r, Response $p): Response => $this->handle($p, function () use ($r): stdClass {
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
        }, 201));

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

        $group->put('/tests/{id}', fn (Request $r, Response $p, array $args): Response =>
            $this->handle($p, function () use ($r, $args): stdClass {
                $id = $this->id($args['id']);
                $previous = $this->store()->get('tests', $id);
                if ($previous === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Test not found.');
                }
                if ($previous->status !== 'draft') {
                    throw new ApiProblem(409, 'PUBLISHED_EDIT_UNAVAILABLE', 'Published test editing is not yet available.');
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
                $this->store()->write('tests', $id, $test, false);
                return $test;
            })
        );
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
        return $this->schemas ??= new SchemaValidator($this->backendRoot . '/schemas');
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
