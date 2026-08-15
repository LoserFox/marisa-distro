import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const oxlintCli = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url))

/** Complete Oxlint child-process arguments and environment. */
export interface OxlintInvocation {
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

/**
 * Apply the repository worker bound to both Oxlint backends.
 * @param args - Oxlint CLI arguments requested by the caller.
 * @param env - Environment inherited by the Oxlint process.
 * @returns the complete CLI arguments and child environment.
 */
export function resolveOxlintInvocation(args: readonly string[], env: NodeJS.ProcessEnv): OxlintInvocation {
  const raw = env.DSH_OXLINT_THREADS
  if (raw === undefined || raw === '') return { args: [...args], env: { ...env } }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== raw) {
    throw new Error(`run-oxlint: DSH_OXLINT_THREADS must be a positive integer, got ${JSON.stringify(raw)}.`)
  }
  if (args.some(arg => arg === '--threads' || arg.startsWith('--threads='))) {
    throw new Error('run-oxlint: use DSH_OXLINT_THREADS instead of passing --threads directly.')
  }
  return {
    args: [...args, `--threads=${raw}`],
    env: { ...env, GOMAXPROCS: raw },
  }
}

function main(): void {
  const invocation = resolveOxlintInvocation(process.argv.slice(2), process.env)
  const result = spawnSync(process.execPath, [oxlintCli, ...invocation.args], {
    env: invocation.env,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  process.exitCode = result.status ?? 1
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)) main()
