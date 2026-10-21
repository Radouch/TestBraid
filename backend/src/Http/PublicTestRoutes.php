<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use TestBraid\Publication\PublicationService;

/**
 * Anonymous published-test metadata endpoint.
 * Publication status is checked on every request; cache is disabled.
 */
final class PublicTestRoutes
{
    private ?PublicationService $publication = null;

    public function __construct(private readonly string $backendRoot) {}

    public function register(App $app): void
    {
        // Anonymous listing intentionally exposes only published test
        // summaries under lessons that have at least one published test.
        $app->get('/api/public/catalog', function (Request $request, Response $response): Response {
            return JsonResponse::send($response, $this->publisher()->publicCatalog());
        });

        $app->get('/api/public/tests/{id}', function (Request $request, Response $response, array $args): Response {
            try {
                return JsonResponse::send($response, $this->publisher()->publicTest($args['id']));
            } catch (ApiProblem $error) {
                return JsonResponse::error($response, $error->status, $error->errorCode, $error->getMessage());
            }
        });
    }

    private function publisher(): PublicationService
    {
        return $this->publication ??= new PublicationService($this->backendRoot);
    }
}
