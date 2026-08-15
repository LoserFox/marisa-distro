/**
 * @deepseek-ai/dsh-headless — the one-shot headless bundle: the bundle patch
 * (`cordis.patch.yml`) rides over dsh-base + dsh-web-app (the headless
 * session is web-observable while it runs — same composition), and this
 * runner plugin drives one task through the in-process API carrier
 * (InProcessApiClient over toFetchHandler(ctx.apiProxy), so the full wire
 * chain — serialization, zod, SSE framing — really runs), prints the final
 * assistant text at agent quiescence, and exits (completed → 0, else 1). The
 * task text arrives as launcher-patched config (`dsh run "task"`).
 * @module @deepseek-ai/dsh-headless
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import { InProcessApiClient, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
// Empty type imports carry the httpServer and agent/status Context merges used below.
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent'
// Empty type import carries the loader Context merge for the settlement await.
import type {} from '@cordisjs/plugin-loader'
import type { MuxFrame } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Stable Cordis plugin name. */
export const name = 'headless-runner'

/** Services required before the one-shot turn can start. */
export const inject = ['apiProxy', 'httpServer']

/** Plugin config: the task, patched in by the launcher. */
export interface Config {
  /** The prompt text for the single turn. */
  task: string
}

export const Config: z<Config> = z.object({
  task: z.string().required(),
})

/** Outcome of one headless run: aggregated final text plus the last turn-end reason kind. */
interface TurnOutcome {
  text: string
  reason: string
}

/**
 * The process-facing effects of one run, injectable for tests: output
 * streams and the exit request (the launcher wires it to its bounded
 * shutdown controller).
 */
export interface HeadlessIo {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  /** Request process exit with `code` after the tree disposes. */
  exit(code: number): void
}

/** Host seam: the launcher provides the exit wiring before the tree mounts. */
declare module 'cordis' {
  interface Context {
    /** Process-facing effects for the one-shot headless runner. */
    headlessIo?: HeadlessIo
  }
}

/** Unwrap an RpcResponse or fail loud: business errors print and exit 1. */
async function unwrap<T>(response: RpcResponse<T>, io: HeadlessIo): Promise<T> {
  if (response.result.ok) return response.result.value
  const { code, message } = response.result.error
  io.stderr.write(`dsh: ${code}: ${message}\n`)
  io.exit(1)
  // Exit is asynchronous (bounded tree disposal); park this turn forever so
  // no further request rides a session that is already being torn down.
  return new Promise<never>(() => {})
}

/**
 * Consume mux frames until the agent reaches idle, per the one-shot CLI
 * idle-to-idle contract: the stream opens immediately before the prompt, and
 * its first observed turn/start begins the task. Text is the last committed
 * assistant message of the whole interval (steering or injected work may run
 * further turns before quiescence), and the outcome reason is the final
 * turn/end's kind. Idleness is signalled out of band by the caller's
 * `agent/status` subscription; the stream itself carries no status frame.
 * @param frames - the mux stream opened before the prompt.
 * @param sessionId - the headless session.
 * @param idle - resolves to the final session-event sequence when the agent reaches quiescence.
 * @param io - process-facing effects for stream diagnostics.
 * @returns the aggregated outcome.
 */
async function consumeUntilIdle(
  frames: AsyncIterable<RpcRequest<MuxFrame>>,
  sessionId: SessionId,
  idle: Promise<number>,
  io: HeadlessIo,
): Promise<TurnOutcome> {
  let started = false
  let text = ''
  let reason: string = 'error'
  let observedSeq = -1
  let resolveProgress: (() => void) | undefined
  const streamDone = (async () => {
    try {
      for await (const frame of frames) {
        const payload = frame.payload
        if (payload.type === 'stream/error') return
        if (payload.type !== 'session/event' || payload.sessionId !== sessionId) continue
        const event = payload.event
        observedSeq = event.seq
        resolveProgress?.()
        resolveProgress = undefined
        if (event.type === 'turn/start') {
          started = true
          continue
        }
        if (!started) continue
        if (event.type === 'assistant/message') {
          const joined = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
          if (joined !== '') text = joined
        }
        if (event.type === 'turn/end') reason = event.data.reason.kind
      }
    } catch (error: unknown) {
      io.stderr.write(`dsh: event stream failed: ${String(error)}\n`)
    }
  })()
  const streamEnded = streamDone.then(() => 'ended' as const)
  const idleSeq = await idle
  while (observedSeq < idleSeq) {
    const progress = new Promise<'progress'>((resolve) => { resolveProgress = () => { resolve('progress') } })
    if (await Promise.race([progress, streamEnded]) === 'ended') break
  }
  return { text, reason }
}

/**
 * Run one headless task to quiescence and request exit (completed → 0, else 1).
 * @param ctx - plugin context carrying apiProxy, httpServer, and the launcher's headlessIo.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const io = ctx.headlessIo
  if (io === undefined) {
    throw new Error('headless-runner: the launcher must provide ctx.headlessIo before the tree mounts')
  }
  // Fire-and-forget by design: the run outlives plugin activation, and every
  // failure path inside ends in io.exit, not a rejection.
  void (async () => {
    // The Loader mounts sibling rows concurrently and this plugin's inject
    // gate covers only apiProxy/httpServer; prompting before the agent loop,
    // adapters, and tools settle would fail the turn on a half-mounted tree.
    // The old launcher ran strictly after settled boot — preserve that.
    // A tree disposed mid-settlement (early SIGTERM) has nothing to run.
    await ctx.get('loader')?.await()
    if (ctx.get('httpServer') === undefined) return
    // The headless session is web-observable while it runs (same composition).
    io.stderr.write(`dsh: observing at http://127.0.0.1:${String(ctx.httpServer.port)}\n`)
    const api = new InProcessApiClient(toFetchHandler(ctx.apiProxy))
    const created = await unwrap(await api.sessions.create({}), io)
    // Open the stream before prompting so no frame is lost. The quiescence
    // anchor below is an in-process ctx subscription, so a remote-carrier
    // port of this runner must replace it with a wire-visible idle signal.
    const abort = new AbortController()
    const frames = api.events.mux({}, abort.signal)
    const idle = new Promise<number>((resolve) => {
      ctx.on('agent/status', ({ agent, status }) => {
        if (agent.id === created.sessionId && status === 'idle') resolve(agent.session.seq - 1)
      })
    })
    const done = consumeUntilIdle(frames, created.sessionId, idle, io)
    await unwrap(await api.sessions.prompt({
      sessionId: created.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: config.task }],
    }), io)
    const outcome = await done
    io.stdout.write(outcome.text + '\n')
    abort.abort()
    io.exit(outcome.reason === 'completed' ? 0 : 1)
  })()
}
