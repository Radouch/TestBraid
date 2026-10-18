<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

// The environment-specific location may differ on Apache shared hosting.
$backendRoot = getenv('TESTBRAID_BACKEND_ROOT') ?: dirname(__DIR__);
require $backendRoot . '/vendor/autoload.php';

$app = AppFactory::create();
$app->addRoutingMiddleware();
$app->addErrorMiddleware(false, true, true);

$app->get('/api/health', static function (Request $request, Response $response): Response {
    $body = json_encode([
        'status' => 'ok',
        'service' => 'testbraid-api',
    ], JSON_THROW_ON_ERROR);

    $response->getBody()->write($body);
    return $response
        ->withHeader('Content-Type', 'application/json; charset=utf-8')
        ->withHeader('Cache-Control', 'no-store');
});

// Deliberately no admin/auth/media endpoints until their security is implemented.
$app->run();
