/**
 * Browser-trust fence for the mygo panel routes.
 *
 * Behaviorally ported from `@omdsh-plugins/omdsh-plughub`'s
 * `src/trust-fence.ts` (MIT), whose READ route fence matches the harness
 * `/api` gateway and whose WRITE routes are loopback-only. The panel serves
 * `/api/mygo` from the same webServer, and prefix matching means it does NOT
 * inherit the connection plugin's `/api` fence; this module closes that gap.
 *
 * Read routes (catalog, plugin list, status, SSE) are reachable from loopback
 * or from an authority this deployment was explicitly told to serve. Write
 * routes (install, update, uninstall, settings, helper commands) are
 * loopback-only, because each changes this machine or persists host state.
 * Neither fence is authentication: they are DNS-rebinding and cross-site
 * defenses answering "is this browser looking at our own page".
 * @module @r05en1cu/dsh-mygo-ext-panel/trust-fence
 */

import type { IncomingHttpHeaders } from 'node:http'

/** The request facts the fence reads. */
export interface TrustRequest {
  readonly headers: IncomingHttpHeaders
}

/** One header value, when it was sent exactly once. */
function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * Whether a normalized hostname names the local loopback authority.
 * Accepts localhost, IPv6 loopback, and every 127.0.0.0/8 literal.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** Whether the request authority matches a trustedHosts entry (exact, or port-less). */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** Whether the browser markers say this request came from our own origin. */
function isSameOrigin(request: TrustRequest, hostUrl: URL): boolean {
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * Decide whether one request may READ the panel routes.
 * @param request - node HTTP request facts.
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours and the browser markers are same-origin.
 */
export function isTrustedRequest(request: TrustRequest, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  return isSameOrigin(request, hostUrl)
}

/**
 * Decide whether one request may WRITE panel state. Same-origin plus loopback,
 * with no trustedHosts escape: an install executes build scripts, and a
 * settings write persists host state.
 * @param request - node HTTP request facts.
 * @returns true when the Host is loopback and the browser markers are same-origin.
 */
export function isLoopbackRequest(request: TrustRequest): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  return isSameOrigin(request, hostUrl)
}
