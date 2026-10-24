import type { ChoiceQuestion, Question } from '../editor/model'
import { hasValidAnswerKey, type Answers } from './scoring'

export type ProgressState = 'unanswered' | 'partial' | 'answered'
export interface QuestionProgress {
  state: ProgressState
  completed: number
  total: number
}

/** Completion uses learner responses only; it must never reveal the answer key. */
export function questionProgress(question: Question, answers: Answers): QuestionProgress {
  if (question.type === 'choice') {
    const selected = answers.choices[question.id] ?? []
    const answered = question.options.some(option => selected.includes(option.id))
    return { state: answered ? 'answered' : 'unanswered', completed: answered ? 1 : 0, total: 1 }
  }
  const responses = answers.matches[question.id] ?? {}
  const available = new Set(question.rightItems.map(item => item.id))
  const used = new Set<string>()
  for (const item of question.leftItems) {
    const rightId = responses[item.id]
    if (rightId && available.has(rightId)) used.add(rightId)
  }
  const completed = used.size
  const total = question.leftItems.length
  return { state: !completed ? 'unanswered' : completed === total ? 'answered' : 'partial', completed, total }
}

export type ChoiceFeedback = 'neutral' | 'selected' | 'chosen-correct' | 'chosen-incorrect' | 'correct-unselected'

/** A selected answer is blue until submission, including ungradable author drafts. */
export function choiceFeedback(
  question: ChoiceQuestion, selected: string[], optionId: string, submitted: boolean,
): ChoiceFeedback {
  const chosen = selected.includes(optionId)
  if (!submitted || !hasValidAnswerKey(question)) return chosen ? 'selected' : 'neutral'
  if (question.correctOptionIds.includes(optionId)) return chosen ? 'chosen-correct' : 'correct-unselected'
  return chosen ? 'chosen-incorrect' : 'neutral'
}
