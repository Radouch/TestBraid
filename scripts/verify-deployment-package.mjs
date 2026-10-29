#!/usr/bin/env node
/**
 * Verify the SFTP-ready staging tree, not just source-checkout files.
 * Never contacts the host or touches persistent author data.
 */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const releaseMode = args.includes('--release')
const paths = args.filter(arg => arg !== '--release')
const root = resolve(paths[0] ?? join(project, 'deployment-package'))
const web = join(root, 'www')
const installationConfigDirectory = join(root, 'testbraid-backend/config')
const vendorDirectory = join(root, 'testbraid-backend/vendor')
const storageDirectory = join(root, 'testbraid-backend/storage')
const demoStorage = join(project, 'demo/storage')
// Only an initial-install package carries config/ and, with it, the demo lesson.
const initialInstall = existsSync(installationConfigDirectory)

function fail(reason) { throw new Error('Deployment package rejected: ' + reason) }
function file(path) {
  if (!existsSync(path) || !lstatSync(path).isFile()) fail('missing file ' + relative(root, path))
}
function absent(path) {
  if (existsSync(path)) fail('must not stage ' + relative(root, path))
}
/** Require a staged directory to match a source directory file for file. */
function sameTree(source, staged) {
  if (!existsSync(staged) || !lstatSync(staged).isDirectory()) fail('missing directory ' + relative(root, staged))
  const sourceEntries = readdirSync(source).sort()
  const stagedEntries = readdirSync(staged).sort()
  if (sourceEntries.join('\n') !== stagedEntries.join('\n')) fail('unexpected contents in ' + relative(root, staged))
  for (const entry of sourceEntries) {
    const from = join(source, entry)
    const to = join(staged, entry)
    if (lstatSync(from).isDirectory()) sameTree(from, to)
    else if (!lstatSync(to).isFile() || !readFileSync(from).equals(readFileSync(to))) {
      fail('staged file differs from source: ' + relative(root, to))
    }
  }
}

try {
  if (paths.length > 1 || args.filter(arg => arg === '--release').length > 1
      || paths.some(arg => arg.startsWith('--'))) {
    fail('usage: node scripts/verify-deployment-package.mjs [directory] [--release]')
  }
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
        const insideComposerPackage = path.startsWith(vendorDirectory + sep)
        if (['.git', 'node_modules'].includes(entry)
          || (entry === 'storage' && (!initialInstall || path !== storageDirectory))
          || (entry === 'vendor' && (!releaseMode || path !== vendorDirectory))
          || (entry === 'config' && path !== installationConfigDirectory && !insideComposerPackage)) {
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
    'www/backend-path.php',
    'testbraid-backend/security-probe.txt',
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

  if (releaseMode) {
    // Complete releases must carry Composer 2's production autoloader and
    // package manifest so the hosting operator never needs to run Composer.
    file(join(root, 'testbraid-backend/vendor/autoload.php'))
    file(join(root, 'testbraid-backend/vendor/composer/installed.php'))
  } else {
    absent(join(root, 'testbraid-backend/vendor'))
  }

  for (const forbidden of [
    'www/index.html',
    'www/bootstrap.local.php',
    'www/config',
    'www/storage',
    'www/testbraid-backend',
    'www/vendor',
    'www/composer.json',
    'www/phpinfo.php',
  ]) absent(join(root, forbidden))

  // The bootstrap template accompanies only an initial installation.
  // An upgrade must not copy the example or overwrite the operator's local settings.
  const bootstrapExample = join(web, 'bootstrap.local.example.php')
  if (initialInstall) {
    file(bootstrapExample)
    if (readFileSync(bootstrapExample, 'utf8')
        !== readFileSync(join(project, 'deploy/www/bootstrap.local.example.php'), 'utf8')) {
      fail('staged bootstrap example differs from the versioned template')
    }
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
  } else {
    absent(bootstrapExample)
  }

  // The demo lesson's private storage must be an exact copy of demo/storage,
  // so a package can never ship author accounts, drafts or other runtime data.
  if (initialInstall) {
    sameTree(demoStorage, storageDirectory)
  } else {
    absent(storageDirectory)
  }

  // Public media holds only its deny policy, plus in an initial install the
  // demo lesson's published copies, identical to the private originals.
  const stagedMedia = readdirSync(join(web, 'media')).sort()
  const expectedMedia = ['.htaccess', ...(initialInstall ? readdirSync(join(demoStorage, 'media-files')) : [])].sort()
  if (stagedMedia.join('\n') !== expectedMedia.join('\n')) {
    fail('public media directory contains something other than its deny policy and demo media')
  }
  for (const name of expectedMedia.filter(name => name !== '.htaccess')) {
    if (!readFileSync(join(web, 'media', name)).equals(readFileSync(join(demoStorage, 'media-files', name)))) {
      fail('staged demo media differs from demo/storage: ' + name)
    }
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
      else if (/\.php[0-9]?$/i.test(item.name) && path !== join(web, 'api/index.php') && path !== join(web, 'index.php')
        && path !== join(web, 'backend-path.php')
        && path !== join(web, 'bootstrap.local.example.php')) {
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
  console.log('PASS: ' + (releaseMode ? 'release' : 'SFTP')
    + ' deployment package contains code, schemas and deny policies without runtime secrets')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
