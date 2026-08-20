// Marisa fork tests: seedZenDefault — first-run anonymous Zen default for
// ~/.modlens/config.json. Plain node:test, no framework, no build step.
// Run: node --test tests/  (see package.json "test:seed")
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seedZenDefault, ZEN_DEFAULT_SEED } from '../dsh/index.js'

async function tempHome() {
  return mkdtemp(join(tmpdir(), 'modlens-seed-'))
}

test('seeds the Zen default when the config file is missing', async () => {
  const home = await tempHome()
  try {
    const configPath = join(home, '.modlens', 'config.json')
    const seeded = seedZenDefault(configPath)
    assert.equal(seeded, true)
    assert.equal(existsSync(configPath), true)
    const parsed = JSON.parse(await readFile(configPath, 'utf8'))
    assert.equal(parsed.provider, 'openai')
    assert.equal(parsed.providers.openai.baseUrl, 'https://opencode.ai/zen/v1')
    assert.equal(parsed.providers.openai.model, 'mimo-v2.5-free')
    assert.equal(parsed.seededBy, ZEN_DEFAULT_SEED.seededBy)
    // The seed object must equal the exported default exactly.
    assert.deepEqual(parsed, ZEN_DEFAULT_SEED)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('never overwrites an existing user configuration', async () => {
  const home = await tempHome()
  try {
    const configPath = join(home, '.modlens', 'config.json')
    await mkdir(join(home, '.modlens'), { recursive: true })
    await writeFile(configPath, '{"provider":"gemini-api","providers":{"gemini-api":{"apiKey":"x"}}}\n', { mode: 0o600 })
    const seeded = seedZenDefault(configPath)
    assert.equal(seeded, false)
    assert.equal(await readFile(configPath, 'utf8'), '{"provider":"gemini-api","providers":{"gemini-api":{"apiKey":"x"}}}\n')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('force overwrites an existing file', async () => {
  const home = await tempHome()
  try {
    const configPath = join(home, '.modlens', 'config.json')
    await mkdir(join(home, '.modlens'), { recursive: true })
    await writeFile(configPath, '{"provider":"gemini-api"}')
    const seeded = seedZenDefault(configPath, ZEN_DEFAULT_SEED, { force: true })
    assert.equal(seeded, true)
    assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), ZEN_DEFAULT_SEED)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('returns false instead of throwing when the config cannot be written', async () => {
  const home = await tempHome()
  try {
    // A file in the way of the parent directory makes mkdir/write fail.
    const blocker = join(home, '.modlens')
    await writeFile(blocker, 'not a directory')
    const configPath = join(blocker, 'config.json')
    const seeded = seedZenDefault(configPath)
    assert.equal(seeded, false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
