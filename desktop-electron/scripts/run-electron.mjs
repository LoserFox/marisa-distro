#!/usr/bin/env node
/**
 * Dev launcher: runs the Electron shell from source against the user's own
 * `dsh` (no embedded backend). Equivalent of desktop/run.sh / justfile run.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const electron = require('electron')

const entry = join(here, '..', 'lib', 'main.js')
if (!existsSync(entry)) {
  console.error('lib/main.js missing — run `npm run build` first')
  process.exit(1)
}
const child = spawn(electron, [entry], { stdio: 'inherit', env: process.env })
child.on('exit', code => process.exit(code ?? 0))
