<?php
declare(strict_types=1);

namespace TestBraid\Storage;

use stdClass;
use TestBraid\Http\ApiProblem;

/**
 * Locale-aware lesson names shared by the author API and public catalog.
 *
 * The legacy "name" is retained as a fallback for existing JSON records and
 * older clients; "names" contains optional translations in UI locales.
 */
final class LessonNames
{
    /** @return stdClass Locale => nonempty, trimmed title. */
    public static function fromInput(mixed $value): stdClass
    {
        if (!$value instanceof stdClass || count(get_object_vars($value)) < 1
            || count(get_object_vars($value)) > 20) {
            throw new ApiProblem(422, 'VALIDATION_FAILED', 'Provide at least one lesson name.');
        }
        $names = new stdClass();
        foreach ($value as $locale => $title) {
            if (!preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $locale)
                || !is_string($title) || trim($title) === ''
                || preg_match('/^.{1,250}$/us', trim($title)) !== 1) {
                throw new ApiProblem(422, 'VALIDATION_FAILED', 'Invalid localized lesson name.');
            }
            $names->$locale = trim($title);
        }
        return $names;
    }

    public static function fallback(stdClass $record): string
    {
        if (isset($record->name) && is_string($record->name)) return $record->name;
        foreach (($record->names ?? new stdClass()) as $name) return $name;
        return '';
    }

    public static function forLocale(stdClass $record, string $locale): string
    {
        $localized = $record->names ?? null;
        if ($localized instanceof stdClass && isset($localized->$locale)
            && is_string($localized->$locale) && $localized->$locale !== '') {
            return $localized->$locale;
        }
        return self::fallback($record);
    }

    /** Unicode-aware on PHP with mbstring; Czech/Latin case mapping without it. */
    public static function key(string $title): string
    {
        $title = trim($title);
        if (function_exists('mb_strtolower')) return mb_strtolower($title, 'UTF-8');
        $upper = 'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜÀÂÇÈÊËÎÏÔÙÛŸÆŒ';
        $lower = 'áčďéěíňóřšťúůýžäöüàâçèêëîïôùûÿæœ';
        preg_match_all('/./us', $upper, $a);
        preg_match_all('/./us', $lower, $b);
        return strtolower(strtr($title, array_combine($a[0], $b[0])));
    }

    /**
     * Compare what a visitor sees, including fallback titles when a locale
     * is missing. Extra languages in stored names remain collision-checked.
     * @param list<stdClass> $others
     * @param list<string> $uiLanguages
     */
    public static function assertUnique(stdClass $candidate, array $others, array $uiLanguages, ?string $excludeId = null): void
    {
        foreach ($others as $other) {
            if ($other->id === $excludeId) continue;
            $locales = $uiLanguages;
            foreach ([$candidate, $other] as $record) {
                foreach (($record->names ?? new stdClass()) as $locale => $_) $locales[] = $locale;
            }
            foreach (array_unique($locales) as $locale) {
                if (self::key(self::forLocale($candidate, $locale))
                    === self::key(self::forLocale($other, $locale))) {
                    throw new ApiProblem(409, 'GROUP_NAME_EXISTS', 'A lesson with this displayed name already exists.');
                }
            }
        }
    }

    public static function numbered(string $original, int $number): string
    {
        $base = preg_replace('/(?: \([1-9][0-9]*\))+$/u', '', trim($original)) ?? trim($original);
        $suffix = ' (' . $number . ')';
        $limit = 250 - strlen($suffix);
        preg_match('/^.{0,' . $limit . '}/us', $base, $match);
        return rtrim($match[0] ?? '') . $suffix;
    }
}
