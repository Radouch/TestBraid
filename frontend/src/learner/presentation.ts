import type { ChoiceQuestion, ContentItem, Question } from '../editor/model'

/** Shuffle only ID copies, never the authored arrays or stable answer-key IDs.
 * Fisher–Yates permits every permutation, including the original ordering. */
function shuffledIds(ids: string[], random: () => number): string[] {
  const result = [...ids]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const moved = result[index]!
    result[index] = result[other]!
    result[other] = moved
  }
  return result
}

/** Optional choice shuffling is sampled once per attempt, never on re-render. */
export function createChoiceOrder(
  questions: Question[], random: () => number = Math.random,
): Record<string, string[]> {
  const orders: Record<string, string[]> = {}
  for (const question of questions) {
    if (question.type === 'choice' && question.shuffleOptions === true) {
      orders[question.id] = shuffledIds(question.options.map(option => option.id), random)
    }
  }
  return orders
}

/** Map sampled IDs back to the original option objects without changing them. */
export function choiceOptionsInOrder(question: ChoiceQuestion, order?: string[]): ContentItem[] {
  if (!order) return question.options
  const optionsById = new Map(question.options.map(option => [option.id, option]))
  return order.flatMap(id => {
    const option = optionsById.get(id)
    return option ? [option] : []
  })
}

/** Matching always shuffles right-hand items at the start of each attempt. */
export function createMatchingOrder(
  questions: Question[], random: () => number = Math.random,
): Record<string, string[]> {
  const orders: Record<string, string[]> = {}
  for (const question of questions) {
    if (question.type !== 'matching') continue
    orders[question.id] = shuffledIds(question.rightItems.map(item => item.id), random)
  }
  return orders
}
