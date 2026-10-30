import assert from 'node:assert/strict'
import {
  addMatchingPair, assignMatch, createBlock, createChoice, createMatching, duplicateQuestion,
  invalidMediaReference, move, publicationProblems, removeChoiceOption,
  removeMatchingPair, switchChoiceMode, toggleChoiceCorrect, uuidPattern,
  type ContentBlock, type DraftTest,
} from '../src/editor/model'
import { matchingRows, confirmMatchingRow } from '../src/editor/matching'
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

// Legacy crossed assignments must be rendered and removed by saved IDs rather
// than array position. Projection must never mutate the loaded draft.
const savedMatching = JSON.stringify(matching)
const crossedRows = matchingRows(matching)
assert.equal(JSON.stringify(matching), savedMatching)
assert.deepEqual(crossedRows.map(row => [row.left!.id, row.right!.id]),
  matching.leftItems.map(left => [left.id, matching.matches.find(match => match.leftId === left.id)!.rightId]))
assert.ok(crossedRows.every(row => row.confirmed))
const removable = JSON.parse(savedMatching) as typeof matching
const rowToRemove = matchingRows(removable)[0]!
const surviving = matchingRows(removable)[1]!
removeMatchingPair(removable, rowToRemove.left!.id)
assert.deepEqual(removable.leftItems.map(item => item.id), [surviving.left!.id])
assert.deepEqual(removable.rightItems.map(item => item.id), [surviving.right!.id])
assert.deepEqual(removable.matches, [{ leftId: surviving.left!.id, rightId: surviving.right!.id }])

// Incomplete old drafts retain all items and their missing key on open. Only
// explicit confirmation may create an assignment or a missing counterpart.
const legacy = createMatching()
legacy.matches = []
const legacyBefore = JSON.stringify(legacy)
const pending = matchingRows(legacy)
assert.equal(JSON.stringify(legacy), legacyBefore)
assert.ok(pending.every(row => !row.confirmed))
assert.deepEqual(pending.map(row => row.right!.id), legacy.rightItems.map(item => item.id))
confirmMatchingRow(legacy, pending[0]!)
assert.equal(legacy.matches.length, 1)
assert.equal(matchingRows(legacy)[1]!.confirmed, false)
confirmMatchingRow(legacy, matchingRows(legacy)[1]!)
assert.ok(matchingRows(legacy).every(row => row.confirmed))
legacy.rightItems.push({ id: crypto.randomUUID(), content: [textBlock('Orphan image caption'), image] })
const orphan = matchingRows(legacy).at(-1)!
assert.equal(orphan.left, null)
const oldRightIds = legacy.rightItems.map(item => item.id)
confirmMatchingRow(legacy, orphan)
assert.deepEqual(legacy.rightItems.map(item => item.id), oldRightIds)
assert.equal(legacy.leftItems.length, 3)
assert.equal(legacy.matches.at(-1)!.rightId, orphan.right!.id)
assert.ok(matchingRows(legacy).every(row => row.confirmed))
const removedOrphan = createMatching()
removedOrphan.leftItems = []
removedOrphan.matches = []
const extraRow = matchingRows(removedOrphan)[0]!
removeMatchingPair(removedOrphan, null, extraRow.right!.id)
assert.equal(removedOrphan.rightItems.length, 1)

// A duplicate/ambiguous key is not silently presented as a confirmed pair.
const ambiguous = createMatching()
ambiguous.matches = [
  { leftId: ambiguous.leftItems[0]!.id, rightId: ambiguous.rightItems[0]!.id },
  { leftId: ambiguous.leftItems[1]!.id, rightId: ambiguous.rightItems[0]!.id },
]
const ambiguousBefore = JSON.stringify(ambiguous)
assert.ok(matchingRows(ambiguous).every(row => !row.confirmed))
assert.equal(JSON.stringify(ambiguous), ambiguousBefore)
for (const row of matchingRows(ambiguous)) confirmMatchingRow(ambiguous, row)
assert.ok(matchingRows(ambiguous).every(row => row.confirmed))

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

// Pictures and videos that are a whole answer or matching item need a description.
const mediaId = '11111111-1111-4111-8111-111111111111'
const media = (alt?: string): ContentBlock => ({ id: crypto.randomUUID(), type: 'image', mediaId, ...(alt === undefined ? {} : { alt }) })
const pictureChoice = createChoice()
pictureChoice.prompt = [textBlock('Which leaf is from an oak?')]
pictureChoice.options[0]!.content = [media()]
pictureChoice.options[1]!.content = [textBlock('Beech'), media()]
pictureChoice.correctOptionIds = [pictureChoice.options[0]!.id]
assert.deepEqual(publicationProblems([pictureChoice]), ['missingAlt'])
pictureChoice.options[0]!.content = [media('   ')]
assert.deepEqual(publicationProblems([pictureChoice]), ['missingAlt'], 'Whitespace is not a description')
pictureChoice.options[0]!.content = [media('Oak leaf with rounded lobes')]
assert.deepEqual(publicationProblems([pictureChoice]), [], 'A picture next to answer text needs no description')
const videoMatching = structuredClone(matching)
videoMatching.leftItems[0]!.content = [{ id: crypto.randomUUID(), type: 'video', mediaId }]
assert.deepEqual(publicationProblems([videoMatching]), ['missingAlt'])

console.log('PASS: schema-compatible choice/matching editor models, media validation and assignment invariants')
