#!/usr/bin/env node
/**
 * Stage an SFTP-ready deployment tree without copying runtime secrets.
 *
 * Shared JSON schemas live at the repository root so Vue and PHP can use
 * the same contracts. The deployed PHP backend needs a private copy under
 * testbraid-backend/schemas/ because its source checkout is not on the host.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'deployment-package')

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
    'deploy/testbraid-backend/.htaccess',
    'backend/composer.json',
    'backend/composer.lock',
    'backend/config/uploads.json',
    'backend/public/index.php',
    'schemas/test.schema.json',
    'schemas/fixtures/manifest.json',
  ]) {
    requireFile(required)
  }

  rmSync(output, { recursive: true, force: true })

  copyDirectory('frontend/dist', 'www')
  copyDirectory('deploy/www', 'www')
  copyDirectory('backend/public', 'testbraid-backend/public')
  copyDirectory('backend/src', 'testbraid-backend/src')
  copyDirectory('backend/bin', 'testbraid-backend/bin')
  copyDirectory('schemas', 'testbraid-backend/schemas')

  const privateBackend = join(output, 'testbraid-backend')
  cpSync(join(root, 'deploy/testbraid-backend/.htaccess'), join(privateBackend, '.htaccess'))
  cpSync(join(root, 'backend/composer.json'), join(privateBackend, 'composer.json'))
  // Release installations must use the reviewed Composer dependency versions.
  cpSync(join(root, 'backend/composer.lock'), join(privateBackend, 'composer.lock'))
  // Ship a template outside config/: the deployment audit deliberately
  // rejects runtime directories and upgrades must never overwrite config/.
  cpSync(join(root, 'backend/config/uploads.json'), join(privateBackend, 'uploads.example.json'))

  // Runtime config/, storage/ and vendor/ are intentionally NOT part of the
  // generated package. They must survive upgrades on the actual server.
  console.log('Deployment files staged at deployment-package/')
  console.log('Upload www/ to the public web root and testbraid-backend/ to the private backend.')
  console.log('Merge files only: do not delete existing server config/, storage/ or vendor/.')
  console.log('First install: copy uploads.example.json to private config/uploads.json on the server; preserve it on upgrades.')
} catch (error) {
  console.error(`Deployment packaging failed: ${error.message}`)
  process.exitCode = 1
}
