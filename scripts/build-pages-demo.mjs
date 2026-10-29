#!/usr/bin/env node
/**
 * Build the read-only GitHub Pages demo into pages-site/.
 *
 * Usage: node scripts/build-pages-demo.mjs <base-path>
 *   e.g. node scripts/build-pages-demo.mjs /TestBraid   (https://<owner>.github.io/TestBraid/)
 *
 * Requires installed frontend dependencies and backend vendor/ (Composer).
 *
 * 1. Builds the frontend in static-demo mode (no author area, demo banner)
 *    into its own directory. frontend/dist is never touched, so a release
 *    build can never pick up the demo mode by accident.
 * 2. Adds the <base data-testbraid-base> element that PHP's index.php adds on
 *    a real installation, so assets and routes work under <base-path>.
 * 3. Copies index.html to 404.html: GitHub Pages serves it for unknown paths,
 *    which lets the app's own router handle a reloaded /tests/<id> address.
 * 4. Runs backend/bin/export-static-demo.php for the static API files and media.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'pages-site')
const build = join(root, 'pages-build')
const basePath = process.argv[2] ?? ''
// The same shape deployment-base.ts accepts, written without the trailing slash.
if (process.argv.length !== 3 || !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
  console.error('Usage: node scripts/build-pages-demo.mjs <base-path>   e.g. /TestBraid')
  process.exit(1)
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

try {
  if (!existsSync(join(root, 'backend/vendor/autoload.php'))) {
    throw new Error('Install backend dependencies first (cd backend && composer install).')
  }
  rmSync(output, { recursive: true, force: true })
  rmSync(build, { recursive: true, force: true })

  run(join(root, 'frontend/node_modules/.bin/vite'), ['build', '--outDir', build, '--emptyOutDir'], {
    cwd: join(root, 'frontend'),
    env: { ...process.env, TESTBRAID_STATIC_DEMO: '1' },
  })
  mkdirSync(output, { recursive: true })
  cpSync(build, output, { recursive: true })
  rmSync(build, { recursive: true, force: true })

  const index = readFileSync(join(output, 'index.html'), 'utf8')
  if (index.split('<head>').length !== 2) throw new Error('Built index.html must contain exactly one <head>.')
  const shell = index.replace('<head>', `<head>\n    <base data-testbraid-base href="${basePath}/">`)
  writeFileSync(join(output, 'index.html'), shell)
  writeFileSync(join(output, '404.html'), shell)
  // Serve every file as-is; Jekyll processing would skip some paths.
  writeFileSync(join(output, '.nojekyll'), '')

  run('php', [join(root, 'backend/bin/export-static-demo.php'), output, basePath])
  console.log(`GitHub Pages demo built in pages-site/ for ${basePath}/`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
