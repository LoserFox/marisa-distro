import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Context } from 'cordis'
import LocalSubprocessService from '@deepseek-ai/dsh-subprocess-local'
import Lsp, { type LspQueryRequest } from '@deepseek-ai/dsh-lsp'
import * as LspLocal from '@deepseek-ai/dsh-lsp-local'
import type { Config, LspLocalServerConfig } from '@deepseek-ai/dsh-lsp-local'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

let root: string
let ws: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lsp-prov-')))
  ws = join(root, 'ws')
  await mkdir(ws)
  await writeFile(join(ws, 'a.ts'), 'const x = 1\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function query(): LspQueryRequest {
  return { operation: 'goToDefinition', filePath: 'a.ts', position: { line: 0, character: 0 }, workspaceRoot: ws }
}

/** Wrap one server entry in the plugin's named server table. */
function config(providerId: string, server: LspLocalServerConfig): Config {
  return { servers: { [providerId]: server } }
}

describe('lsp-local provider resolution', () => {
  it('resolves a bare command on the child PATH and registers the provider', async () => {
    // A tiny executable script placed on a custom PATH dir: the load-time resolver must find it.
    const bin = join(root, 'bin')
    await mkdir(bin)
    const exe = join(bin, 'fake-lsp')
    await writeFile(exe, '#!/bin/sh\nexit 0\n')
    await chmod(exe, 0o755)

    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('onpath', {
      command: 'fake-lsp',
      args: [],
      env: { PATH: bin },
      extensionToLanguage: { '.ts': 'typescript' },
    }))).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })

  it('skips empty PATH segments and fails when the command is absent', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('nope', {
      command: 'fake-lsp',
      args: [],
      env: { PATH: `${delimiter}${delimiter}${join(root, 'empty')}` },
      extensionToLanguage: { '.ts': 'typescript' },
    }))).rejects.toThrow(/was not found on PATH/)
    await ctx.fiber.dispose()
  })

  it('rejects a query after the provider is disposed', async () => {
    // Use a server that never emits results and dispose the plugin, then confirm queries are refused.
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    // Grab the provider instance by registering, then dispose the whole plugin fiber.
    const lsp = ctx.lsp
    const fiber = await ctx.plugin(LspLocal, config('disp', {
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
      extensionToLanguage: { '.ts': 'typescript' },
    }))
    await fiber.dispose()
    // After disposal the provider unregistered from the seam, so selection fails as unavailable.
    await expect(lsp.query(query())).rejects.toThrow(expect.objectContaining({ code: 'LSP_UNAVAILABLE' }))
    await ctx.fiber.dispose()
  })

  it('rejects a nonpositive teardown budget at load', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('bad-budget', {
      command: process.execPath,
      args: ['-e', ''],
      extensionToLanguage: { '.ts': 'typescript' },
      killGraceMs: 0,
    }))).rejects.toThrow(/servers\.bad-budget\.killGraceMs must be a positive integer/)
    await ctx.fiber.dispose()
  })

  it('rejects a nonpositive byte cap at load', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('bad-cap', {
      command: process.execPath,
      args: ['-e', ''],
      extensionToLanguage: { '.ts': 'typescript' },
      maxDocumentBytes: 0,
    }))).rejects.toThrow(/servers\.bad-cap\.maxDocumentBytes must be a positive integer/)
    await ctx.fiber.dispose()
  })

  it.each(['shutdownTimeoutMs', 'killGraceMs'] as const)('rejects %s above Node timer range at load', async (name) => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('bad-timer', {
      command: process.execPath,
      args: ['-e', ''],
      extensionToLanguage: { '.ts': 'typescript' },
      [name]: MAX_TIMER_DELAY_MS + 1,
    }))).rejects.toThrow(new RegExp(`servers\\.bad-timer\\.${name}`))
    await ctx.fiber.dispose()
  })

  // Node's X_OK probe is an existence check on Windows, which has no executable mode bit.
  it.skipIf(process.platform === 'win32')('rejects an absolute command that is not executable at load', async () => {
    const notExe = join(root, 'not-exe.txt')
    await writeFile(notExe, 'plain text, not executable')
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('abs-bad', {
      command: notExe,
      args: [],
      extensionToLanguage: { '.ts': 'typescript' },
    }))).rejects.toThrow(/is not an executable file/)
    await ctx.fiber.dispose()
  })

  it('rejects an executable directory as a command at load', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('abs-directory', {
      command: ws,
      args: [],
      extensionToLanguage: { '.ts': 'typescript' },
    }))).rejects.toThrow(/is not an executable file/)
    await ctx.fiber.dispose()
  })

  it('rejects an empty server table at load', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, { servers: {} })).rejects.toThrow(/servers must contain at least one server/)
    await ctx.fiber.dispose()
  })

  it('rejects an empty server id at load', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, config('', {
      command: process.execPath,
      extensionToLanguage: { '.ts': 'typescript' },
    }))).rejects.toThrow(/server ids must be non-empty strings/)
    await ctx.fiber.dispose()
  })

  it('resolves every executable before publishing any provider', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, {
      servers: {
        valid: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
        missing: { command: 'definitely-not-a-real-lsp-binary-xyz', extensionToLanguage: { '.py': 'python' } },
      },
    })).rejects.toThrow(/was not found on PATH/)
    await expect(ctx.lsp.query(query())).rejects.toThrow(expect.objectContaining({ code: 'LSP_UNAVAILABLE' }))
    await ctx.fiber.dispose()
  })

  it('rolls back earlier registrations when a later server conflicts', async () => {
    const ctx = new Context()
    await ctx.plugin(Lsp)
    await ctx.plugin(LocalSubprocessService)
    await expect(ctx.plugin(LspLocal, {
      servers: {
        first: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
        second: { command: process.execPath, extensionToLanguage: { '.ts': 'typescript' } },
      },
    })).rejects.toThrow(expect.objectContaining({ code: 'LSP_CONFLICT' }))
    await expect(ctx.lsp.query(query())).rejects.toThrow(expect.objectContaining({ code: 'LSP_UNAVAILABLE' }))
    await ctx.fiber.dispose()
  })
})
