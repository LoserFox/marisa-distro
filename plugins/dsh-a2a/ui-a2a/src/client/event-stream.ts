/**
 * Browser subscription to the plugin-owned downlink WebSocket: connects to
 * the same-origin events endpoint, reconnects with bounded backoff, and
 * fans one `changed` frame out to every subscriber. One stream per service
 * instance — all session directories share it, so N sessions cost one
 * connection instead of N long-polls.
 *
 * @module @dpskh/ui-a2a/client/event-stream
 */

import type { A2aChangeFrame } from '../api.ts'

/** Backoff for the reconnect loop, in milliseconds. */
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/** One subscribable change stream; the owner closes it on teardown. */
export interface PluginEventStream {
  /**
   * Subscribe to change frames.
   * @param listener - invoked for every `changed` frame after the socket is open.
   * @returns the disposer removing this subscription.
   */
  subscribe(listener: (frame: A2aChangeFrame) => void): () => void
  /** Close the socket, cancel reconnects, and drop every subscription. */
  close(): void
}

/**
 * Build the same-origin WebSocket URL for one absolute path.
 * @param path - absolute pathname, e.g. `/dpskh-a2a/events`.
 * @returns the ws/wss URL on the current page origin.
 */
export function eventStreamUrl(path: string): string {
  const url = new URL(path, globalThis.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/** Open one WebSocket change stream with reconnect and teardown. */
export function createPluginEventStream(path: string): PluginEventStream {
  const listeners = new Set<(frame: A2aChangeFrame) => void>()
  let socket: WebSocket | undefined
  let reconnectDelay = RECONNECT_BASE_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const notify = (frame: A2aChangeFrame): void => {
    for (const listener of listeners) listener(frame)
  }

  const connect = (): void => {
    if (closed) return
    socket = new WebSocket(eventStreamUrl(path))
    socket.onopen = (): void => {
      reconnectDelay = RECONNECT_BASE_MS
    }
    socket.onmessage = (event: MessageEvent<string>): void => {
      if (typeof event.data !== 'string') return
      let frame: unknown
      try {
        frame = JSON.parse(event.data) as unknown
      } catch {
        return
      }
      if (frame !== null && typeof frame === 'object'
        && (frame as { type?: unknown }).type === 'changed') {
        notify(frame as A2aChangeFrame)
      }
    }
    socket.onclose = (): void => {
      socket = undefined
      if (closed) return
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
        connect()
      }, reconnectDelay)
    }
    socket.onerror = (): void => {
      // onclose follows and schedules the reconnect.
      socket?.close()
    }
  }

  // Non-browser or WebSocket-less environments (jsdom tests, worker shells)
  // get an inert stream: subscriptions are accepted, nothing connects.
  if (typeof globalThis.WebSocket === 'undefined') {
    return {
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      close() {
        closed = true
        listeners.clear()
      },
    }
  }

  connect()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    close() {
      closed = true
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      socket?.close()
      socket = undefined
      listeners.clear()
    },
  }
}
