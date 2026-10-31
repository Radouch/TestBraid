import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The colour tokens in theme.css must meet WCAG 2.1 AA in both schemes:
// 4.5:1 for text, 3:1 for control borders and other non-text indicators.
// Surfaces come from Bootstrap 5.3: white (light) and #212529 and #343a40 (dark).
const css = readFileSync('src/theme.css', 'utf8')

function block(selector: RegExp): Map<string, string> {
  const body = selector.exec(css)?.[1]
  assert.ok(body, 'Missing block ' + selector)
  const tokens = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name!, value!.trim())
  return tokens
}
const light = block(/:root,\s*\[data-bs-theme=light\]\s*\{([^}]*)\}/)
// Tokens the dark block does not set keep their light values, as in the browser.
const dark = new Map([...light, ...block(/^\[data-bs-theme=dark\]\s*\{([^}]*)\}/m)])

/** A token's colour as [r, g, b], following var() references. */
function rgb(tokens: Map<string, string>, value: string): number[] {
  const reference = /^var\((--[\w-]+)\)$/.exec(value)
  if (reference) {
    const target = tokens.get(reference[1]!)
    assert.ok(target, 'Unknown token ' + reference[1])
    return rgb(tokens, target)
  }
  if (value.startsWith('#')) {
    const hex = value.length === 4 ? [...value.slice(1)].map(digit => digit + digit).join('') : value.slice(1)
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16))
  }
  const channels = value.split(',').map(Number)
  assert.ok(channels.length === 3 && channels.every(Number.isFinite), 'Not a colour: ' + value)
  return channels
}
function luminance([red, green, blue]: number[]): number {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red!) + 0.7152 * linear(green!) + 0.0722 * linear(blue!)
}
function ratio(tokens: Map<string, string>, foreground: string, background: string): number {
  const [high, low] = [luminance(rgb(tokens, foreground)), luminance(rgb(tokens, background))].sort((a, b) => b - a)
  return (high! + 0.05) / (low! + 0.05)
}

const TEXT = 4.5
const NON_TEXT = 3
// [foreground, background, minimum, what it is]
type Check = [string, string, number, string]
const checks: Record<'light' | 'dark', [Map<string, string>, Check[]]> = {
  light: [light, [
    ['#ffffff', 'var(--app-accent)', TEXT, 'button text on the accent'],
    ['#ffffff', 'var(--app-accent-hover)', TEXT, 'button text on the hovered accent'],
    ['#ffffff', 'var(--app-accent-active)', TEXT, 'button text on the pressed accent'],
    ['var(--app-accent-text)', '#ffffff', TEXT, 'accent text'],
    ['var(--bs-link-color)', 'var(--app-page-bg)', TEXT, 'links on the page canvas'],
    ['var(--bs-primary-text-emphasis)', 'var(--bs-primary-bg-subtle)', TEXT, 'emphasis text on the accent tint'],
    ['var(--bs-secondary-rgb)', 'var(--app-page-bg)', TEXT, 'secondary text on the page canvas'],
    ['var(--app-control-border)', '#ffffff', NON_TEXT, 'radio and checkbox borders'],
    ['var(--app-field-border)', '#ffffff', NON_TEXT, 'text field borders'],
    ['var(--app-amber)', '#ffffff', TEXT, 'amber text and borders'],
    ['var(--app-amber-strong)', 'var(--app-amber-bg)', TEXT, 'missed-answer text on the amber tint'],
    ['var(--app-amber-contrast)', 'var(--app-amber)', TEXT, 'text on an amber fill'],
  ]],
  dark: [dark, [
    ['#ffffff', 'var(--app-accent)', TEXT, 'button text on the accent'],
    ['#ffffff', 'var(--app-accent-hover)', TEXT, 'button text on the hovered accent'],
    ['#ffffff', 'var(--app-accent-active)', TEXT, 'button text on the pressed accent'],
    ['var(--app-accent)', '#212529', NON_TEXT, 'checked inputs and selection borders'],
    ['var(--app-accent-text)', '#212529', TEXT, 'accent text'],
    ['var(--app-accent-text)', '#343a40', TEXT, 'accent text on the secondary surface'],
    ['var(--app-accent-text)', 'var(--app-page-bg)', TEXT, 'accent text on the page canvas'],
    ['var(--bs-link-hover-color)', '#212529', TEXT, 'hovered links'],
    ['var(--bs-primary-text-emphasis)', 'var(--bs-primary-bg-subtle)', TEXT, 'emphasis text on the accent tint'],
    ['var(--bs-secondary-rgb)', '#212529', TEXT, 'secondary text'],
    ['var(--bs-secondary-rgb)', 'var(--app-page-bg)', TEXT, 'secondary text on the page canvas'],
    ['var(--app-control-border)', '#212529', NON_TEXT, 'radio and checkbox borders'],
    ['var(--app-field-border)', '#212529', NON_TEXT, 'text field borders'],
    ['var(--app-field-border)', 'var(--app-page-bg)', NON_TEXT, 'text field borders on the page canvas'],
    ['var(--app-amber)', '#212529', TEXT, 'amber text and borders'],
    ['var(--app-amber)', 'var(--app-amber-bg)', NON_TEXT, 'missed-answer border on the amber tint'],
    ['var(--app-amber-strong)', 'var(--app-amber-bg)', TEXT, 'missed-answer text on the amber tint'],
    ['var(--app-amber-contrast)', 'var(--app-amber)', TEXT, 'text on an amber fill'],
  ]],
}

for (const [scheme, [tokens, list]] of Object.entries(checks)) {
  for (const [foreground, background, minimum, what] of list) {
    const value = ratio(tokens, foreground, background)
    assert.ok(value >= minimum, `${scheme}: ${what} is ${value.toFixed(2)}:1, needs ${minimum}:1`)
  }
  // Each -rgb token must describe the same colour as the token it mirrors.
  for (const [hex, channels] of [['--app-accent', '--app-accent-rgb'], ['--app-amber', '--app-amber-rgb'],
    ['--bs-link-color', '--bs-link-color-rgb'], ['--bs-link-hover-color', '--bs-link-hover-color-rgb']]) {
    assert.deepEqual(rgb(tokens, tokens.get(channels!)!), rgb(tokens, tokens.get(hex!)!), `${scheme}: ${channels} matches ${hex}`)
  }
  console.log(`PASS THEME: ${list.length} ${scheme} colour pairs meet WCAG 2.1 AA, and the rgb tokens match their colours`)
}
