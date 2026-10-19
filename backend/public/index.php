<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

// This file is private on production hosting. The public api/index.php
// only delegates to it, so Composer dependencies stay outside the web root.
require dirname(__DIR__) . '/vendor/autoload.php';

$app = AppFactory::create();
$app->addRoutingMiddleware();

// Never expose PHP stack traces or filesystem paths in an HTTP response.
$app->addErrorMiddleware(false, true, true);

$app->get('/api/health', static function (Request $request, Response $response): Response {
    // Keep the health response minimal: it is intentionally public.
    $body = json_encode([
        'status' => 'ok',
        'service' => 'testbraid-api',
    ], JSON_THROW_ON_ERROR);

    $response->getBody()->write($body);
    return $response
        ->withHeader('Content-Type', 'application/json; charset=utf-8')
        ->withHeader('Cache-Control', 'no-store');
});

// No login, data storage or file uploads until authorization is implemented.
$app->run();
