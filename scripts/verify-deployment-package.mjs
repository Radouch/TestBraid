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
const installationConfigDirectory = join(root, 'testbraid-backend/config')

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
        // Only the initial-install package may have the single reviewed
        // default config/app.json, never author secrets or runtime settings.
        if (['.git', 'node_modules', 'storage', 'vendor'].includes(entry)
          || (entry === 'config' && path !== installationConfigDirectory)) {
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
    'www/index.php',
    'testbraid-backend/templates/index.html',
    'www/.htaccess',
    'www/api/index.php',
    'www/media/.htaccess',
    'testbraid-backend/.htaccess',
    'testbraid-backend/public/index.php',
    'testbraid-backend/composer.json',
    'testbraid-backend/composer.lock',
    'testbraid-backend/src/Http/EnvironmentDiagnostics.php',
    'testbraid-backend/src/Publication/PublicationService.php',
    'testbraid-backend/src/Storage/JsonFileRepository.php',
    'testbraid-backend/schemas/test.schema.json',
    'testbraid-backend/schemas/media.schema.json',
    'testbraid-backend/schemas/fixtures/manifest.json',
    'testbraid-backend/bin/reconcile-public-media.php',
  ]) file(join(root, required))

  for (const forbidden of [
    'testbraid-backend/storage',
    'testbraid-backend/vendor',
    'www/index.html',
    'www/config',
    'www/storage',
    'www/testbraid-backend',
    'www/vendor',
    'www/composer.json',
    'www/phpinfo.php',
  ]) absent(join(root, forbidden))

  // A normal upgrade stages no config. An explicit initial install stages
  // exactly the versioned, non-secret default; reject anything else.
  if (existsSync(installationConfigDirectory)) {
    const entries = readdirSync(installationConfigDirectory)
    if (entries.length !== 1 || entries[0] !== 'app.json') {
      fail('initial configuration must contain only app.json')
    }
    const staged = join(installationConfigDirectory, 'app.json')
    file(staged)
    if (readFileSync(staged, 'utf8') !== readFileSync(join(project, 'backend/config/app.json'), 'utf8')) {
      fail('staged app.json differs from the versioned first-install default')
    }
    const settings = JSON.parse(readFileSync(staged, 'utf8'))
    if (!settings.site || !settings.uploads) fail('initial configuration is missing required sections')
  }

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
      else if (/\.php[0-9]?$/i.test(item.name) && path !== join(web, 'api/index.php') && path !== join(web, 'index.php')) {
        illegalPublicFiles.push(relative(root, path))
      }
    }
  }
  checkWeb(web)
  if (illegalPublicFiles.length) fail('unexpected public PHP files: ' + illegalPublicFiles.join(', '))

  const index = readFileSync(join(root, 'testbraid-backend/templates/index.html'), 'utf8').toLowerCase()
  if (!index.includes('<html')) fail('frontend entry is not an HTML build')
  if (index.includes('src="/assets/') || index.includes('href="/assets/')
      || index.includes('href="/favicon.svg"')) {
    fail('frontend still uses absolute root asset references')
  }
  if (!readFileSync(join(web, 'index.php'), 'utf8').includes('data-testbraid-base')) {
    fail('public PHP index does not inject a runtime base element')
  }
  console.log('PASS: deployment package contains code, schemas and deny policies without runtime secrets')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
