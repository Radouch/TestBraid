export interface PublicTestSummary {
  id: string
  title: string
  language: string
}

export const PUBLIC_CATALOG_ANCHOR = 'public-catalog-heading'

export interface PublicLesson {
  id: string
  name: string
  tests: PublicTestSummary[]
}

function isPublicLesson(value: unknown): value is PublicLesson {
  if (value === null || typeof value !== 'object') return false
  const lesson = value as Partial<PublicLesson>
  return typeof lesson.id === 'string' && typeof lesson.name === 'string'
    && Array.isArray(lesson.tests) && lesson.tests.every(test => test !== null
      && typeof test === 'object' && typeof test.id === 'string'
      && typeof test.title === 'string' && typeof test.language === 'string')
}

/** Use only the anonymous, allowlisted catalog for public lesson names. */
export async function fetchPublicCatalog(basePath: string, signal?: AbortSignal): Promise<PublicLesson[]> {
  const response = await fetch(basePath + 'api/public/catalog', {
    credentials: 'omit', cache: 'no-store', signal,
  })
  if (!response.ok) throw new Error('Public catalog unavailable')
  const payload: unknown = await response.json()
  const groups = payload !== null && typeof payload === 'object'
    ? (payload as { groups?: unknown }).groups : undefined
  if (!Array.isArray(groups) || !groups.every(isPublicLesson)) {
    throw new Error('Invalid public catalog')
  }
  return groups
}

/** A lesson name is valid only when the published catalog also lists this test. */
export function publicLessonForTest(
  groups: PublicLesson[], test: { id: string; groupId: string },
): PublicLesson | undefined {
  return groups.find(group => group.id === test.groupId
    && group.tests.some(summary => summary.id === test.id))
}

export function publicLessonAnchor(lessonId: string): string {
  return 'lesson-' + lessonId
}

export function publicLessonHash(lessonId: string): string {
  return '#' + publicLessonAnchor(lessonId)
}

export function publicCatalogLocation(lessonId?: string): { name: 'home'; hash: string } {
  return { name: 'home', hash: lessonId ? publicLessonHash(lessonId) : '#' + PUBLIC_CATALOG_ANCHOR }
}

/** Ignore unrelated or obsolete fragments instead of looking up arbitrary DOM IDs. */
export function publicLessonForHash(groups: PublicLesson[], hash: string): PublicLesson | undefined {
  return groups.find(group => publicLessonHash(group.id) === hash)
}
