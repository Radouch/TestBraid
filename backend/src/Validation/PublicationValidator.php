<?php
declare(strict_types=1);

namespace TestBraid\Validation;

use stdClass;

/**
 * Validates semantic constraints for test publication.
 *
 * Call only after the persisted test passes SchemaValidator. The callbacks
 * must inspect trusted server-side data, not values supplied by an author.
 */
final class PublicationValidator
{
    /**
     * @param callable(string): bool $groupExists
     * @param callable(string, string): bool $mediaExists
     * @return list<array{path: string, code: string, message: string}>
     */
    public function validate(stdClass $test, callable $groupExists, callable $mediaExists): array
    {
        $issues = [];
        $usedBlocks = [];
        $add = static function (string $path, string $code, string $message) use (&$issues): void {
            $issues[] = ['path' => $path, 'code' => $code, 'message' => $message];
        };

        $inspectBlocks = static function (array $blocks, string $path) use (&$usedBlocks, $add, $mediaExists): void {
            $meaningful = false;
            foreach ($blocks as $index => $block) {
                $blockPath = $path . '/' . $index;
                if (isset($usedBlocks[$block->id])) {
                    $add($blockPath . '/id', 'DUPLICATE_BLOCK_ID', 'Block IDs must be unique within a test.');
                }
                $usedBlocks[$block->id] = true;
                if ($block->type === 'text') {
                    $meaningful = $meaningful || trim($block->text) !== '';
                } else {
                    $meaningful = true;
                    if (!$mediaExists($block->mediaId, $block->type)) {
                        $add($blockPath . '/mediaId', 'MEDIA_MISSING', 'Referenced media is absent or has the wrong kind.');
                    }
                }
            }
            if (!$meaningful) {
                $add($path, 'EMPTY_CONTENT', 'Content must include meaningful text or media.');
            }
        };

        $inspectItems = static function (array $items, string $path) use ($inspectBlocks, $add): array {
            $ids = [];
            foreach ($items as $i => $item) {
                if (isset($ids[$item->id])) {
                    $add($path . '/' . $i . '/id', 'DUPLICATE_ITEM_ID', 'Item IDs must be unique within the collection.');
                }
                $ids[$item->id] = true;
                $inspectBlocks($item->content, $path . '/' . $i . '/content');
                // Media that is the whole item must be described: without text, screen
                // reader users could not tell the answers or matching items apart.
                $hasText = false;
                foreach ($item->content as $block) {
                    $hasText = $hasText || ($block->type === 'text' && trim($block->text) !== '');
                }
                if (!$hasText) {
                    foreach ($item->content as $b => $block) {
                        if ($block->type !== 'text' && trim((string) ($block->alt ?? '')) === '') {
                            $add($path . '/' . $i . '/content/' . $b . '/alt', 'MISSING_ALT', 'A picture or video that is the whole item needs a description.');
                        }
                    }
                }
            }
            return $ids;
        };

        if (!$groupExists($test->groupId)) {
            $add('/groupId', 'GROUP_MISSING', 'The referenced group does not exist.');
        }
        if (count($test->questions) === 0) {
            $add('/questions', 'NO_QUESTIONS', 'A published test needs at least one question.');
        }

        $questionIds = [];
        foreach ($test->questions as $index => $question) {
            $path = '/questions/' . $index;
            if (isset($questionIds[$question->id])) {
                $add($path . '/id', 'DUPLICATE_QUESTION_ID', 'Question IDs must be unique.');
            }
            $questionIds[$question->id] = true;
            $inspectBlocks($question->prompt, $path . '/prompt');

            if ($question->type === 'choice') {
                if (count($question->options) < 2) {
                    $add($path . '/options', 'TOO_FEW_OPTIONS', 'A choice needs at least two options.');
                }
                $optionIds = $inspectItems($question->options, $path . '/options');
                $count = count($question->correctOptionIds);
                if (($question->mode === 'single' && $count !== 1)
                    || ($question->mode === 'multiple' && $count < 1)) {
                    $add($path . '/correctOptionIds', 'INVALID_CORRECT_OPTIONS', 'The number of correct choices does not match the mode.');
                }
                foreach ($question->correctOptionIds as $answer) {
                    if (!isset($optionIds[$answer])) {
                        $add($path . '/correctOptionIds', 'UNKNOWN_CORRECT_OPTION', 'A correct option ID does not exist.');
                    }
                }
            } else {
                // The initial matching implementation requires a complete bijection.
                $left = $inspectItems($question->leftItems, $path . '/leftItems');
                $right = $inspectItems($question->rightItems, $path . '/rightItems');
                if (count($question->leftItems) < 2 || count($question->rightItems) !== count($question->leftItems)) {
                    $add($path, 'INVALID_MATCHING_SIZE', 'Matching needs at least two items per side, with equal counts.');
                }
                $leftMatched = [];
                $rightMatched = [];
                foreach ($question->matches as $i => $match) {
                    if (!isset($left[$match->leftId]) || !isset($right[$match->rightId])) {
                        $add($path . '/matches/' . $i, 'UNKNOWN_MATCH_ITEM', 'A match references a missing item.');
                    }
                    if (isset($leftMatched[$match->leftId]) || isset($rightMatched[$match->rightId])) {
                        $add($path . '/matches/' . $i, 'DUPLICATE_MATCH', 'Each item can be matched only once.');
                    }
                    $leftMatched[$match->leftId] = true;
                    $rightMatched[$match->rightId] = true;
                }
                if (count($leftMatched) !== count($left) || count($rightMatched) !== count($right)
                    || count($question->matches) !== count($left)) {
                    $add($path . '/matches', 'INCOMPLETE_MATCHING', 'All items must be matched exactly once.');
                }
            }
        }

        return $issues;
    }
}
