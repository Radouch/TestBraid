import { validateDocument, type ValidationIssue, type ValidationResult } from './schema'

// Types here describe only the validated parts used by publication rules.
// JSON Schema remains the authoritative persisted-data contract.
type Block = { id: string; type: 'text'; text: string }
  | { id: string; type: 'image' | 'video'; mediaId: string; alt?: string }
type Item = { id: string; content: Block[] }
type Choice = { id: string; type: 'choice'; mode: 'single' | 'multiple'; prompt: Block[];
  options: Item[]; correctOptionIds: string[] }
type Matching = { id: string; type: 'matching'; prompt: Block[];
  leftItems: Item[]; rightItems: Item[]; matches: Array<{ leftId: string; rightId: string }> }
type Test = { groupId: string; questions: Array<Choice | Matching> }

export interface PublicationContext {
  groupExists(id: string): boolean
  mediaExists(id: string, kind: 'image' | 'video'): boolean
}

/**
 * Check semantic publication constraints after JSON Schema validation.
 * The backend must construct PublicationContext from trusted private storage,
 * never from client-controlled lists or booleans.
 */
export function validatePublication(value: unknown, context: PublicationContext): ValidationResult {
  const structural = validateDocument('test', value)
  if (!structural.valid) return structural

  const test = value as Test
  const issues: ValidationIssue[] = []
  const add = (path: string, code: string, message: string): void => {
    issues.push({ path, code, message })
  }
  const usedBlocks = new Set<string>()

  function inspectBlocks(blocks: Block[], path: string): boolean {
    let meaningful = false
    blocks.forEach((block, index) => {
      const blockPath = `${path}/${index}`
      if (usedBlocks.has(block.id)) add(`${blockPath}/id`, 'DUPLICATE_BLOCK_ID', 'Block IDs must be unique within a test.')
      usedBlocks.add(block.id)
      if (block.type === 'text') {
        if (block.text.trim().length > 0) meaningful = true
      } else {
        meaningful = true
        if (!context.mediaExists(block.mediaId, block.type)) {
          add(`${blockPath}/mediaId`, 'MEDIA_MISSING', 'Referenced media is absent or has the wrong kind.')
        }
      }
    })
    if (!meaningful) add(path, 'EMPTY_CONTENT', 'Content must include meaningful text or media.')
    return meaningful
  }

  function inspectItems(items: Item[], path: string): Set<string> {
    const ids = new Set<string>()
    items.forEach((item, i) => {
      if (ids.has(item.id)) add(`${path}/${i}/id`, 'DUPLICATE_ITEM_ID', 'Item IDs must be unique within the collection.')
      ids.add(item.id)
      inspectBlocks(item.content, `${path}/${i}/content`)
      // Media that is the whole item must be described: without text, screen
      // reader users could not tell the answers or matching items apart.
      if (!item.content.some(block => block.type === 'text' && block.text.trim().length > 0)) {
        item.content.forEach((block, b) => {
          if (block.type !== 'text' && !block.alt?.trim()) {
            add(`${path}/${i}/content/${b}/alt`, 'MISSING_ALT', 'A picture or video that is the whole item needs a description.')
          }
        })
      }
    })
    return ids
  }

  if (!context.groupExists(test.groupId)) {
    add('/groupId', 'GROUP_MISSING', 'The referenced group does not exist.')
  }
  if (test.questions.length === 0) add('/questions', 'NO_QUESTIONS', 'A published test needs at least one question.')

  const questionIds = new Set<string>()
  test.questions.forEach((question, index) => {
    const path = `/questions/${index}`
    if (questionIds.has(question.id)) add(`${path}/id`, 'DUPLICATE_QUESTION_ID', 'Question IDs must be unique.')
    questionIds.add(question.id)
    inspectBlocks(question.prompt, `${path}/prompt`)

    if (question.type === 'choice') {
      if (question.options.length < 2) add(`${path}/options`, 'TOO_FEW_OPTIONS', 'A choice needs at least two options.')
      const ids = inspectItems(question.options, `${path}/options`)
      const n = question.correctOptionIds.length
      if ((question.mode === 'single' && n !== 1) || (question.mode === 'multiple' && n < 1)) {
        add(`${path}/correctOptionIds`, 'INVALID_CORRECT_OPTIONS', 'The number of correct choices does not match the mode.')
      }
      for (const answer of question.correctOptionIds) {
        if (!ids.has(answer)) add(`${path}/correctOptionIds`, 'UNKNOWN_CORRECT_OPTION', 'A correct option ID does not exist.')
      }
    } else {
      // Matching remains a strict bijection in PoC-A/B; future distractors are deferred.
      const left = inspectItems(question.leftItems, `${path}/leftItems`)
      const right = inspectItems(question.rightItems, `${path}/rightItems`)
      if (question.leftItems.length < 2 || question.rightItems.length !== question.leftItems.length) {
        add(path, 'INVALID_MATCHING_SIZE', 'Matching needs at least two items per side, with equal counts.')
      }
      const leftMatched = new Set<string>()
      const rightMatched = new Set<string>()
      question.matches.forEach((match, i) => {
        if (!left.has(match.leftId) || !right.has(match.rightId)) {
          add(`${path}/matches/${i}`, 'UNKNOWN_MATCH_ITEM', 'A match references a missing item.')
        }
        if (leftMatched.has(match.leftId) || rightMatched.has(match.rightId)) {
          add(`${path}/matches/${i}`, 'DUPLICATE_MATCH', 'Each item can be matched only once.')
        }
        leftMatched.add(match.leftId)
        rightMatched.add(match.rightId)
      })
      if (leftMatched.size !== left.size || rightMatched.size !== right.size
          || question.matches.length !== left.size) {
        add(`${path}/matches`, 'INCOMPLETE_MATCHING', 'All items must be matched exactly once.')
      }
    }
  })
  return { valid: issues.length === 0, issues }
}
