/**
 * Link DSH's private workspace packages for local typechecks and tests.
 *
 * Published plugin artifacts never resolve these paths directly: DSH Web and
 * the selected profile provide them as peer dependencies at runtime.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.DSH_SOURCE

if (source === undefined || source.length === 0) {
  console.error('link-dsh: set DSH_SOURCE to a DeepSeek Harness checkout')
  process.exit(1)
}

const checkout = resolve(source)
if (!existsSync(join(checkout, 'packages')) || !existsSync(join(checkout, 'vendor', 'cordis'))) {
  console.error(`link-dsh: ${checkout} is not a DeepSeek Harness checkout`)
  process.exit(1)
}

const links = {
  '@deepseek-ai/dsh-agent': 'packages/core/agent',
  '@deepseek-ai/dsh-client-connection': 'packages/client/connection',
  '@deepseek-ai/dsh-client-locale': 'packages/client/locale',
  '@deepseek-ai/dsh-client-runtime': 'packages/client/runtime',
  '@deepseek-ai/dsh-client-ui-conversation': 'packages/client/ui-conversation',
  '@deepseek-ai/dsh-client-ui-settings': 'packages/client/ui-settings',
  '@deepseek-ai/dsh-client-ui-slots': 'packages/client/ui-slots',
  '@deepseek-ai/dsh-host-apiproxy': 'packages/host/apiproxy',
  '@deepseek-ai/dsh-invariants': 'packages/support/invariants',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-session': 'packages/core/session',
  '@deepseek-ai/dsh-session-persistence': 'packages/session-persistence/session-persistence',
  '@deepseek-ai/dsh-settings': 'packages/settings/settings',
  '@deepseek-ai/dsh-storage': 'packages/storage/storage',
  '@deepseek-ai/dsh-storage-domain': 'packages/storage/storage-domain',
  '@deepseek-ai/dsh-storage-json': 'packages/storage/storage-json',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
  '@deepseek-ai/dsh-workspace': 'packages/workspace/workspace',
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
}

const developmentPackages = [
  '@testing-library/dom',
  '@testing-library/react',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'jsdom',
  'react',
  'react-dom',
  'tsdown',
  'typescript',
  'vitest',
  'zod',
]

const preferredDevelopmentVersions = {
  '@testing-library/dom': '10.4.1',
  '@types/node': '22.20.0',
  '@types/react': '18.3.31',
  '@types/react-dom': '18.3.7',
  '@testing-library/react': '16.3.2',
  jsdom: '29.1.1',
  react: '18.3.1',
  'react-dom': '18.3.1',
  tsdown: '0.22.2',
  typescript: '6.0.3',
  vitest: '4.1.8',
  zod: '4.4.3',
}

/** Replace one symlink or filesystem entry, including a dangling symlink. */
function replaceWithLink(target, destination) {
  mkdirSync(dirname(destination), { recursive: true })
  try {
    lstatSync(destination)
    rmSync(destination, { recursive: true, force: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  symlinkSync(target, destination, 'dir')
}

for (const [name, relative] of Object.entries(links)) {
  const target = join(checkout, relative)
  const destination = join(root, 'node_modules', name)
  if (!existsSync(target)) {
    console.error(`link-dsh: missing ${target}`)
    process.exit(1)
  }
  replaceWithLink(target, destination)
  console.log(`linked ${name}`)
}

const sourceStore = join(checkout, 'node_modules', '.pnpm')

/** Locate one concrete package directory inside pnpm's content-addressed layout. */
function resolveStoredPackage(name) {
  const segments = name.split('/')
  const matches = []
  for (const entry of readdirSync(sourceStore)) {
    const candidate = join(sourceStore, entry, 'node_modules', ...segments)
    const manifest = join(candidate, 'package.json')
    if (!existsSync(manifest)) continue
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (parsed.name === name) matches.push({ candidate, version: parsed.version })
  }
  if (matches.length === 0) {
    console.error(`link-dsh: ${name} is not installed in ${sourceStore}`)
    process.exit(1)
  }
  const preferred = matches.find(match => match.version === preferredDevelopmentVersions[name])
  if (preferred !== undefined) return preferred.candidate
  matches.sort((left, right) => left.version.localeCompare(right.version, undefined, { numeric: true }))
  return matches.at(-1).candidate
}

for (const name of developmentPackages) {
  const target = resolveStoredPackage(name)
  replaceWithLink(target, join(root, 'node_modules', ...name.split('/')))
  console.log(`linked ${name}`)
}

const binDirectory = join(root, 'node_modules', '.bin')
mkdirSync(binDirectory, { recursive: true })
for (const [name, relative] of Object.entries({
  tsc: 'node_modules/typescript/bin/tsc',
  tsdown: 'node_modules/tsdown/dist/run.mjs',
  vitest: 'node_modules/vitest/vitest.mjs',
})) {
  replaceWithLink(join(root, relative), join(binDirectory, name))
}
