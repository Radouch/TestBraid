import assert from 'node:assert/strict'
import {
  addMatchingPair, assignMatch, createBlock, createChoice, createMatching, duplicateQuestion,
  invalidMediaReference, move, publicationProblems, removeChoiceOption,
  removeMatchingPair, switchChoiceMode, toggleChoiceCorrect, uuidPattern,
  type ContentBlock, type DraftTest,
} from '../src/editor/model'
import { validateDocument } from '../src/validation/schema'
import { validatePublication } from '../src/validation/publication'

function textBlock(text: string): ContentBlock { return { id: crypto.randomUUID(), type: 'text', text } }

const groupId = '6f38752c-f042-4cac-8e3f-a00c9e35a231'
const sampleTestId = '0cb8066a-57a9-48d2-bb07-55a9f087a52b'

const question = createChoice()
assert.equal(question.options.length, 2)
assert.ok(uuidPattern.test(question.id))
assert.ok(new Set([question.id, ...question.options.map(x => x.id), ...question.prompt.map(x => x.id)]).size === 4)
question.prompt[0] = textBlock('What is correct?')
question.options[0]!.content[0] = textBlock('Correct')
question.options[1]!.content[0] = textBlock('Wrong')
toggleChoiceCorrect(question, question.options[0]!.id, true)
assert.deepEqual(question.correctOptionIds, [question.options[0]!.id])
switchChoiceMode(question, 'multiple')
toggleChoiceCorrect(question, question.options[1]!.id, true)
assert.equal(question.correctOptionIds.length, 2)
switchChoiceMode(question, 'single')
assert.equal(question.correctOptionIds.length, 1)
removeChoiceOption(question, question.options[0]!.id)
assert.equal(question.options.length, 1)
assert.equal(question.correctOptionIds.length, 0)

// Test mixed media without treating an empty placeholder as a usable ID.
const image = createBlock('image')
question.prompt.push(image)
assert.equal(invalidMediaReference([question]), true)
assert.equal(image.type, 'image')
if (image.type === 'image') image.mediaId = 'e228b9bd-f0cf-437b-b078-245dbfdc8919'
assert.equal(invalidMediaReference([question]), false)
assert.deepEqual(move([1, 2, 3], 1, -1), [2, 1, 3])
assert.deepEqual(move([1, 2, 3], 0, -1), [1, 2, 3])

// Canonical two-sided matching and change of counterpart must stay a bijection.
const matching = createMatching()
const left1 = matching.leftItems[0]!
const left2 = matching.leftItems[1]!
const right1 = matching.rightItems[0]!
const right2 = matching.rightItems[1]!
assert.deepEqual(matching.matches.map(p => p.rightId), [right1.id, right2.id])
assignMatch(matching, left1.id, right2.id)
assert.equal(matching.matches.length, 1)
assert.equal(matching.matches[0]?.leftId, left1.id)
assignMatch(matching, left2.id, right1.id)
assert.equal(matching.matches.length, 2)
for (const side of [matching.leftItems, matching.rightItems]) {
  for (const item of side) item.content[0] = textBlock(item.id)
}
matching.prompt[0] = textBlock('Match the pairs')
addMatchingPair(matching)
assert.equal(matching.leftItems.length, 3)
assert.equal(matching.matches.length, 3)
removeMatchingPair(matching, matching.leftItems[2]!.id)
assert.equal(matching.leftItems.length, 2)
assert.equal(matching.rightItems.length, 2)
assert.equal(matching.matches.length, 2)
assert.deepEqual(publicationProblems([matching]), [])

// Copies must keep content/media and answer keys while sharing no structural IDs.
const originalChoice = createChoice()
originalChoice.options[0]!.content = [textBlock('Before'), image, textBlock('After')]
originalChoice.correctOptionIds = [originalChoice.options[0]!.id]
const copiedChoice = duplicateQuestion(originalChoice)
assert.equal(copiedChoice.type, 'choice')
if (copiedChoice.type !== 'choice') throw new Error('Unexpected duplicate type')
assert.notEqual(copiedChoice.id, originalChoice.id)
assert.deepEqual(copiedChoice.correctOptionIds, [copiedChoice.options[0]!.id])
assert.deepEqual(copiedChoice.options[0]!.content.map(block => block.type), ['text', 'image', 'text'])
const copiedImage = copiedChoice.options[0]!.content[1]!
assert.ok(copiedImage.type === 'image' && image.type === 'image' && copiedImage.mediaId === image.mediaId)
assert.notEqual(copiedImage.id, image.id)
copiedChoice.options[0]!.content.splice(0, 1)
assert.equal(originalChoice.options[0]!.content.length, 3)
const copiedMatching = duplicateQuestion(matching)
if (copiedMatching.type !== 'matching') throw new Error('Unexpected duplicate type')
assert.deepEqual(copiedMatching.matches.map(match => [
  copiedMatching.leftItems.findIndex(item => item.id === match.leftId),
  copiedMatching.rightItems.findIndex(item => item.id === match.rightId),
]), matching.matches.map(match => [
  matching.leftItems.findIndex(item => item.id === match.leftId),
  matching.rightItems.findIndex(item => item.id === match.rightId),
]))
const structuralIds = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(structuralIds)
  return Object.entries(value).flatMap(([key, entry]) => key === 'id' ? [String(entry)] : structuralIds(entry))
}
for (const [source, copy] of [[originalChoice, copiedChoice], [matching, copiedMatching]]) {
  const sourceIds = new Set(structuralIds(source))
  const copyIds = structuralIds(copy)
  assert.equal(new Set(copyIds).size, copyIds.length)
  assert.ok(copyIds.every(id => uuidPattern.test(id) && !sourceIds.has(id)))
}
assert.deepEqual(publicationProblems([copiedMatching]), [])

const draft: DraftTest = {
  schemaVersion: 1, id: sampleTestId, groupId, status: 'draft',
  createdAt: '2026-10-21T06:00:00Z', updatedAt: '2026-10-21T06:00:00Z',
  publishedAt: null, title: 'Mixed question draft', description: '', language: 'cs',
  questions: [matching, copiedMatching],
}
assert.equal(validateDocument('test', draft).valid, true)
assert.equal(validatePublication(draft, {
  groupExists: id => id === groupId,
  mediaExists: () => true,
}).valid, true)
assert.equal(publicationProblems([createChoice()]).includes('missingPrompt'), true)

console.log('PASS: schema-compatible choice/matching editor models, media validation and assignment invariants')
