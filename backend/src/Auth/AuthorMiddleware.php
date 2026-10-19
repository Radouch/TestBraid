<?php
declare(strict_types=1);

namespace TestBraid\Auth;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Http\Message\ResponseInterface;
use TestBraid\Http\JsonResponse;

/** A Vue navigation guard cannot replace server-side authorization. */
final class AuthorMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly SessionManager $sessions,
        private readonly AuthorStore $authors,
        private readonly ResponseFactoryInterface $factory
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $id = $this->sessions->authorId();
        $author = $id === null ? null : $this->authors->byId($id);
        if ($author === null) {
            return JsonResponse::error($this->factory->createResponse(), 401, 'AUTH_REQUIRED', 'Author login required.');
        }

        return $handler->handle($request->withAttribute('author', [
            'id' => $author['id'],
            'username' => $author['username'],
        ]));
    }
}
