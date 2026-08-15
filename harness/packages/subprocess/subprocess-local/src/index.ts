/**
 * Local implementation of the subprocess seam. Each spawn is a detached
 * process tree with the spec's per-stream stdio dispositions; disposal
 * terminates and joins live trees. It has no config: every disposition and
 * limit arrives on the spec, so the deployment-varying choices stay with the
 * calling seam's config (the bash executor's, the LSP host's, …).
 * @module @deepseek-ai/dsh-subprocess-local
 */

import { Context } from 'cordis'
import { SubprocessService } from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { spawnSubprocess } from './spawn.ts'
import type { SpawnInternals } from './spawn.ts'

/**
 * Local subprocess service: detached process trees, Node-shaped stdio
 * dispositions (raw pipes, inherit, bounded tail-keep collection with spill
 * files), credential-scrubbed environment, and tree-scoped signalling with
 * SIGTERM→grace→SIGKILL escalation.
 */
export class LocalSubprocessService extends SubprocessService {
  /** Live handles retained only so disposal can terminate and join them. */
  private live = new Set<SubprocessHandle>()
  /** Test seam: spill and platform knobs forwarded to spawnSubprocess. */
  internals: SpawnInternals = {}

  constructor(ctx: Context) {
    super(ctx)
    ctx.effect(() => async () => {
      // Terminate (escalating), then await WHOLE-TREE exit — not just the
      // direct child's settlement — so even a TERM-trapping descendant cannot
      // outlive the fiber.
      const pending: Promise<unknown>[] = []
      for (const handle of this.live) {
        handle.terminate()
        // Spawn-failure rejections already settled and left the live set.
        pending.push(handle.done.catch(() => {}).then(() => { return handle.waitForExit() }))
      }
      this.live.clear()
      await Promise.all(pending)
    }, 'local subprocess teardown')
  }

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const handle = spawnSubprocess(spec, this.internals)
    this.live.add(handle)
    // Release ownership only once the whole TREE is gone, not at direct-child
    // settlement — a TERM-trapping helper that outlives the leader must stay
    // owned so teardown can still escalate it. For the common no-survivor
    // case waitForExit resolves immediately after settlement.
    const release = (): Promise<void> =>
      handle.waitForExit().then(() => { this.live.delete(handle) })
    handle.done.then(release, release)
    return handle
  }
}

export default LocalSubprocessService
