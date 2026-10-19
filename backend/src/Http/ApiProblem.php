<?php
declare(strict_types=1);

namespace TestBraid\Http;

use RuntimeException;

/** Expected validation errors are safe to present to API clients. */
final class ApiProblem extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message
    ) {
        parent::__construct($message);
    }
}
