<?php
declare(strict_types=1);

use TestBraid\Publication\PublicationService;

// Private, explicit operator-only repair. Never expose this script via HTTP,
// and never infer the public directory from the shared host's DOCUMENT_ROOT.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}
if ($argc !== 2 || !is_string($argv[1]) || !str_starts_with($argv[1], DIRECTORY_SEPARATOR)) {
    fwrite(STDERR, "Usage: php bin/reconcile-public-media.php /absolute/real/public-root\n");
    exit(2);
}

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $publisher = new PublicationService(dirname(__DIR__), $argv[1]);
    $publisher->reconcile();
    fwrite(STDOUT, "Public media reconciliation completed.\n");
} catch (Throwable $e) {
    // Details should be examined in private PHP logs; avoid printing absolute
    // installation paths in a reusable support transcript.
    fwrite(STDERR, "Public media reconciliation failed: " . get_class($e) . "\n");
    exit(1);
}
