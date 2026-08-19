// @vitest-environment jsdom
/** A2A browser directory, overview, projects, badge, and panel behavior. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import {
  A2A_RPC_ENDPOINTS,
  a2aRequestSchemas,
  type A2aApiClient,
  type A2aApiResult,
  type A2aProjectView,
  type A2aRpcTransport,
  type A2aSnapshot,
} from '../src/api.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { A2aDirectory } from '../src/client/directory.ts'
import { A2aView } from '../src/client/A2aView.tsx'
import { A2aBadge } from '../src/client/A2aBadge.tsx'
import { A2aPanel } from '../src/client/A2aPanel.tsx'
import { createA2aComposerStore } from '../src/client/stores.ts'
import { apply, inject } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

const SID = 'session-a2a-test' as SessionId
function makeTranslate(...dicts: Array<Record<string, string>>) {
  return (key: string, params?: Record<string, unknown>): string => {
    const template = dicts.find(dict => dict[key] !== undefined)?.[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match)
  }
}
const t = makeTranslate(zh)
afterEach(cleanup)

function ok<T>(value: T): A2aApiResult<T> {
  return { ok: true, value }
}
type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> : never

function apiClient(initial: A2aSnapshot = {
  revision: 0,
  connected: true,
  project: 'demo',
  self: { id: 'self-presence', name: 'self-main', transport: 'hub', target: 'demo', status: 'online', activity: 'idle' },
  peers: [
    { id: 'p-1', name: 'reviewer', transport: 'hub', target: 'demo', status: 'online', activity: 'conversing' },
    { id: 'p-2', name: 'coder', transport: 'hub', target: 'demo', status: 'online', activity: 'idle' },
  ],
  projects: [{ name: 'demo', displayName: 'Demo', createdAt: 1 }],
}): { api: A2aApiClient; rpc: A2aRpcTransport; snapshot: () => A2aSnapshot; calls: string[] } {
  let snapshot = initial
  let revision = initial.revision
  const calls: string[] = []
  const commit = (next: WithoutRevision<A2aSnapshot>): void => {
    revision += 1
    snapshot = { ...next, revision } as A2aSnapshot
  }
  const api: A2aApiClient = {
    snapshot: async () => { calls.push('snapshot'); return ok(snapshot) },
    connect: async ({ project, name }) => {
      calls.push(`connect:${project}/${name}`)
      commit({ connected: true, project, self: { id: 'self-presence', name, transport: 'hub', target: project, status: 'online', activity: 'idle' }, peers: [], projects: snapshot.projects })
      return ok({ connected: true, name })
    },
    disconnect: async () => {
      calls.push('disconnect')
      commit({ connected: false, peers: [], projects: snapshot.projects })
      return ok({ removed: true })
    },
    projectCreate: async ({ name, displayName }) => {
      calls.push(`create:${name}`)
      const project: A2aProjectView = { name, ...(displayName === undefined ? {} : { displayName }), createdAt: 2 }
      commit({ ...snapshot, projects: [...snapshot.projects, project] })
      return ok({ project })
    },
  }
  const rpc: A2aRpcTransport = {
    call: async (_channel, endpoint, payload, signal) => {
      const value = endpoint === A2A_RPC_ENDPOINTS.snapshot
        ? await api.snapshot(a2aRequestSchemas.snapshot.parse(payload))
        : endpoint === A2A_RPC_ENDPOINTS.connect
          ? await api.connect(a2aRequestSchemas.connect.parse(payload))
          : endpoint === A2A_RPC_ENDPOINTS.projectCreate
            ? await api.projectCreate(a2aRequestSchemas.projectCreate.parse(payload))
            : endpoint === A2A_RPC_ENDPOINTS.disconnect
              ? await api.disconnect(a2aRequestSchemas.disconnect.parse(payload))
              : (() => { throw new Error(`unknown endpoint ${endpoint}`) })()
      return { ok: true, value }
    },
  }
  return { api, rpc, snapshot: () => snapshot, calls }
}

function directory(client = apiClient()): { directory: A2aDirectory; client: ReturnType<typeof apiClient> } {
  const events: PluginEventStream = {
    subscribe: () => () => {},
    close: () => {},
  }
  return { directory: new A2aDirectory(client.api, SID, events), client }
}

function composerStore() {
  const instance = createA2aComposerStore().create()
  return { useStore: bindSnapshotSelector(instance), actions: instance.actions, instance }
}

function viewProps(directory: A2aDirectory): React.ComponentProps<typeof A2aView> {
  return { sessionId: SID, directory, t } as unknown as React.ComponentProps<typeof A2aView>
}

function badgeProps(directory: A2aDirectory, store: ReturnType<typeof composerStore>): React.ComponentProps<typeof A2aBadge> {
  return { sessionId: SID, directory, t, ...store } as unknown as React.ComponentProps<typeof A2aBadge>
}

function panelProps(directory: A2aDirectory, store: ReturnType<typeof composerStore>): React.ComponentProps<typeof A2aPanel> {
  return { sessionId: SID, directory, t, ...store } as unknown as React.ComponentProps<typeof A2aPanel>
}

describe('A2A directory and page', () => {
  it('renders one shared snapshot as summaries, roster, and topology', async () => {
    const unit = directory()
    const { container } = render(<A2aView {...viewProps(unit.directory)} /> as never)
    await screen.findAllByText('reviewer')
    expect(screen.getByText('已以 self-main 连接 demo')).toBeTruthy()
    expect(screen.getByText('3 在线')).toBeTruthy()
    expect(screen.getAllByText('你').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('svg line')).toHaveLength(3)
    expect(unit.client.calls).toEqual(['snapshot'])
  })

  it('uses a non-overlapping grid when the roster exceeds six peers', async () => {
    const peers = Array.from({ length: 7 }, (_, index) => ({
      id: `p-${index}`,
      name: `peer-${index}`,
      transport: 'hub' as const,
      target: 'demo',
      status: 'online' as const,
      activity: 'idle' as const,
    }))
    const unit = directory(apiClient({ revision: 0, connected: true, project: 'demo', self: { id: 'self-presence', name: 'self', transport: 'hub', target: 'demo', status: 'online', activity: 'idle' }, peers, projects: [] }))
    const { container } = render(<A2aView {...viewProps(unit.directory)} /> as never)
    await screen.findAllByText('peer-6')
    expect(container.querySelectorAll('svg line')).toHaveLength(0)
    expect(container.querySelectorAll('[class*="gridPeer"]')).toHaveLength(8)
  })

  it('animates conversation activity: pair edges and per-node states', async () => {
    const unit = directory(apiClient({
      revision: 0,
      connected: true,
      project: 'demo',
      self: { id: 'self-presence', name: 'self-main', transport: 'hub', target: 'demo', status: 'online', activity: 'conversing' },
      peers: [
        { id: 'p-1', name: 'reviewer', transport: 'hub', target: 'demo', status: 'online', activity: 'working' },
        { id: 'p-2', name: 'coder', transport: 'hub', target: 'demo', status: 'online', activity: 'idle' },
      ],
      projects: [{ name: 'demo', createdAt: 1 }],
    }))
    const { container } = render(<A2aView {...viewProps(unit.directory)} /> as never)
    await screen.findAllByText('reviewer')
    // Only the peer with a live conversation pairs with self: one extra
    // conversation edge beside the three star edges.
    expect(container.querySelectorAll('svg path')).toHaveLength(1)
    expect(container.querySelectorAll('svg line')).toHaveLength(3)
    // Orbit nodes carry their state; the working and conversing states
    // resolve through the roster rows as well.
    expect(container.querySelectorAll('[data-activity="working"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-activity="conversing"]')).toHaveLength(2)
  })

  it('connects from the top-aligned disconnected state with 32-character validation', async () => {
    const unit = directory(apiClient({ revision: 0, connected: false, peers: [], projects: [{ name: 'demo', createdAt: 1 }] }))
    render(<A2aView {...viewProps(unit.directory)} /> as never)
    await screen.findByText('尚未连接 A2A')
    fireEvent.change(screen.getByLabelText('项目'), { target: { value: 'demo' } })
    fireEvent.change(screen.getByLabelText('成员名'), { target: { value: 'worker' } })
    fireEvent.click(screen.getByRole('button', { name: '连接' }))
    await screen.findByText('已以 worker 连接 demo')
    expect(unit.client.calls).toEqual(['snapshot', 'connect:demo/worker', 'snapshot'])
  })

  it('provides complete tab semantics, keyboard navigation, and project creation', async () => {
    const unit = directory()
    render(<A2aView {...viewProps(unit.directory)} /> as never)
    await screen.findAllByText('reviewer')
    const overview = screen.getByRole('tab', { name: '概览' })
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    const projects = screen.getByRole('tab', { name: '项目' })
    expect(projects.getAttribute('aria-selected')).toBe('true')
    await waitFor(() => { expect(document.activeElement).toBe(projects) })
    fireEvent.change(screen.getByLabelText('项目名'), { target: { value: 'next' } })
    fireEvent.change(screen.getByLabelText('显示名'), { target: { value: 'Next' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByText('Next')).toBeTruthy()
    expect(unit.client.calls).toContain('create:next')
  })

  it('drops a stale snapshot response after a newer mutation', async () => {
    const staleGate = Promise.withResolvers<A2aApiResult<A2aSnapshot>>()
    const stale = staleGate.promise
    let first = true
    const client = apiClient({ revision: 0, connected: false, peers: [], projects: [] })
    client.api.snapshot = async () => {
      if (first) { first = false; return stale }
      return ok(client.snapshot())
    }
    const unit = directory(client)
    const loading = unit.directory.load()
    await unit.directory.connect('demo', 'worker')
    staleGate.resolve(ok({ revision: 0, connected: false, peers: [], projects: [] }))
    await loading
    expect(unit.directory.store.getSnapshot().snapshot).toMatchObject({ connected: true, project: 'demo', self: { name: 'worker' } })
  })

  it('coalesces invalidations and refreshes after a mutation settles', async () => {
    const connectGate = Promise.withResolvers<A2aApiResult<{ connected: boolean; name?: string }>>()
    const client = apiClient({ revision: 0, connected: false, peers: [], projects: [] })
    client.api.connect = async () => connectGate.promise
    const unit = directory(client)
    await unit.directory.load()
    const mutation = unit.directory.connect('demo', 'worker')
    unit.directory.invalidate()
    unit.directory.invalidate()
    connectGate.resolve(ok({ connected: true, name: 'worker' }))
    await mutation
    await waitFor(() => { expect(client.calls.filter(call => call === 'snapshot')).toHaveLength(2) })
  })
})

describe('A2A composer surfaces', () => {
  it('badge and panel consume the same directory state', async () => {
    const unit = directory()
    const store = composerStore()
    const { container } = render(
      <><A2aBadge {...badgeProps(unit.directory, store)} /><A2aPanel {...panelProps(unit.directory, store)} /></> as never,
    )
    expect(await screen.findByText('self-main')).toBeTruthy()
    // The identity dot mirrors the self activity from the snapshot.
    const badge = container.querySelector('[aria-controls="a2a-identity-panel"]')
    expect(badge?.querySelector('[data-activity="idle"]')).toBeTruthy()
    fireEvent.click(screen.getByText('self-main'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('demo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '断开连接' }))
    await screen.findAllByText('未连接')
    expect(unit.client.calls).toContain('disconnect')
  })

  it('closes on Escape and outside pointer interaction', async () => {
    const unit = directory(apiClient({ revision: 0, connected: false, peers: [], projects: [] }))
    const store = composerStore()
    store.actions.setPanelOpen(true)
    const { rerender } = render(<A2aPanel {...panelProps(unit.directory, store)} /> as never)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    rerender(<A2aPanel {...panelProps(unit.directory, store)} /> as never)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { store.actions.setPanelOpen(true) })
    rerender(<A2aPanel {...panelProps(unit.directory, store)} /> as never)
    fireEvent.pointerDown(document.body)
    rerender(<A2aPanel {...panelProps(unit.directory, store)} /> as never)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ui-a2a plugin', () => {
  it('registers all three surfaces and shares the directory service', async () => {
    const client = apiClient()
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    slots.register({
      name: 'root',
      children: {
        'conversation.view': { kind: 'list', scope: 'session' },
        'conversation.input.left': { kind: 'list', scope: 'session' },
        'conversation.input.overlay': { kind: 'list', scope: 'session' },
      },
    }, (() => null) as never)
    ctx.provide('connection', { rpc: client.rpc } as never)
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('sessions', { scope: () => ctx } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('conversation.view').map(entry => entry.options.id)).toContain('a2a')
    expect(slots.entries('conversation.input.left').map(entry => entry.options.id)).toContain('a2a-identity')
    expect(slots.entries('conversation.input.overlay').map(entry => entry.options.id)).toContain('a2a-identity-panel')
    const view = slots.entries('conversation.view').find(entry => entry.options.id === 'a2a')
    const badge = slots.entries('conversation.input.left').find(entry => entry.options.id === 'a2a-identity')
    const viewDirectory = (view?.inject as (sessionId: SessionId) => { directory: A2aDirectory })(SID).directory
    const badgeDirectory = (badge?.inject as (sessionId: SessionId) => { directory: A2aDirectory })(SID).directory
    expect(viewDirectory).toBe(badgeDirectory)
    await viewDirectory.load()
    await waitFor(() => { expect(client.calls).toEqual(['snapshot']) })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
