<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;
use Slim\Routing\RouteCollectorProxy;
use TestBraid\Storage\BoundedFileStream;
use TestBraid\Storage\JsonFileRepository;
use stdClass;
use TestBraid\Storage\PrivateMediaService;
use TestBraid\Storage\UploadLimits;
use TestBraid\Publication\PublicationService;
use TestBraid\Validation\SchemaValidator;

/**
 * All media endpoints must remain within the existing author-guarded group.
 * Draft attachments are never served by an anonymous/static URL.
 */
final class AdminMediaRoutes
{
    private ?PrivateMediaService $service = null;

    public function __construct(private readonly string $backendRoot) {}

    public function register(RouteCollectorProxy $group): void
    {
        $group->get('/media', function (Request $request, Response $response): Response {
            $storage = new JsonFileRepository(getenv('TESTBRAID_STORAGE_DIR') ?: $this->backendRoot . '/storage');
            $usage = [];
            foreach ($storage->all('tests') as $test) {
                foreach ($this->testMediaReferences($test) as $mediaId) {
                    $usage[$mediaId][] = [
                        'id' => $test->id,
                        'title' => $test->title,
                        'status' => $test->status,
                    ];
                }
            }
            $items = [];
            foreach ($storage->all('media') as $media) {
                $items[] = [
                    'id' => $media->id,
                    'kind' => $media->kind,
                    'originalName' => $media->originalName,
                    'groupId' => $media->groupId ?? null,
                    'mimeType' => $media->mimeType,
                    'sizeBytes' => $media->sizeBytes,
                    'createdAt' => $media->createdAt,
                    'usedIn' => $usage[$media->id] ?? [],
                ];
            }
            usort($items, static fn (array $a, array $b): int =>
                strcmp($b['createdAt'], $a['createdAt']) ?: strcmp($a['id'], $b['id']));
            return JsonResponse::send($response, ['media' => $items]);
        });

        $group->get('/media/limits', function (Request $request, Response $response): Response {
            try {
                $limits = UploadLimits::fromBackendRoot($this->backendRoot);
                return JsonResponse::send($response, $limits->asResponse());
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        });

        $group->post('/media', function (Request $request, Response $response): Response {
            try {
                $limits = UploadLimits::fromBackendRoot($this->backendRoot);
                $contentType = strtolower($request->getHeaderLine('Content-Type'));
                if (!str_starts_with($contentType, 'multipart/form-data;')) {
                    throw new ApiProblem(400, 'INVALID_UPLOAD', 'A multipart file upload is required.');
                }
                $sizeHeader = $request->getHeaderLine('Content-Length');
                if ($sizeHeader !== '' && ctype_digit($sizeHeader)
                    && (float) $sizeHeader > max($limits->maxBytes('image'), $limits->maxBytes('video')) + 1048576) {
                    throw new ApiProblem(413, 'FILE_TOO_LARGE', 'Request exceeds the upload limit.');
                }
                $uploads = $request->getUploadedFiles();
                if (array_keys($uploads) !== ['file'] || !$uploads['file'] instanceof UploadedFileInterface) {
                    throw new ApiProblem(400, 'INVALID_UPLOAD', 'Upload exactly one file in the file field.');
                }
                $fields = $request->getParsedBody();
                if (!is_array($fields)) $fields = $_POST;
                if (!is_array($fields) || array_diff(array_keys($fields), ['groupId']) !== []) {
                    throw new ApiProblem(422, 'INVALID_UPLOAD', 'Unsupported upload fields.');
                }
                $groupId = $this->groupId($fields['groupId'] ?? null);
                $media = $this->service()->upload($uploads['file'], $groupId);
                return JsonResponse::send($response, [
                    'mediaId' => $media->id,
                    'kind' => $media->kind,
                    'mimeType' => $media->mimeType,
                    'sizeBytes' => $media->sizeBytes,
                    'originalName' => $media->originalName,
                    'groupId' => $media->groupId,
                ], 201);
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        });

        $group->get('/media/{id}', function (Request $request, Response $response, array $args): Response {
            try {
                $media = $this->service()->find($args['id']);
                if ($media === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Media not found.');
                }
                return JsonResponse::send($response, (array) $media);
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        });

        $group->patch('/media/{id}', function (Request $request, Response $response, array $args): Response {
            try {
                $fields = JsonRequest::fields($request, ['groupId']);
                $media = $this->service()->assignGroup($args['id'], $this->groupId($fields->groupId));
                return JsonResponse::send($response, (array) $media);
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        });

        $group->delete('/media/{id}', function (Request $request, Response $response, array $args): Response {
            try {
                $publisher = new PublicationService($this->backendRoot);
                return JsonResponse::send($response, $publisher->deleteUnusedMedia($args['id']));
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        });

        $preview = function (Request $request, Response $response, array $args): Response {
            try {
                $media = $this->service()->find($args['id']);
                if ($media === null) {
                    throw new ApiProblem(404, 'NOT_FOUND', 'Media not found.');
                }
                $source = $this->service()->previewSource($media);
                return $this->preview($request, $response, $source);
            } catch (ApiProblem $problem) {
                return JsonResponse::error($response, $problem->status, $problem->errorCode, $problem->getMessage());
            }
        };
        $group->map(['GET', 'HEAD'], '/media/{id}/preview', $preview);
    }

    private function groupId(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        if (!is_string($value) || !JsonFileRepository::validId($value)) {
            throw new ApiProblem(422, 'INVALID_GROUP', 'Invalid lesson identifier.');
        }
        return $value;
    }

    /** @return list<string> */
    private function testMediaReferences(stdClass $test): array
    {
        $refs = [];
        $blocks = static function (array $blocks) use (&$refs): void {
            foreach ($blocks as $block) {
                if ($block->type !== 'text') $refs[$block->mediaId] = true;
            }
        };
        foreach ($test->questions as $question) {
            $blocks($question->prompt);
            if ($question->type === 'choice') {
                foreach ($question->options as $option) $blocks($option->content);
            } else {
                foreach ($question->leftItems as $item) $blocks($item->content);
                foreach ($question->rightItems as $item) $blocks($item->content);
            }
        }
        return array_keys($refs);
    }

    /**
     * Supports single byte ranges for native browser video seeking; streams
     * only the requested bytes, no full-video buffering in PHP memory.
     *
     * @param array{path:string,size:int,mime:string} $source
     */
    private function preview(Request $request, Response $response, array $source): Response
    {
        $size = $source['size'];
        $rangeHeader = $request->getHeaderLine('Range');
        $start = 0;
        $end = $size - 1;
        $partial = false;
        if ($rangeHeader !== '') {
            if (!preg_match('/^bytes=(\d*)-(\d*)$/D', trim($rangeHeader), $match)
                || ($match[1] === '' && $match[2] === '')
                || strlen($match[1]) > 18 || strlen($match[2]) > 18) {
                return $this->rangeNotSatisfiable($response, $size);
            }
            if ($match[1] === '') {
                $suffix = (int) $match[2];
                if ($suffix === 0) return $this->rangeNotSatisfiable($response, $size);
                $start = max(0, $size - $suffix);
            } else {
                $start = (int) $match[1];
                if ($start >= $size) return $this->rangeNotSatisfiable($response, $size);
                if ($match[2] !== '') {
                    $requestedEnd = (int) $match[2];
                    if ($requestedEnd < $start) return $this->rangeNotSatisfiable($response, $size);
                    $end = min($requestedEnd, $size - 1);
                }
            }
            $partial = true;
        }

        $length = $end - $start + 1;
        $response = $response->withStatus($partial ? 206 : 200)
            ->withHeader('Content-Type', $source['mime'])
            ->withHeader('Content-Disposition', 'inline')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Cache-Control', 'private, no-store')
            ->withHeader('Accept-Ranges', 'bytes')
            ->withHeader('Content-Length', (string) $length)
            ->withHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        if ($partial) {
            $response = $response->withHeader('Content-Range', "bytes $start-$end/$size");
        }
        if ($request->getMethod() === 'HEAD') {
            return $response;
        }
        $file = fopen($source['path'], 'rb');
        if ($file === false) {
            throw new \RuntimeException('Private media preview could not be opened.');
        }
        return $response->withBody(new BoundedFileStream($file, $start, $length));
    }

    private function rangeNotSatisfiable(Response $response, int $size): Response
    {
        return $response->withStatus(416)
            ->withHeader('Content-Range', "bytes */$size")
            ->withHeader('Accept-Ranges', 'bytes')
            ->withHeader('Cache-Control', 'private, no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    private function service(): PrivateMediaService
    {
        if ($this->service !== null) return $this->service;

        $deployed = $this->backendRoot . '/schemas';
        $source = dirname($this->backendRoot) . '/schemas';
        $schemas = is_file($deployed . '/media.schema.json') ? $deployed : $source;
        return $this->service = new PrivateMediaService($this->backendRoot, new SchemaValidator($schemas));
    }
}
