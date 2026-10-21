import type { ChoiceQuestion, MatchingQuestion, Question } from '../editor/model'

/**
 * Anonymous, entirely in-memory self-assessment. One point per wholly
 * correct question. Neither the original test nor any answers are persisted.
 */
export type ChoiceAnswers = Record<string, string[]>
export type MatchingAnswers = Record<string, Record<string, string>>

export interface Answers {
  choices: ChoiceAnswers
  matches: MatchingAnswers
}
export interface QuestionResult {
  questionId: string
  answered: boolean
  correct: boolean
  points: 0 | 1
}
export interface Score {
  correct: number
  total: number
  results: QuestionResult[]
}
export function freshAnswers(): Answers {
  return { choices: {}, matches: {} }
}

function sameSet(expected: string[], actual: string[]): boolean {
  // Reject duplicates rather than silently accepting repeated selections.
  return expected.length === actual.length
    && new Set(expected).size === expected.length
    && new Set(actual).size === actual.length
    && expected.every(id => actual.includes(id))
}
function scoreChoice(question: ChoiceQuestion, selected: string[]): QuestionResult {
  const allowed = new Set(question.options.map(option => option.id))
  const expected = question.correctOptionIds
  const validKey = expected.length >= 1
    && (question.mode === 'multiple' || expected.length === 1)
    && expected.every(id => allowed.has(id))
  const answered = selected.length > 0
  const correct = validKey && answered
    && selected.every(id => allowed.has(id))
    && sameSet(expected, selected)
  return { questionId: question.id, answered, correct, points: correct ? 1 : 0 }
}
function scoreMatching(question: MatchingQuestion, selected: Record<string, string>): QuestionResult {
  const expected = new Map(question.matches.map(pair => [pair.leftId, pair.rightId]))
  const left = question.leftItems.map(item => item.id)
  const right = new Set(question.rightItems.map(item => item.id))
  const entries = Object.entries(selected).filter(([, id]) => id !== '')
  const answered = entries.length > 0
  const validKey = left.length >= 2
    && left.length === right.size
    && expected.size === left.length
    && new Set(question.matches.map(pair => pair.rightId)).size === right.size
    && left.every(id => right.has(expected.get(id) ?? ''))
  const correct = validKey && entries.length === left.length
    && entries.every(([leftId, rightId]) => left.includes(leftId) && right.has(rightId))
    && new Set(entries.map(([, id]) => id)).size === entries.length
    && left.every(id => selected[id] === expected.get(id))
  return { questionId: question.id, answered, correct, points: correct ? 1 : 0 }
}
export function grade(questions: Question[], answers: Answers): Score {
  const results = questions.map(question => question.type === 'choice'
    ? scoreChoice(question, answers.choices[question.id] ?? [])
    : scoreMatching(question, answers.matches[question.id] ?? {}))
  return { correct: results.filter(result => result.correct).length, total: questions.length, results }
}

/** No server writes and no localStorage/cookie persistence of responses. */
export function setChoiceAnswer(
  answers: Answers, question: ChoiceQuestion, optionId: string, checked: boolean,
): Answers {
  // A Vue ref wraps objects in reactive Proxy instances. structuredClone(proxy)
  // throws DataCloneError in browsers, dropping every answer change. Make an
  // immutable plain-object update instead and preserve other question answers.
  const previous = answers.choices[question.id] ?? []
  const chosen = question.mode === 'single'
    ? (checked ? [optionId] : [])
    : (checked ? [...new Set([...previous, optionId])] : previous.filter(id => id !== optionId))
  return {
    choices: { ...answers.choices, [question.id]: chosen },
    matches: answers.matches,
  }
}
export function setMatchingAnswer(
  answers: Answers, question: MatchingQuestion, leftId: string, rightId: string,
): Answers {
  // Copy the edited question mapping into a plain object; never clone Vue's
  // reactive Proxy. Reassigning one right-hand item clears its previous owner.
  const mapping = { ...(answers.matches[question.id] ?? {}) }
  for (const [key, value] of Object.entries(mapping)) {
    if (key !== leftId && rightId && value === rightId) delete mapping[key]
  }
  if (rightId) mapping[leftId] = rightId
  else delete mapping[leftId]
  return {
    choices: answers.choices,
    matches: { ...answers.matches, [question.id]: mapping },
  }
}
