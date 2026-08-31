/**
 * Backend command-line parsing — 1:1 port of desktop/command.go.
 *
 * The shell starts the user environment's dsh (`dsh web --no-open --port 0`
 * by default; `DSH_WEB_CMD` overrides the whole line, `MARISA_WEB_CMD` is an
 * alias). `{port}` in the override is substituted with the actual port.
 */

/** Env var that overrides the backend command line (`{port}` placeholder is substituted). */
export const WEB_CMD_ENV = 'DSH_WEB_CMD'

/** Alias kept for shell-side symmetry with the other MARISA_* env injections. */
export const WEB_CMD_ENV_MARISA = 'MARISA_WEB_CMD'

/**
 * The full backend command line. `{port}` is replaced with the actual port
 * (default "0" — OS-assigned). Unset env falls back to PATH's `dsh`. rc8
 * (#2410) makes `dsh web` open a browser by default; the desktop shell owns
 * the window, so `--no-open` must be explicit.
 */
export function webCommandLine(port: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env[WEB_CMD_ENV] ?? env[WEB_CMD_ENV_MARISA] ?? ''
  if (override !== '') return override.replaceAll('{port}', port)
  return 'dsh web --no-open --port ' + port
}

/**
 * Split one command line into argv: whitespace-separated, spaces inside
 * double quotes preserved, the quotes themselves stripped. Minimal rule
 * matching command.go — covers `dsh web --port 0` and quoted executable
 * paths; more complex quoting should go through a shell wrapper.
 */
export function parseCommandLine(line: string): string[] {
  const argv: string[] = []
  let cur = ''
  let inQuote = false
  const flush = () => {
    if (cur.length > 0) {
      argv.push(cur)
      cur = ''
    }
  }
  for (const r of line) {
    if (r === '"') {
      inQuote = !inQuote
    } else if ((r === ' ' || r === '\t') && !inQuote) {
      flush()
    } else {
      cur += r
    }
  }
  flush()
  return argv
}
