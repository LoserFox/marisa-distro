/**
 * Import-graph contract: the plugin author surface must never import Cordis
 * (spec §3 "类型归属", HP:134). The invariant companion is repo machinery
 * (a Cordis Loader plugin like every package's `./invariant`), not part of the
 * author-facing surface, so it is the one excluded file.
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const CORDIS_SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)['"]@deepseek-ai\/cordis['"]/

describe('dsh-mygo-api author surface', () => {
  it('imports no Cordis anywhere in src except the invariant companion', () => {
    const files = globSync('**/*.ts', { cwd: SRC_DIR }).sort()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      if (file === 'invariant.ts') continue
      const source = readFileSync(resolve(SRC_DIR, file), 'utf8')
      expect(source, file).not.toMatch(CORDIS_SPECIFIER)
    }
  })

  it('keeps the invariant companion as the only src file importing Cordis', () => {
    const companion = readFileSync(resolve(SRC_DIR, 'invariant.ts'), 'utf8')
    expect(companion).toMatch(CORDIS_SPECIFIER)
  })
})
