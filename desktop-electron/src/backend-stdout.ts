/**
 * Backend stdout scanning — port of desktop/logging.go scanBackendStdout +
 * the exit classification of rescue_health.go.
 *
 * The scanner consumes the backend stdout until the process exits, tees every
 * line into the desktop log, and publishes the FIRST `dsh web: ` URL. The
 * consumption loop never breaks early: destroying the pipe after readiness
 * would kill the live server with EPIPE.
 */

/** The stdout prefix `dsh web` prints once the server listens. */
export const READY_LINE_PREFIX = 'dsh web: '

/**
 * Extract the URL from one readiness line (`dsh web: http://127.0.0.1:PORT`,
 * optional trailing LAN note), or undefined for any other line.
 */
export function parseReadyLine(line: string): URL | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith(READY_LINE_PREFIX)) return undefined
  const candidate = trimmed.slice(READY_LINE_PREFIX.length).split(' ')[0] ?? ''
  try {
    const url = new URL(candidate)
    // The readiness line always carries an explicit port; a port-less
    // fragment is a line split mid-way across stdout chunks.
    return url.port === '' ? undefined : url
  } catch {
    return undefined
  }
}

export interface StdoutScan {
  /** Resolves with the first advertised URL; rejects if the stream ends without one. */
  ready: Promise<URL>
  /** Resolves when the stream ends (backend exit). */
  closed: Promise<void>
}

/**
 * Scan an async-iterable stdout (a Node Readable in text mode). `tee` receives
 * every line (desktop log); readiness resolution follows scanBackendStdout.
 */
export function scanBackendStdout(
  stdout: AsyncIterable<string>,
  tee: (line: string) => void,
  log: (message: string) => void,
): StdoutScan {
  let resolveReady: (url: URL) => void = () => {}
  let rejectReady: (err: Error) => void = () => {}
  const ready = new Promise<URL>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  let resolveClosed: () => void = () => {}
  const closed = new Promise<void>(resolve => { resolveClosed = resolve })

  void (async () => {
    let buffer = ''
    let published = false
    try {
      for await (const chunk of stdout) {
        buffer += chunk
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          tee(line)
          if (!published) {
            const url = parseReadyLine(line)
            if (url !== undefined) {
              published = true
              resolveReady(url)
            }
          }
        }
      }
      // Stream ended: a final line without a trailing newline still counts.
      if (buffer !== '') tee(buffer)
      if (!published) {
        const url = buffer === '' ? undefined : parseReadyLine(buffer)
        if (url !== undefined) {
          published = true
          resolveReady(url)
        }
      }
      if (!published) rejectReady(new Error('backend exited without publishing a URL'))
    } catch (error) {
      log(`backend stdout read failed: ${String(error)}`)
      if (!published) rejectReady(error instanceof Error ? error : new Error(String(error)))
    } finally {
      resolveClosed()
    }
  })()

  return { ready, closed }
}

/**
 * Exit classification (rescue_health.go exitFailureClass): at most one of
 * (count, reset) is true.
 *  - clean exit or user-initiated restart → reset the failure streak
 *  - abnormal exit within STABLE_RUN_MS of the URL → count (crash loops must
 *    escalate instead of retrying forever)
 *  - abnormal exit after a long run → reset (transient)
 */
export function exitFailureClass(
  exitErr: boolean,
  userRestart: boolean,
  ranForMs: number,
  stableRunMs = 120_000,
): { count: boolean; reset: boolean } {
  if (!exitErr || userRestart) return { count: false, reset: true }
  if (ranForMs < stableRunMs) return { count: true, reset: false }
  return { count: false, reset: true }
}
