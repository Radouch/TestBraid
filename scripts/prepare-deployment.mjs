#!/usr/bin/env node
/**
 * Stage an SFTP-ready deployment tree without copying runtime secrets.
 *
 * Shared JSON schemas live at the repository root so Vue and PHP can use
 * the same contracts. The deployed PHP backend needs a private copy under
 * testbraid-backend/schemas/ because its source checkout is not on the host.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'deployment-package')
const args = process.argv.slice(2)
const allowedFlags = new Set(['--initial-install', '--include-vendor'])
if (args.some(arg => !allowedFlags.has(arg)) || new Set(args).size !== args.length) {
  console.error('Usage: node scripts/prepare-deployment.mjs [--initial-install] [--include-vendor]')
  process.exit(1)
}
const initialInstall = args.includes('--initial-install')
const includeVendor = args.includes('--include-vendor')

function requireFile(relativePath) {
  const absolute = join(root, relativePath)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Missing ${relativePath}. Build frontend first (cd frontend && npm run build), and use a complete repository checkout.`)
  }
}

function copyDirectory(relativeSource, relativeDestination) {
  const source = join(root, relativeSource)
  const target = join(output, relativeDestination)
  mkdirSync(target, { recursive: true })

  // Copy the *contents* of a directory, not an extra nested directory.
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in deployment source: ${relativeSource}/${entry.name}`)
    }
    cpSync(join(source, entry.name), join(target, entry.name), { recursive: true, force: true })
  }
}

try {
  // Validate required inputs before replacing a previous staging directory.
  for (const required of [
    'frontend/dist/index.html',
    'deploy/www/.htaccess',
    'deploy/www/api/index.php',
    'deploy/www/index.php',
    'deploy/www/backend-path.php',
    'deploy/www/bootstrap.local.example.php',
    'deploy/testbraid-backend/security-probe.txt',
    'deploy/testbraid-backend/.htaccess',
    'backend/composer.json',
    'backend/composer.lock',
    'backend/config/app.json',
    'backend/public/index.php',
    'schemas/test.schema.json',
    'schemas/fixtures/manifest.json',
  ]) {
    requireFile(required)
  }

  if (includeVendor) requireFile('backend/vendor/autoload.php')
  if (initialInstall) requireFile('demo/storage/groups/e7472376-d56a-4384-ad1c-a1606dabddb7.json')

  rmSync(output, { recursive: true, force: true })

  copyDirectory('frontend/dist', 'www')
  // The static Vite entry is a private template rendered by PHP with the
  // installation-specific base; all hashed assets stay in public www.
  const templateDirectory = join(output, 'testbraid-backend/templates')
  mkdirSync(templateDirectory, { recursive: true })
  renameSync(join(output, 'www/index.html'), join(templateDirectory, 'index.html'))
  copyDirectory('deploy/www', 'www')
  // The optional bootstrap template is for first installations only.
  // Existing installations keep their own bootstrap.local.php during upgrades.
  if (!initialInstall) rmSync(join(output, 'www/bootstrap.local.example.php'))
  copyDirectory('backend/public', 'testbraid-backend/public')
  copyDirectory('backend/src', 'testbraid-backend/src')
  copyDirectory('backend/bin', 'testbraid-backend/bin')
  copyDirectory('schemas', 'testbraid-backend/schemas')

  const privateBackend = join(output, 'testbraid-backend')
  cpSync(join(root, 'deploy/testbraid-backend/.htaccess'), join(privateBackend, '.htaccess'))
  cpSync(join(root, 'deploy/testbraid-backend/security-probe.txt'), join(privateBackend, 'security-probe.txt'))
  cpSync(join(root, 'backend/composer.json'), join(privateBackend, 'composer.json'))
  // Release installations must use the reviewed Composer dependency versions.
  cpSync(join(root, 'backend/composer.lock'), join(privateBackend, 'composer.lock'))
  // Release archives include locked PHP dependencies. The default SFTP
  // staging mode deliberately remains compatible with an existing vendor/.
  if (includeVendor) copyDirectory('backend/vendor', 'testbraid-backend/vendor')
  // Only an explicitly requested FIRST installation stages an editable default.
  // Normal upgrades must never include config/, because blindly merging an
  // archive over a live host can overwrite operator-owned settings.
  if (initialInstall) {
    const configDirectory = join(privateBackend, 'config')
    mkdirSync(configDirectory, { recursive: true })
    cpSync(join(root, 'backend/config/app.json'), join(configDirectory, 'app.json'))

    // A fresh site starts with the published demo lesson from demo/storage.
    // Its private records go to storage/, and the public copies that
    // publication would have made go to www/media/<uuid>.<ext>. Upgrades
    // never include either, so they cannot touch an operator's own data.
    copyDirectory('demo/storage', 'testbraid-backend/storage')
    copyDirectory('demo/storage/media-files', 'www/media')
  }

  console.log('Deployment files staged at deployment-package/')
  console.log('Upload www/ to the public web root and testbraid-backend/ to the private backend.')
  console.log('IMPORTANT: after EVERY frontend build, also upload testbraid-backend/templates/index.html.')
  console.log('That private HTML template points to hashed JS/CSS assets. Uploading only www/ can leave the old frontend running.')
  console.log('Merge files only: never delete existing server config/, storage/ or public media/.')
  console.log(includeVendor
    ? 'Release package: replace the complete server vendor/ directory; do not merge stale dependencies.'
    : 'SFTP staging: existing vendor/ is not included and must be preserved.')
  console.log(initialInstall
    ? 'Initial install package: includes private config/app.json. Use only on a NEW host.'
    : 'Upgrade-safe package: no config/ is included. For a NEW host, regenerate with --initial-install.')
} catch (error) {
  console.error(`Deployment packaging failed: ${error.message}`)
  process.exitCode = 1
}
