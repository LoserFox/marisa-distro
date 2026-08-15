/** Tests for the portable bundle manifest and built-artifact contract. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Record<string, any>

describe('package layout', () => {
  it('declares a DSH bundle patch and browser client export', () => {
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client).toMatchObject({ platform: 'web' })
    expect(manifest.exports['./client'].default).toBe('./lib/client.js')
  })

  it('ships the built runtime, declarations, docs, patch, and prepack build', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['lib', 'src', 'docs', 'cordis.patch.yml', 'README.md', 'LICENSE']))
    expect(manifest.scripts.build).toContain('tsdown')
    expect(manifest.scripts.prepack).toBe('pnpm run build')
    expect(existsSync(resolve(root, 'src/index.ts'))).toBe(true)
    expect(existsSync(resolve(root, 'src/client/index.ts'))).toBe(true)
  })

  it('contains no machine-local dependency specs', () => {
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }
    for (const specifier of Object.values(dependencies) as string[]) {
      expect(specifier).not.toMatch(/^(?:file:|link:|\/Users\/|[A-Za-z]:[\\/])/)
    }
  })

  it('ships zod as runtime code and accepts the supported 0812 prerelease peers', () => {
    expect(manifest.dependencies?.zod).toBe('^4.4.3')
    expect(manifest.devDependencies?.zod).toBeUndefined()
    for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {}) as Array<[string, string]>) {
      if (!name.startsWith('@deepseek-ai/dsh-')) continue
      expect(spec, name).toBe('^0.0.1-rc.2')
    }
  })

  it('pins the candidates to the official input dock rather than the footer dock', () => {
    const client = readFileSync(resolve(root, 'src/client/index.ts'), 'utf8')
    expect(client).toContain("ctx.slots.inject('conversation.input.dock'")
    expect(client).not.toContain("ctx.slots.inject('conversation.composer.dock'")
    expect(client).toContain('order: 15')
  })
})
