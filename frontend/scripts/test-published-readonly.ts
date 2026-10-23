import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createI18n } from 'vue-i18n'
import { createServer } from 'vite'
import { createChoice, createMatching, type Question } from '../src/editor/model'

const labels = {
  editorQuestionNumber: 'Question {index}',
  editorChoice: 'Choice',
  editorMatching: 'Matching',
  editorSingle: 'Pick one',
  editorMultiple: 'Pick multiple',
  editorOptionNumber: 'Answer {index}',
  editorCorrectBadge: 'CORRECT-KEY',
  editorCorrectPairs: 'Correct pairs',
  editorPairNumber: 'Pair {index}',
  editorLeftItem: 'Left item',
  editorRightItem: 'Right item',
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
try {
  // SSR verifies the actual Vue template without introducing a browser or
  // test-specific copy of the view. This intentionally does not call the API.
  const { default: PublishedQuestionView } = await server.ssrLoadModule('/src/components/PublishedQuestionView.vue')
  const render = async (question: Question): Promise<string> => {
    const app = createSSRApp({
      render: () => h(PublishedQuestionView, { question, index: 0 }),
    })
    app.use(createI18n({ legacy: false, locale: 'en', messages: { en: labels } }))
    return renderToString(app)
  }
  const text = (value: string) => ({ id: crypto.randomUUID(), type: 'text' as const, text: value })
  const privateMediaId = 'e228b9bd-f0cf-437b-b078-245dbfdc8919'

  const choice = createChoice()
  choice.prompt = [
    text('Question with video'),
    { id: crypto.randomUUID(), type: 'video', mediaId: privateMediaId },
  ]
  choice.options[0]!.content = [text('Wrong alternative')]
  choice.options[1]!.content = [
    text('Right alternative'),
    { id: crypto.randomUUID(), type: 'image', mediaId: privateMediaId },
  ]
  choice.correctOptionIds = [choice.options[1]!.id]
  const beforeChoice = JSON.stringify(choice)
  const choiceHtml = await render(choice)
  assert.match(choiceHtml, /Question with video/)
  assert.match(choiceHtml, /Wrong alternative/)
  assert.match(choiceHtml, /Right alternative/)
  assert.match(choiceHtml, /CORRECT-KEY/)
  assert.equal((choiceHtml.match(/CORRECT-KEY/g) ?? []).length, 1)
  assert.equal((choiceHtml.match(/api\/admin\/media\/e228b9bd-f0cf-437b-b078-245dbfdc8919\/preview/g) ?? []).length, 2)
  assert.match(choiceHtml, /<video[^>]*controls/)
  assert.match(choiceHtml, /<img[^>]*src=/)
  assert.doesNotMatch(choiceHtml, /<(?:input|button|select|textarea)\b/i)
  assert.equal(JSON.stringify(choice), beforeChoice, 'Rendering must never modify the published answer key')

  const matching = createMatching()
  matching.prompt = [text('Match each item')]
  matching.leftItems[0]!.content = [text('Left A')]
  matching.leftItems[1]!.content = [text('Left B')]
  matching.rightItems[0]!.content = [text('Right A')]
  matching.rightItems[1]!.content = [text('Right B')]
  // Crossed key: displayed pairs must follow saved IDs, not matching array
  // order or left/right list positions.
  matching.matches = [
    { leftId: matching.leftItems[1]!.id, rightId: matching.rightItems[0]!.id },
    { leftId: matching.leftItems[0]!.id, rightId: matching.rightItems[1]!.id },
  ]
  const beforeMatching = JSON.stringify(matching)
  const matchingHtml = await render(matching)
  const positions = ['Left A', 'Right B', 'Left B', 'Right A'].map(x => matchingHtml.indexOf(x))
  assert.ok(positions.every(x => x !== -1))
  assert.ok(positions.every((x, i) => i === 0 || x > positions[i - 1]!), 'Saved cross-pairs must remain aligned')
  assert.equal((matchingHtml.match(/Pair [12]/g) ?? []).length, 4) // accessible pair label + heading
  assert.doesNotMatch(matchingHtml, /<(?:input|button|select|textarea)\b/i)
  assert.equal(JSON.stringify(matching), beforeMatching)

  console.log('PASS: published choice/matching read-only Vue rendering, media and saved answer keys')
} finally {
  await server.close()
}
