<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TestBraid\Http\JsonResponse;

/** Require a per-session header token for every mutating author API request. */
final class CsrfMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly SessionManager $sessions,
        private readonly ResponseFactoryInterface $factory
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (in_array(strtoupper($request->getMethod()), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $handler->handle($request);
        }

        // Origin rejection supplements the token; never trust an unverified proxy header.
        $origin = $request->getHeaderLine('Origin');
        if ($origin !== '') {
            $originHost = parse_url($origin, PHP_URL_HOST);
            if (!is_string($originHost) || !hash_equals(strtolower($request->getUri()->getHost()), strtolower($originHost))) {
                return JsonResponse::error($this->factory->createResponse(), 403, 'INVALID_ORIGIN', 'Request origin is not permitted.');
            }
        }

        if (!$this->sessions->csrfMatches($request->getHeaderLine('X-CSRF-Token'))) {
            return JsonResponse::error($this->factory->createResponse(), 403, 'INVALID_CSRF', 'Invalid or missing CSRF token.');
        }

        return $handler->handle($request);
    }
}
