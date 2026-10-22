import type { ContentItem, MatchingQuestion } from '../editor/model'

export interface LearnerPair { left: ContentItem; right: ContentItem }

/** Project only the learner's responses, never the answer key. Object insertion
 * order keeps completed pairs in the order they were made. Free items retain
 * their original left order and the attempt's shuffled right order. */
export function matchingPresentation(
  question: MatchingQuestion, responses: Record<string, string>, rightOrder: string[],
): { pairs: LearnerPair[]; left: ContentItem[]; right: ContentItem[] } {
  const leftById = new Map(question.leftItems.map(item => [item.id, item]))
  const rightById = new Map(question.rightItems.map(item => [item.id, item]))
  const usedLeft = new Set<string>()
  const usedRight = new Set<string>()
  const pairs: LearnerPair[] = []
  for (const [leftId, rightId] of Object.entries(responses)) {
    const left = leftById.get(leftId)
    const right = rightById.get(rightId)
    if (!left || !right || usedRight.has(rightId)) continue
    pairs.push({ left, right })
    usedLeft.add(leftId)
    usedRight.add(rightId)
  }
  const ordered = [...new Set([...rightOrder, ...rightById.keys()])]
  return {
    pairs,
    left: question.leftItems.filter(item => !usedLeft.has(item.id)),
    right: ordered.flatMap(id => {
      const item = rightById.get(id)
      return item && !usedRight.has(id) ? [item] : []
    }),
  }
}
