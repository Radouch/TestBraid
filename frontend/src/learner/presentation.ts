import type { Question } from '../editor/model'

/** A fresh, in-memory permutation per attempt. Store IDs rather than moving the
 * canonical items: saved pair order and answer-key references must not change. */
export function createMatchingOrder(
  questions: Question[], random: () => number = Math.random,
): Record<string, string[]> {
  const orders: Record<string, string[]> = {}
  for (const question of questions) {
    if (question.type !== 'matching') continue
    const ids = question.rightItems.map(item => item.id)
    // Fisher–Yates samples all permutations, including the original ordering.
    // A new attempt may legitimately produce the same order by chance.
    for (let index = ids.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      const moved = ids[index]!
      ids[index] = ids[other]!
      ids[other] = moved
    }
    orders[question.id] = ids
  }
  return orders
}
