import { showsOverallScore, type DraftTest, type Question } from './model'

export interface EditorLesson { id: string; name: string }
export interface TestSettings {
  groupId: string
  title: string
  description: string
  language: string
  showOverallScore: boolean
}
/** The existing test PUT payload, shared by both editor tabs. */
export interface TestEdits extends TestSettings { questions: Question[] }

export function testEdits(test: DraftTest): TestEdits {
  return {
    groupId: test.groupId, title: test.title, description: test.description,
    language: test.language, showOverallScore: showsOverallScore(test),
    // JSON content is detached even when the caller holds a Vue Proxy.
    questions: JSON.parse(JSON.stringify(test.questions)) as Question[],
  }
}
