<?php
declare(strict_types=1);

namespace TestBraid\Validation;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use RuntimeException;

/**
 * Loads the canonical Draft 2020-12 JSON schemas from private local files.
 * Schema identifiers are logical URI keys; no external HTTP lookup is needed.
 */
final class SchemaValidator
{
    private const BASE_ID = 'https://schemas.testbraid.invalid/v1/';
    private const FILES = [
        'test' => 'test.schema.json',
        'group' => 'group.schema.json',
        'media' => 'media.schema.json',
        'block' => 'content-block.schema.json',
        'choice' => 'choice-question.schema.json',
        'matching' => 'matching-question.schema.json',
    ];

    private Validator $validator;

    public function __construct(string $schemaDirectory)
    {
        $this->validator = new Validator();

        foreach (self::FILES as $filename) {
            $path = rtrim($schemaDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
            if (!is_file($path) || !is_readable($path)) {
                throw new RuntimeException('Required TestBraid schema file is unavailable.');
            }
            $this->validator->resolver()->registerFile(self::BASE_ID . $filename, $path);
        }
    }

    /**
     * @return array{valid: bool, errors: array<mixed>}
     */
    public function validate(string $kind, object $document): array
    {
        if (!isset(self::FILES[$kind]) || !in_array($kind, ['test', 'group', 'media'], true)) {
            throw new \InvalidArgumentException('Unknown persisted document kind.');
        }
        $result = $this->validator->validate($document, self::BASE_ID . self::FILES[$kind]);
        return [
            'valid' => $result->isValid(),
            'errors' => $result->isValid()
                ? []
                : (new ErrorFormatter())->format($result->error()),
        ];
    }
}
