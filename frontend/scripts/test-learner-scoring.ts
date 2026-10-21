import assert from 'node:assert/strict'
import type { ChoiceQuestion, MatchingQuestion, Question } from '../src/editor/model'
import { freshAnswers, grade, setChoiceAnswer, setMatchingAnswer } from '../src/learner/scoring'

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

console.log('PASS: anonymous scorer exact-choice sets, complete matching bijection, unanswered and reset')
