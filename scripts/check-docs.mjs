#!/usr/bin/env node
/**
 * Check the documentation's links and its English/Czech pairing.
 *
 * - Every user page exists in both docs/en/ and docs/cs/ under the same file
 *   name (README.md pairs with README.cs.md). Only the developer pages listed
 *   in ENGLISH_ONLY may lack a Czech version.
 * - Each paired page starts, right under its title, with the language switch
 *   that links to its counterpart, so a reader can change language anywhere.
 * - Both versions of a page have the same heading structure, which catches a
 *   section added or removed in one language only.
 * - Every relative link and #section anchor resolves, using GitHub's heading
 *   slugs (which keep Czech letters with diacritics).
 *
 * Plain Node, no dependencies; reads files only.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENGLISH_ONLY = new Set(['architecture.md', 'development.md'])
const problems = []
const fail = (file, message) => problems.push(`${relative(root, file)}: ${message}`)
const read = file => readFileSync(file, 'utf8')
const markdownIn = directory => readdirSync(directory).filter(name => name.endsWith('.md')).sort()

/** Drop fenced code blocks and inline code, which may contain "](" or "#". */
function prose(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '')
}

/** Heading levels and texts outside code blocks. */
function headings(text) {
  return [...prose(text).matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)]
    .map(match => ({ level: match[1].length, text: match[2] }))
}

/** Anchors GitHub generates for a page's headings, numbering duplicates. */
function anchors(file) {
  const seen = new Map()
  return new Set(headings(read(file)).map(({ text: heading }) => {
    const slug = heading.toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)
    return count === 0 ? slug : `${slug}-${count}`
  }))
}

/** The first non-empty line after the page's title. */
function lineUnderTitle(text) {
  const lines = text.split('\n')
  const title = lines.findIndex(line => line.startsWith('# '))
  return title === -1 ? null : lines.slice(title + 1).find(line => line.trim() !== '')?.trim()
}

// 1. Pairs, language switches and heading structure.
const pairs = [[join(root, 'README.md'), join(root, 'README.cs.md'), 'README.md', 'README.cs.md']]
const english = markdownIn(join(root, 'docs/en'))
const czech = markdownIn(join(root, 'docs/cs'))
for (const name of english) {
  if (czech.includes(name)) {
    pairs.push([join(root, 'docs/en', name), join(root, 'docs/cs', name), `../en/${name}`, `../cs/${name}`])
  } else if (!ENGLISH_ONLY.has(name)) {
    fail(join(root, 'docs/en', name), 'has no Czech version in docs/cs/ (or add it to ENGLISH_ONLY in scripts/check-docs.mjs)')
  }
}
for (const name of czech) {
  if (!english.includes(name)) fail(join(root, 'docs/cs', name), 'has no English version in docs/en/')
}
for (const [en, cs, enLink, csLink] of pairs) {
  if (!existsSync(cs)) {
    fail(en, `has no Czech version ${relative(root, cs)}`)
    continue
  }
  const expected = [[en, `**English** · [Čeština](${csLink})`], [cs, `[English](${enLink}) · **Čeština**`]]
  for (const [file, line] of expected) {
    if (lineUnderTitle(read(file)) !== line) fail(file, `the line under the title must be the language switch: ${line}`)
  }
  const shape = file => headings(read(file)).map(heading => heading.level).join(',')
  if (shape(en) !== shape(cs)) {
    fail(cs, `heading structure differs from ${relative(root, en)} (levels ${shape(cs)} vs ${shape(en)})`)
  }
}

// 2. Relative links and section anchors in all project Markdown.
const files = [
  ...pairs.flatMap(([en, cs]) => [en, cs]),
  ...[...ENGLISH_ONLY].map(name => join(root, 'docs/en', name)),
  join(root, 'demo/README.md'),
].filter(existsSync)
for (const file of new Set(files)) {
  for (const [, target] of prose(read(file)).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // https:, mailto: and similar
    const [path, anchor] = target.split('#')
    const destination = path === '' ? file : resolve(dirname(file), decodeURIComponent(path))
    if (!existsSync(destination)) {
      fail(file, `broken link ${target}`)
    } else if (anchor !== undefined && destination.endsWith('.md')
      && !anchors(destination).has(decodeURIComponent(anchor))) {
      fail(file, `link ${target} points to a section that does not exist`)
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`${problems.length} documentation problem(s) found`)
  process.exitCode = 1
} else {
  console.log(`PASS: ${pairs.length} English/Czech page pairs and all relative links in ${new Set(files).size} files`)
}
