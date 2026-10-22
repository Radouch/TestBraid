import { assignMatch, blankItem, type ContentItem, type MatchingQuestion } from './model'

export interface MatchingRow {
  id: string
  left: ContentItem | null
  right: ContentItem | null
  confirmed: boolean
}

/** Project saved answer-key IDs into editable rows without changing the draft.
 * Unassigned legacy items remain visible, but a suggested row is not an answer
 * key until the author explicitly confirms it. No media/content IDs are copied. */
export function matchingRows(question: MatchingQuestion): MatchingRow[] {
  const rightById = new Map(question.rightItems.map(item => [item.id, item]))
  const leftMatches = new Map<string, string[]>()
  const rightCounts = new Map<string, number>()
  for (const match of question.matches) {
    leftMatches.set(match.leftId, [...(leftMatches.get(match.leftId) ?? []), match.rightId])
    rightCounts.set(match.rightId, (rightCounts.get(match.rightId) ?? 0) + 1)
  }
  const used = new Set<string>()
  const rows: MatchingRow[] = question.leftItems.map(left => {
    const matches = leftMatches.get(left.id) ?? []
    const rightId = matches.length === 1 ? matches[0]! : ''
    const right = rightCounts.get(rightId) === 1 ? rightById.get(rightId) ?? null : null
    if (right) used.add(right.id)
    return { id: left.id, left, right, confirmed: right !== null }
  })
  const unassigned = question.rightItems.filter(right => !used.has(right.id))
  let next = 0
  for (const row of rows) {
    if (!row.right) row.right = unassigned[next++] ?? null
  }
  for (const right of unassigned.slice(next)) {
    rows.push({ id: 'right-' + right.id, left: null, right, confirmed: false })
  }
  return rows
}

/** Complete/confirm a legacy row only after a deliberate author action. */
export function confirmMatchingRow(question: MatchingQuestion, row: MatchingRow): void {
  const leftId = row.left?.id
  const rightId = row.right?.id
  if ((leftId && !question.leftItems.some(item => item.id === leftId))
    || (rightId && !question.rightItems.some(item => item.id === rightId))) return
  const left = row.left ?? blankItem()
  const right = row.right ?? blankItem()
  if (!row.left) question.leftItems.push(left)
  if (!row.right) question.rightItems.push(right)
  assignMatch(question, left.id, right.id)
}
