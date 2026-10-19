import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDocument, type DocumentKind } from '../src/validation/schema'
import { validatePublication } from '../src/validation/publication'

// Both runtimes read exactly the same fixtures: do not duplicate test inputs.
const fixturesDir = fileURLToPath(new URL('../../schemas/fixtures/', import.meta.url))
const manifest = JSON.parse(readFileSync(join(fixturesDir, 'manifest.json'), 'utf8')) as {
  knownGroups: string[]
  knownMedia: Array<{ id: string; kind: 'image' | 'video' }>
  cases: Array<{ path: string; kind: DocumentKind; structural: boolean; publish?: boolean }>
}

const groupIds = new Set(manifest.knownGroups)
const media = new Map(manifest.knownMedia.map(item => [item.id, item.kind]))
let failures = 0

for (const fixture of manifest.cases) {
  const data: unknown = JSON.parse(readFileSync(join(fixturesDir, fixture.path), 'utf8'))
  const structural = validateDocument(fixture.kind, data)
  let passed = structural.valid === fixture.structural
  let description = structural.valid ? 'structurally valid' : 'structurally invalid'

  if (structural.valid && fixture.kind === 'test' && fixture.publish !== undefined) {
    const publication = validatePublication(data, {
      groupExists: id => groupIds.has(id),
      mediaExists: (id, kind) => media.get(id) === kind,
    })
    passed = passed && publication.valid === fixture.publish
    description += publication.valid ? ', publishable' : ', not publishable'
  }

  if (!passed) failures++
  console.log(`${passed ? 'PASS' : 'FAIL'} ${fixture.path}: ${description}`)
}

console.log(`${manifest.cases.length - failures}/${manifest.cases.length} fixtures passed`)
if (failures > 0) process.exitCode = 1
