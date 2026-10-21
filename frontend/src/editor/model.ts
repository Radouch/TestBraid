/**
 * Canonical editor representation of schemaVersion 1 questions.
 * The JSON shapes match the shared PHP/Ajv schemas; no parallel
 * server-side question format is introduced.
 */
export type BlockKind = 'text' | 'image' | 'video'
export type ContentBlock =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image' | 'video'; mediaId: string }

export interface ContentItem {
  id: string
  content: ContentBlock[]
}
export interface ChoiceQuestion {
  id: string
  type: 'choice'
  mode: 'single' | 'multiple'
  prompt: ContentBlock[]
  options: ContentItem[]
  correctOptionIds: string[]
}
export interface Match {
  leftId: string
  rightId: string
}
export interface MatchingQuestion {
  id: string
  type: 'matching'
  prompt: ContentBlock[]
  leftItems: ContentItem[]
  rightItems: ContentItem[]
  matches: Match[]
}
export type Question = ChoiceQuestion | MatchingQuestion

export interface DraftTest {
  schemaVersion: 1
  id: string
  groupId: string
  language: string
  title: string
  description: string
  questions: Question[]
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function id(): string {
  return crypto.randomUUID()
}
export function blankBlock(): ContentBlock {
  return { id: id(), type: 'text', text: '' }
}
export function blankItem(): ContentItem {
  return { id: id(), content: [blankBlock()] }
}
export function createChoice(): ChoiceQuestion {
  return {
    id: id(), type: 'choice', mode: 'single',
    prompt: [blankBlock()],
    options: [blankItem(), blankItem()],
    correctOptionIds: [],
  }
}
export function createMatching(): MatchingQuestion {
  const leftItems = [blankItem(), blankItem()]
  const rightItems = [blankItem(), blankItem()]
  return {
    id: id(), type: 'matching', prompt: [blankBlock()],
    leftItems, rightItems,
    matches: leftItems.map((left, index) => ({ leftId: left.id, rightId: rightItems[index]!.id })),
  }
}
export function createBlock(type: BlockKind): ContentBlock {
  return type === 'text'
    ? blankBlock()
    : { id: id(), type, mediaId: '' }
}
export function switchChoiceMode(question: ChoiceQuestion, mode: 'single' | 'multiple'): void {
  question.mode = mode
  if (mode === 'single' && question.correctOptionIds.length > 1) {
    question.correctOptionIds = question.correctOptionIds.slice(0, 1)
  }
}
export function toggleChoiceCorrect(question: ChoiceQuestion, optionId: string, selected: boolean): void {
  if (!question.options.some((option) => option.id === optionId)) return
  if (question.mode === 'single') {
    question.correctOptionIds = selected ? [optionId] : []
  } else {
    question.correctOptionIds = selected
      ? Array.from(new Set([...question.correctOptionIds, optionId]))
      : question.correctOptionIds.filter((id) => id !== optionId)
  }
}
export function removeChoiceOption(question: ChoiceQuestion, optionId: string): void {
  question.options = question.options.filter((option) => option.id !== optionId)
  question.correctOptionIds = question.correctOptionIds.filter((id) => id !== optionId)
}
export function addMatchingPair(question: MatchingQuestion): void {
  const left = blankItem()
  const right = blankItem()
  question.leftItems.push(left)
  question.rightItems.push(right)
  question.matches.push({ leftId: left.id, rightId: right.id })
}
export function removeMatchingPair(question: MatchingQuestion, leftId: string): void {
  const index = question.leftItems.findIndex((item) => item.id === leftId)
  if (index < 0) return
  // "Remove pair" removes the displayed row from both content columns,
  // regardless of whether answers were reassigned to other right-hand items.
  const rightId = question.rightItems[index]?.id
  question.leftItems.splice(index, 1)
  question.rightItems.splice(index, 1)
  question.matches = question.matches.filter((match) =>
    match.leftId !== leftId && match.rightId !== rightId)
}
export function assignMatch(question: MatchingQuestion, leftId: string, rightId: string): void {
  if (!question.leftItems.some((item) => item.id === leftId)
    || !question.rightItems.some((item) => item.id === rightId)) return
  // Unassign the old owner of the chosen right item. Authors may leave a
  // draft incomplete, but publication requires a one-to-one bijection.
  question.matches = question.matches.filter((match) =>
    match.leftId !== leftId && match.rightId !== rightId)
  question.matches.push({ leftId, rightId })
}

export function move<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const removed = next.splice(from, 1)[0]!
  next.splice(to, 0, removed)
  return next
}

export function invalidMediaReference(questions: Question[]): boolean {
  const invalid = (blocks: ContentBlock[]) =>
    blocks.some((block) => block.type !== 'text' && !uuidPattern.test(block.mediaId))
  return questions.some((question) =>
    invalid(question.prompt)
    || (question.type === 'choice'
      ? question.options.some((option) => invalid(option.content))
      : [...question.leftItems, ...question.rightItems].some((item) => invalid(item.content))))
}

/** Client-side hints only. The server is the authority for publication. */
export function publicationProblems(questions: Question[]): string[] {
  const problems: string[] = []
  const meaningful = (blocks: ContentBlock[]) =>
    blocks.some((block) => block.type === 'text' ? block.text.trim() !== '' : uuidPattern.test(block.mediaId))
  if (!questions.length) problems.push('noQuestions')
  for (const question of questions) {
    if (!meaningful(question.prompt)) problems.push('missingPrompt')
    if (question.type === 'choice') {
      if (question.options.length < 2 || question.options.some((option) => !meaningful(option.content))) {
        problems.push('choiceOptions')
      }
      if (question.mode === 'single' ? question.correctOptionIds.length !== 1 : question.correctOptionIds.length === 0) {
        problems.push('choiceCorrect')
      }
    } else {
      if (question.leftItems.length < 2 || question.leftItems.length !== question.rightItems.length
        || [...question.leftItems, ...question.rightItems].some((item) => !meaningful(item.content))) {
        problems.push('matchItems')
      }
      const left = new Set(question.matches.map((match) => match.leftId))
      const right = new Set(question.matches.map((match) => match.rightId))
      if (left.size !== question.leftItems.length || right.size !== question.rightItems.length
        || question.matches.length !== question.leftItems.length
        || question.matches.some((match) =>
          !question.leftItems.some((item) => item.id === match.leftId)
          || !question.rightItems.some((item) => item.id === match.rightId))) {
        problems.push('matchIncomplete')
      }
    }
  }
  return [...new Set(problems)]
}
