#!/usr/bin/env node
/**
 * Verify the SFTP-ready staging tree, not just source-checkout files.
 * Never contacts the host or touches persistent author data.
 */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(process.argv[2] ?? join(project, 'deployment-package'))
const web = join(root, 'www')

function fail(reason) { throw new Error('Deployment package rejected: ' + reason) }
function file(path) {
  if (!existsSync(path) || !lstatSync(path).isFile()) fail('missing file ' + relative(root, path))
}
function absent(path) {
  if (existsSync(path)) fail('must not stage ' + relative(root, path))
}

try {
  if (process.argv.length > 3) fail('expected at most one package directory argument')
  if (!existsSync(root) || !lstatSync(root).isDirectory()) fail('staging root does not exist')

  // Reject any symlink (including nested ones), even inside dist assets.
  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) fail('symlink at ' + relative(root, path))
      if (stat.isDirectory()) {
        if (['.git', 'node_modules', 'config', 'storage', 'vendor'].includes(entry)) {
          fail('runtime or development directory: ' + relative(root, path))
        }
        walk(path)
      } else if (!stat.isFile()) {
        fail('non-regular file: ' + relative(root, path))
      }
    }
  }
  walk(root)

  for (const required of [
    'www/index.html',
    'www/.htaccess',
    'www/api/index.php',
    'www/media/.htaccess',
    'testbraid-backend/.htaccess',
    'testbraid-backend/public/index.php',
    'testbraid-backend/composer.json',
    'testbraid-backend/src/Http/EnvironmentDiagnostics.php',
    'testbraid-backend/src/Publication/PublicationService.php',
    'testbraid-backend/src/Storage/JsonFileRepository.php',
    'testbraid-backend/schemas/test.schema.json',
    'testbraid-backend/schemas/media.schema.json',
    'testbraid-backend/schemas/fixtures/manifest.json',
    'testbraid-backend/bin/reconcile-public-media.php',
  ]) file(join(root, required))

  for (const forbidden of [
    'testbraid-backend/config',
    'testbraid-backend/storage',
    'testbraid-backend/vendor',
    'www/config',
    'www/storage',
    'www/testbraid-backend',
    'www/vendor',
    'www/composer.json',
    'www/phpinfo.php',
  ]) absent(join(root, forbidden))

  // The media directory in the release must not contain uploaded files.
  const stagedMedia = readdirSync(join(web, 'media'))
  if (stagedMedia.length !== 1 || stagedMedia[0] !== '.htaccess') {
    fail('public media directory contains something other than its deny policy')
  }
  const rule = readFileSync(join(web, 'media/.htaccess'), 'utf8')
  const sourceRule = readFileSync(join(project, 'deploy/www/media/.htaccess'), 'utf8')
  if (rule !== sourceRule || !rule.includes('Require all denied')
    || !rule.includes('FilesMatch') || !rule.includes('stage-')) {
    fail('missing or unexpected Apache media deny rules')
  }

  // Only the public bootstrap may be executable PHP under www.
  const illegalPublicFiles = []
  function checkWeb(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) checkWeb(path)
      else if (/\.php[0-9]?$/i.test(item.name) && path !== join(web, 'api/index.php')) {
        illegalPublicFiles.push(relative(root, path))
      }
    }
  }
  checkWeb(web)
  if (illegalPublicFiles.length) fail('unexpected public PHP files: ' + illegalPublicFiles.join(', '))

  const index = readFileSync(join(web, 'index.html'), 'utf8').toLowerCase()
  if (!index.includes('<html')) fail('frontend entry is not an HTML build')
  console.log('PASS: deployment package contains code, schemas and deny policies without secrets or runtime files')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
