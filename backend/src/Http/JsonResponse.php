<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ResponseInterface;

/** Centralize API serialization so errors cannot accidentally render HTML. */
final class JsonResponse
{
    public static function send(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR));

        return $response->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    public static function error(ResponseInterface $response, int $status, string $code, string $message): ResponseInterface
    {
        return self::send($response, [
            'error' => ['code' => $code, 'message' => $message],
        ], $status);
    }
}
