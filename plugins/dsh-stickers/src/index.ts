import { createReadStream } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { PUBLIC_STICKERS, STICKERS, STICKER_VARIANTS, isStickerVariant, publicStickerById, stickerById, stickerVariantFile, type StickerVariant } from './shared/catalog.ts'

export const name = '@dsh-external/dsh-stickers'
export const inject = ['tools', 'systemPrompt', 'commands']
const API_ROOT = '/api/dsh-stickers'
const stickerRoot = fileURLToPath(new URL('../assets/stickers/', import.meta.url))

async function send(id: string, agent: Agent | undefined, allowHidden: boolean, variant: StickerVariant = 'blue') {
  const sticker = allowHidden ? stickerById(id) : publicStickerById(id)
  if (sticker === undefined) {
    throw new Error(`表情不存在或不可由用户发送：${id}`)
  }
  return { ok: true, id: sticker.id, text: sticker.text, variant, image: `${API_ROOT}/${stickerVariantFile(sticker.file, variant)}`, sender: agent === undefined ? 'user' : 'agent' }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'send_sticker',
    description: 'Send one reaction sticker when it naturally adds tone. Some hidden stickers are agent-only easter eggs.',
    parameters: {
      id: { type: 'string', required: true, enum: STICKERS.map(sticker => sticker.id), description: 'Sticker id.' },
      variant: { type: 'string', enum: [...STICKER_VARIANTS], description: 'Character variant: blue (default) or black whale girl.' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
          text: { type: 'string', required: true },
          variant: { type: 'string', required: true },
          image: { type: 'string', required: true },
          sender: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `🐋 ${String((value as { text?: unknown }).text ?? '')}` }],
    },
    presentCall: (args) => ({ card: 'generic', title: `发送表情 · ${stickerById(String((args as { id?: unknown }).id))?.text ?? 'DSH 表情'}` }),
    presentResult: (_args, result) => ({ card: 'generic', content: result.content }),
    execute: async ({ id, variant }, exec) => {
      const requested = variant === undefined ? 'blue' : String(variant)
      if (!isStickerVariant(requested)) throw new Error(`未知的表情角色：${requested}`)
      return send(String(id), exec.agent, true, requested)
    },
  })), 'dsh-stickers: agent tool')

  ctx.effect(() => ctx.commands.register({
    name: 'sticker',
    description: '发送一个 DSH 表情（/sticker <id> [black]）',
    input: { hint: `<${PUBLIC_STICKERS.map(sticker => sticker.id).join('|')}> [black]` },
    handler: async ({ rawInput }) => {
      const [id = '', requested = 'blue'] = rawInput.trim().split(/\s+/u)
      if (!isStickerVariant(requested)) {
        return { kind: 'error' as const, text: `未知的表情角色：${requested}` }
      }
      try {
        const result = await send(id, undefined, false, requested)
        return { kind: 'success' as const, text: `🐋 ${result.text}` }
      } catch (error) {
        return { kind: 'error' as const, text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'dsh-stickers: slash command')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-stickers:guidance',
    order: 175,
    text: `You can send reaction stickers with send_sticker. Use at most one per turn, only when it naturally adds tone, and never instead of a substantive answer. Every sticker has two character variants: blue (default) and black; pass variant: 'black' to match the user's current choice if they switched. Available stickers:\n${STICKERS.map(sticker => `- ${sticker.id}: ${sticker.text}`).join('\n')}`,
  }), 'dsh-stickers: guidance')

  ctx.inject(['webServer'], (scope: Context) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: API_ROOT,
      handler: (request, response) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const relative = decodeURIComponent(pathname.slice(API_ROOT.length + 1))
        const variantDirectory = relative.startsWith('black/') ? 'black' : undefined
        const file = basename(variantDirectory === undefined ? relative : relative.slice('black/'.length))
        const path = variantDirectory === undefined ? join(stickerRoot, file) : join(stickerRoot, variantDirectory, file)
        if (extname(file) !== '.png' || stickerById(file.replace(/^\d+-|\.png$/gu, '')) === undefined) {
          response.writeHead(404); response.end('not found'); return
        }
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
        createReadStream(path).pipe(response)
      },
    }), 'dsh-stickers: image route')
  })
}
