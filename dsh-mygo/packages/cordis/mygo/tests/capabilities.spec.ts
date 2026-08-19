/**
 * PluginEnv capability surfaces after the permission-gate removal: every
 * surface is a host passthrough, registration quotas and the rate-limited
 * logger keep their §18/SEC:71 behavior, and missing host seams fail loudly.
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginError } from '@r05en1cu/dsh-mygo-api'
import {
  claimEffect,
  createExecBoundary,
  createModelCall,
  createNetworkFetch,
  createPluginFs,
  createPluginVars,
  createRateLimitedLogger,
  nodePluginIo,
  type PluginEffectQuota,
  type PluginIo,
} from '@r05en1cu/dsh-mygo'

describe('createPluginFs passthrough', () => {
  it('forwards read/write/append/readdir/stat to the host io seam', async () => {
    const io = {
      read: vi.fn(async () => new Uint8Array([1, 2])),
      write: vi.fn(async () => {}),
      append: vi.fn(async () => {}),
      readdir: vi.fn(async () => [{ name: 'a', kind: 'file' as const }]),
      stat: vi.fn(async () => ({ kind: 'file' as const, size: 2, mtimeMs: 0 })),
      realpath: vi.fn(async (path: string) => path),
    } satisfies PluginIo
    const fs = createPluginFs('p', io)
    await expect(fs.read('/any')).resolves.toEqual(new Uint8Array([1, 2]))
    await fs.write('/any', 'text')
    await fs.append('/any', new Uint8Array([3]))
    await expect(fs.readdir('/any')).resolves.toEqual([{ name: 'a', kind: 'file' }])
    await expect(fs.stat('/any')).resolves.toEqual({ kind: 'file', size: 2, mtimeMs: 0 })
    expect(io.read).toHaveBeenCalledWith('/any')
    expect(io.write).toHaveBeenCalledWith('/any', new TextEncoder().encode('text'))
    expect(io.append).toHaveBeenCalledWith('/any', new Uint8Array([3]))
    expect(io.readdir).toHaveBeenCalledWith('/any')
    expect(io.stat).toHaveBeenCalledWith('/any')
  })
})

describe('createNetworkFetch passthrough', () => {
  it('forwards every request to the host fetch without an allowlist', async () => {
    const response = new Response('ok')
    const fetchImpl = vi.fn(async () => response)
    const fetch = createNetworkFetch(fetchImpl)
    await expect(fetch('https://example.dev/any', { method: 'GET' })).resolves.toBe(response)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.dev/any', { method: 'GET' })
  })
})

describe('createPluginVars passthrough', () => {
  it('reads and writes the host process environment', () => {
    const name = `DSH_TEST_VAR_${Date.now()}`
    const vars = createPluginVars()
    expect(vars.get(name)).toBeUndefined()
    vars.set(name, 'value')
    expect(vars.get(name)).toBe('value')
    expect(process.env[name]).toBe('value')
    delete process.env[name]
  })
})

describe('createModelCall passthrough', () => {
  it('forwards every model request to the host seam', async () => {
    const host = vi.fn(async (request: { model: string }) => ({ content: `echo:${request.model}`, model: request.model }))
    const llm = createModelCall('p', host)
    await expect(llm.complete({ model: 'any-model', messages: [] }))
      .resolves.toEqual({ content: 'echo:any-model', model: 'any-model' })
    expect(host).toHaveBeenCalledWith({ model: 'any-model', messages: [] })
  })

  it('fails loudly when no host LLM seam is wired', () => {
    const llm = createModelCall('p', undefined)
    expect(() => llm.complete({ model: 'm', messages: [] })).toThrow(PluginError)
    try {
      llm.complete({ model: 'm', messages: [] })
    } catch (error) {
      expect((error as PluginError).code).toBe('llm-denied')
    }
  })
})

describe('createExecBoundary passthrough', () => {
  it('forwards every subprocess request to the host seam', async () => {
    const host = vi.fn(async (request: { command: string }) => ({ stdout: `out:${request.command}`, stderr: '', code: 0 }))
    const exec = createExecBoundary('p', host)
    await expect(exec.run({ command: 'any-cli', args: ['a'] }))
      .resolves.toEqual({ stdout: 'out:any-cli', stderr: '', code: 0 })
    expect(host).toHaveBeenCalledWith({ command: 'any-cli', args: ['a'] })
  })

  it('fails loudly when no host subprocess seam is wired', () => {
    const exec = createExecBoundary('p', undefined)
    expect(() => exec.run({ command: 'x' })).toThrow(PluginError)
    try {
      exec.run({ command: 'x' })
    } catch (error) {
      expect((error as PluginError).code).toBe('exec-denied')
    }
  })
})

describe('registration quotas (§18)', () => {
  it('claims listener/tool/service buckets up to their limits', () => {
    const quota: PluginEffectQuota = { listeners: 0, tools: 0, services: 0 }
    for (let index = 0; index < 100; index += 1) claimEffect(quota, 'listener', 'p')
    expect(() => claimEffect(quota, 'listener', 'p')).toThrow(/registration quota exceeded/)
    for (let index = 0; index < 50; index += 1) claimEffect(quota, 'tool', 'p')
    expect(() => claimEffect(quota, 'tool', 'p')).toThrow(/registration quota exceeded/)
    for (let index = 0; index < 20; index += 1) claimEffect(quota, 'service', 'p')
    expect(() => claimEffect(quota, 'service', 'p')).toThrow(/registration quota exceeded/)
  })
})

describe('rate-limited logger (SEC:71)', () => {
  it('drops lines beyond 1000 per minute and warns once', () => {
    const raw = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    let now = 0
    const logger = createRateLimitedLogger(raw, () => now)
    for (let index = 0; index < 1005; index += 1) logger.info('line %d', index)
    expect(raw.info).toHaveBeenCalledTimes(1000)
    expect(raw.warn).toHaveBeenCalledTimes(1)
    now += 60_001
    logger.info('fresh')
    expect(raw.info).toHaveBeenCalledTimes(1001)
  })
})

describe('nodePluginIo', () => {
  it('reads and writes real files and reports directory entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cap-'))
    try {
      const file = join(root, 'a.txt')
      await writeFile(file, 'hello')
      await expect(new TextDecoder().decode(await nodePluginIo.read(file))).toBe('hello')
      await expect(nodePluginIo.stat(file)).resolves.toMatchObject({ kind: 'file', size: 5 })
      const entries = await nodePluginIo.readdir(root)
      expect(entries.some(entry => entry.name === 'a.txt' && entry.kind === 'file')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
