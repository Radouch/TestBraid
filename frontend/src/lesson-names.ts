/** Localized lesson titles; old lessons only provide the fallback `name`. */
export interface LocalizedLesson {
  id: string
  name: string
  names?: Record<string, string> | null
}

/** Keep the fallback identical to the server's stored `name` field. */
export function lessonName(lesson: LocalizedLesson, locale: string): string {
  return lesson.names?.[locale]?.trim() || lesson.name
}
