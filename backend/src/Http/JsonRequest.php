<?php
declare(strict_types=1);

namespace TestBraid\Http;

use Psr\Http\Message\ServerRequestInterface;
use stdClass;

/** Parse a bounded JSON object with an explicit editable-field allowlist. */
final class JsonRequest
{
    /**
     * @param list<string> $required
     * @param list<string> $optional
     */
    public static function fields(
        ServerRequestInterface $request,
        array $required,
        array $optional = []
    ): stdClass {
        $type = strtolower(trim(explode(';', $request->getHeaderLine('Content-Type'))[0]));
        if ($type !== 'application/json') {
            throw new ApiProblem(400, 'INVALID_REQUEST', 'Expected application/json.');
        }
        $size = $request->getBody()->getSize();
        if ($size !== null && $size > 524288) {
            throw new ApiProblem(413, 'DOCUMENT_TOO_LARGE', 'JSON document exceeds the request limit.');
        }
        $raw = (string) $request->getBody();
        if (strlen($raw) > 524288) {
            throw new ApiProblem(413, 'DOCUMENT_TOO_LARGE', 'JSON document exceeds the request limit.');
        }
        try {
            $data = json_decode($raw, false, 128, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiProblem(400, 'INVALID_JSON', 'Malformed JSON request.');
        }
        if (!$data instanceof stdClass) {
            throw new ApiProblem(400, 'INVALID_REQUEST', 'Expected a JSON object.');
        }
        $properties = array_keys(get_object_vars($data));
        foreach ($required as $name) {
            if (!property_exists($data, $name)) {
                throw new ApiProblem(422, 'VALIDATION_FAILED', 'Required editable field is missing.');
            }
        }
        foreach ($properties as $name) {
            if (!in_array($name, $required, true) && !in_array($name, $optional, true)) {
                // Disallow status, IDs and all other server-controlled metadata.
                throw new ApiProblem(422, 'VALIDATION_FAILED', 'Unsupported or server-controlled field.');
            }
        }
        return $data;
    }
}
