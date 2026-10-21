import assert from 'node:assert/strict'
import {
  addMatchingPair, assignMatch, blankBlock, createBlock, createChoice, createMatching,
  invalidMediaReference, move, publicationProblems, removeChoiceOption,
  removeMatchingPair, switchChoiceMode, toggleChoiceCorrect, uuidPattern,
  type DraftTest,
} from '../src/editor/model'
import { validateDocument } from '../src/validation/schema'
import { validatePublication } from '../src/validation/publication'

const groupId = '6f38752c-f042-4cac-8e3f-a00c9e35a231'
const sampleTestId = '0cb8066a-57a9-48d2-bb07-55a9f087a52b'

const question = createChoice()
assert.equal(question.options.length, 2)
assert.ok(uuidPattern.test(question.id))
assert.ok(new Set([question.id, ...question.options.map(x => x.id), ...question.prompt.map(x => x.id)]).size === 4)
question.prompt[0] = { ...blankBlock(), text: 'What is correct?' }
question.options[0]!.content[0] = { ...blankBlock(), text: 'Correct' }
question.options[1]!.content[0] = { ...blankBlock(), text: 'Wrong' }
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
  for (const item of side) item.content[0] = { ...blankBlock(), text: item.id }
}
matching.prompt[0] = { ...blankBlock(), text: 'Match the pairs' }
addMatchingPair(matching)
assert.equal(matching.leftItems.length, 3)
assert.equal(matching.matches.length, 3)
removeMatchingPair(matching, matching.leftItems[2]!.id)
assert.equal(matching.leftItems.length, 2)
assert.equal(matching.rightItems.length, 2)
assert.equal(matching.matches.length, 2)
assert.deepEqual(publicationProblems([matching]), [])

const draft: DraftTest = {
  schemaVersion: 1, id: sampleTestId, groupId, status: 'draft',
  createdAt: '2026-10-21T06:00:00Z', updatedAt: '2026-10-21T06:00:00Z',
  publishedAt: null, title: 'Mixed question draft', description: '', language: 'cs',
  questions: [matching],
}
assert.equal(validateDocument('test', draft).valid, true)
assert.equal(validatePublication(draft, {
  groupExists: id => id === groupId,
  mediaExists: () => true,
}).valid, true)
assert.equal(publicationProblems([createChoice()]).includes('missingPrompt'), true)

console.log('PASS: schema-compatible choice/matching editor models, media validation and assignment invariants')
