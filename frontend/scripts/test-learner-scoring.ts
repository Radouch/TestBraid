import assert from 'node:assert/strict'
import { reactive } from 'vue'
import type { ChoiceQuestion, MatchingQuestion, Question } from '../src/editor/model'
import { freshAnswers, grade, hasValidAnswerKey, setChoiceAnswer, setMatchingAnswer } from '../src/learner/scoring'
import { createMatchingOrder } from '../src/learner/presentation'
import { toggleChoiceCorrect } from '../src/editor/model'

const text = (id: string, value: string) => ({ id, type: 'text' as const, text: value })
const choice: ChoiceQuestion = {
  id: 'q-choice', type: 'choice', mode: 'multiple',
  prompt: [text('prompt', 'Choose all correct options')],
  options: [
    { id: 'a', content: [text('a-block', 'A')] },
    { id: 'b', content: [text('b-block', 'B')] },
    { id: 'c', content: [text('c-block', 'C')] },
  ],
  correctOptionIds: ['a', 'c'],
}
const matching: MatchingQuestion = {
  id: 'q-match', type: 'matching', prompt: [text('matching-prompt', 'Match items')],
  leftItems: [
    { id: 'left1', content: [text('left1-text', '1')] },
    { id: 'left2', content: [text('left2-text', '2')] },
  ],
  rightItems: [
    { id: 'right1', content: [text('right1-text', 'A')] },
    { id: 'right2', content: [text('right2-text', 'B')] },
  ],
  matches: [
    { leftId: 'left1', rightId: 'right2' },
    { leftId: 'left2', rightId: 'right1' },
  ],
}
const questions: Question[] = [choice, matching]
const initial = freshAnswers()
assert.deepEqual(grade(questions, initial), {
  correct: 0, total: 2,
  results: [
    { questionId: 'q-choice', answered: false, correct: false, points: 0 },
    { questionId: 'q-match', answered: false, correct: false, points: 0 },
  ],
})
assert.equal(grade([], initial).total, 0)
assert.equal(hasValidAnswerKey(choice), true)
assert.equal(hasValidAnswerKey(matching), true)

// Simulate the exact author data path: question is nested in Vue reactive
// editor state, its answer key is updated via an input handler and saved JSON
// is reloaded by the private preview/runner.
const reactiveQuestion = reactive(structuredClone(choice))
reactiveQuestion.correctOptionIds = []
assert.equal(hasValidAnswerKey(reactiveQuestion), false)
toggleChoiceCorrect(reactiveQuestion, 'a', true)
toggleChoiceCorrect(reactiveQuestion, 'c', true)
const persistedQuestion = JSON.parse(JSON.stringify(reactiveQuestion)) as ChoiceQuestion
assert.deepEqual(persistedQuestion.correctOptionIds, ['a', 'c'])
assert.equal(hasValidAnswerKey(persistedQuestion), true)
assert.equal(grade([persistedQuestion], {
  choices: { [persistedQuestion.id]: ['c', 'a'] }, matches: {},
}).correct, 1)


// Multiple choice: partial selection must score zero, extra choice scores
// zero, order of selected set does not affect exact equality.
let answers = setChoiceAnswer(initial, choice, 'a', true)
assert.equal(grade(questions, answers).correct, 0)
answers = setChoiceAnswer(answers, choice, 'b', true)
answers = setChoiceAnswer(answers, choice, 'c', true)
assert.equal(grade(questions, answers).correct, 0)
answers = setChoiceAnswer(answers, choice, 'b', false)
assert.equal(grade(questions, answers).correct, 1)
assert.deepEqual(initial, freshAnswers()) // updated responses never mutate the original

// Regression: in the actual Vue runner, answers.value is a reactive Proxy.
// structuredClone(answers.value) throws DataCloneError, so previously a
// click left the answer blank and every preview response scored zero.
const reactiveAnswers = reactive(freshAnswers())
const fromProxy = setChoiceAnswer(reactiveAnswers, choice, 'a', true)
assert.deepEqual(fromProxy.choices['q-choice'], ['a'])
assert.equal(grade([choice], fromProxy).results[0]?.answered, true)
assert.deepEqual(reactiveAnswers.choices, {})
const secondProxy = setChoiceAnswer(reactive(fromProxy), choice, 'c', true)
assert.equal(grade([choice], secondProxy).correct, 1)
const matchingFromProxy = setMatchingAnswer(reactive(secondProxy), matching, 'left1', 'right2')
const completeProxy = setMatchingAnswer(reactive(matchingFromProxy), matching, 'left2', 'right1')
assert.equal(grade(questions, completeProxy).correct, 2)


let backwards = setChoiceAnswer(initial, choice, 'c', true)
backwards = setChoiceAnswer(backwards, choice, 'a', true)
assert.equal(grade(questions, backwards).correct, 1)
assert.equal(grade([choice], {
  choices: { 'q-choice': ['a', 'a'] }, matches: {},
}).correct, 0)

const single: ChoiceQuestion = { ...choice, id: 'q-single', mode: 'single', correctOptionIds: ['b'] }
let singleAnswers = setChoiceAnswer(freshAnswers(), single, 'a', true)
singleAnswers = setChoiceAnswer(singleAnswers, single, 'b', true)
assert.deepEqual(singleAnswers.choices['q-single'], ['b'])
assert.equal(grade([single], singleAnswers).correct, 1)
singleAnswers = setChoiceAnswer(singleAnswers, single, 'b', false)
assert.equal(grade([single], singleAnswers).correct, 0)

// Matching: one correct pair is zero points; wrong pair is zero;
// a complete bijection is exactly one point; duplicate right assignment
// is never accepted as a full match.
answers = setMatchingAnswer(answers, matching, 'left1', 'right2')
assert.equal(grade(questions, answers).correct, 1)
answers = setMatchingAnswer(answers, matching, 'left2', 'right1')
assert.equal(grade(questions, answers).correct, 2)
const full = grade(questions, answers)
assert.deepEqual(full.results.map(result => result.points), [1, 1])

const wrong = setMatchingAnswer(freshAnswers(), matching, 'left1', 'right1')
assert.equal(grade([matching], wrong).correct, 0)
const moved = setMatchingAnswer(wrong, matching, 'left2', 'right1')
assert.equal(moved.matches['q-match']?.['left1'], undefined)
assert.equal(moved.matches['q-match']?.['left2'], 'right1')
assert.equal(grade([matching], moved).correct, 0)

assert.equal(grade([matching], {
  choices: {}, matches: { 'q-match': { left1: 'right2', left2: 'right2' } },
}).correct, 0)
assert.equal(grade([matching], {
  choices: {}, matches: { 'q-match': { left1: 'right2', left2: 'right1', bogus: 'right1' } },
}).correct, 0)

// Draft with no valid answer key cannot award accidental points.
const incomplete: ChoiceQuestion = { ...single, correctOptionIds: [] }
assert.equal(grade([incomplete], singleAnswers).correct, 0)
assert.equal(hasValidAnswerKey(incomplete), false)
assert.equal(hasValidAnswerKey({
  ...matching, matches: matching.matches.slice(0, 1),
}), false)

console.log('PASS: anonymous scorer exact-choice sets, complete matching bijection, unanswered and reset')

// Order is presentation-only; every sampled permutation preserves stable IDs,
// leaves the canonical arrays/key untouched and therefore preserves grading.
const originalMatching = JSON.stringify(matching)
const reversed = createMatchingOrder([choice, matching], () => 0)
assert.equal(reversed[choice.id], undefined)
assert.deepEqual(reversed[matching.id], ['right2', 'right1'])
assert.deepEqual(createMatchingOrder([matching], () => 0.999)[matching.id], ['right1', 'right2'])
assert.notEqual(createMatchingOrder([matching])[matching.id], matching.rightItems)
assert.equal(JSON.stringify(matching), originalMatching)
assert.equal(grade([{ ...matching, rightItems: [...matching.rightItems].reverse() }], {
  choices: {}, matches: { [matching.id]: { left1: 'right2', left2: 'right1' } },
}).correct, 1)
const three = { ...matching, rightItems: [...matching.rightItems, { id: 'right3', content: [] }] }
const permutations = new Set<string>()
for (const first of [0, 0.34, 0.67]) {
  for (const second of [0, 0.5]) {
    const draws = [first, second]
    const order = createMatchingOrder([three], () => draws.shift()!)[three.id]!
    assert.deepEqual([...order].sort(), ['right1', 'right2', 'right3'])
    permutations.add(order.join(','))
  }
}
assert.equal(permutations.size, 6) // all Fisher–Yates permutations, including identity
assert.deepEqual(createMatchingOrder([{ ...matching, rightItems: [] }]), { [matching.id]: [] })
assert.deepEqual(createMatchingOrder([{ ...matching, rightItems: matching.rightItems.slice(0, 1) }]), { [matching.id]: ['right1'] })
console.log('PASS: per-attempt right-item permutations preserve IDs, all permutations and scoring')
