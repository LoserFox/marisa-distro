/**
 * Rule-based auto-capture tests — the todo_write signal produces captures
 * from the structured tool stream, dedupe, carry motivation context (live
 * cache + persisted-log seed), and dispose cleanly. Git branch creation is
 * NOT a signal (removed 2026-08-11 — execution carrier, not a requirement).
 * Pure rules: no timers, no LLM.
 * @module tests/auto-capture.spec
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from 'cordis'
import { createAutoCapture } from '../src/capture/observe.ts'
import type { TrackStore } from '../src/store.ts'

/** Fake store capturing createCapture payloads. */
function makeStore() {
  const captures: Array<Record<string, unknown>> = []
  return {
    captures,
    upsertCapture: vi.fn(async (c: Record<string, unknown>) => { captures.push(c) }),
    // The observer now gates every capture through createCapture (dedup).
    createCapture: vi.fn(async (c: Record<string, unknown>, _opts?: { dedupeBySession?: boolean }) => {
      captures.push(c)
      return { status: 'created', capture: c }
    }),
  } as unknown as TrackStore & { captures: Array<Record<string, unknown>> }
}

/** Emit a tool/call through the observer with a session stub. */
function emitTool(ctx: Context, sessionId: string, name: string, args: unknown): void {
  ctx.emit('session/event', { id: sessionId }, {
    type: 'tool/call',
    data: { name, arguments: JSON.stringify(args) },
  })
}

describe('createAutoCapture', () => {
  it('captures the first todo_write per session (planning signal)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 'session-a', 'todo_write', {
      todos: [
        { content: 'Create feature worktree (feat/right-panel-actions)', status: 'in_progress' },
        { content: 'Server: add routes', status: 'pending' },
      ],
    })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const cap = store.captures[0]!
    expect(cap.content).toBe('Create feature worktree (feat/right-panel-actions)')
    expect(cap.source).toBe('session')
    expect(cap.sourceSessionId).toBe('session-a')
    expect(cap.tags).toContain('todo')
    expect(cap.status).toBe('open')
    dispose()
  })

  it('dedupes repeated todo_write calls within one session', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 'session-a', 'todo_write', { todos: [{ content: 'first plan' }] })
    emitTool(ctx, 'session-a', 'todo_write', { todos: [{ content: 'updated plan' }] })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('captures per-session for different sessions', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 'session-a', 'todo_write', { todos: [{ content: 'plan A' }] })
    emitTool(ctx, 'session-b', 'todo_write', { todos: [{ content: 'plan B' }] })
    expect(store.createCapture).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('does NOT capture git branch creation (signal removed — execution carrier, not a requirement)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    // Branch creation used to capture "新建分支 feat/…" but dominated the wall
    // with noise (9/17 in practice); todo_write covers the same work lines
    // with the requirement's own wording.
    emitTool(ctx, 'session-a', 'bash', { command: 'cd /repo && git worktree add -b feat/track-observability ../dsh-track-obs' })
    emitTool(ctx, 's1', 'bash', { command: 'git checkout -b feat/a' })
    emitTool(ctx, 's2', 'bash', { command: 'git switch -c fix/b' })
    emitTool(ctx, 's1', 'bash', { command: 'git checkout -b main' })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  it('ignores non-branch git commands and non-tool events', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 's1', 'bash', { command: 'git branch -d feat/gone' })
    emitTool(ctx, 's1', 'bash', { command: 'git checkout feat/existing' })
    ctx.emit('session/event', { id: 's1' }, { type: 'user/message', data: { text: 'hi' } })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  it('ignores malformed arguments without throwing', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, { type: 'tool/call', data: { name: 'todo_write', arguments: 'not-json{' } })
    ctx.emit('session/event', { id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: 'nope' } })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  it('dispose unregisters the listener', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })
    dispose()

    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: 'should not capture' }] })
    expect(store.createCapture).not.toHaveBeenCalled()
  })

  it('attaches the latest explicit user request as context (A)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    // A user request (source.kind === 'user') is the motivation context.
    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: {
        id: 'msg-live-1',
        content: [{ type: 'text', text: '做一个模块，记录所有 track 发起的 llm 数据，计算开销' }],
        source: { kind: 'user' },
      },
    })
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '调研 StreamChunk usage/token 字段' }] })

    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const cap = store.captures[0]!
    expect(cap.content).toBe('调研 StreamChunk usage/token 字段')
    expect(cap.context).toContain('记录所有 track 发起的 llm 数据')
    expect(cap.sourceMessageId).toBe('msg-live-1')
    dispose()
  })

  it('context is the LATEST full instruction, not the first (A)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    const userMsg = (text: string) => ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
    })
    userMsg('第一件事：请整理 dsh-harness-ops 的文档目录结构')
    userMsg('第二件事：做一个 llm 用量计量模块，记录所有 track 发起的调用')
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '调研 StreamChunk usage/token 字段' }] })

    const cap = store.captures[0]!
    expect(cap.content).toBe('调研 StreamChunk usage/token 字段')
    expect(cap.context).toContain('llm 用量计量模块')
    expect(cap.context).not.toContain('整理文档')
    dispose()
  })

  it('plugin/system user/message events do NOT become context (A)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    // system-reminder style: no source.kind === 'user' → ignored.
    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: 'The following workspace instructions…' }], source: { kind: 'plugin' } },
    })
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '做 X' }] })

    const cap = store.captures[0]!
    expect(cap.context).toBeUndefined()
    dispose()
  })

  it('context-less capture (no prior user request) still captures (A)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '开头的需求' }] })
    const cap = store.captures[0]!
    expect(cap.content).toBe('开头的需求')
    expect(cap.context).toBeUndefined()
    dispose()
  })

  it('seeds context from the persisted log on first signal (continued session)', async () => {
    const ctx = new Context()
    const store = makeStore()
    // Continued (spliced) session: no user/message flows through this process,
    // so seedContext backfills from the log (text + message id).
    const seedContext = vi.fn(async () => ({ text: '重启前的用户请求：做一个 llm 用量计量模块', id: 'msg-seed-9' }))
    const dispose = createAutoCapture(ctx, { store, seedContext })

    // Realistic splice: many events pass BEFORE the first signal — each
    // pre-warms the cache; the seed resolves before the todo_write lands.
    ctx.emit('session/event', { id: 's1' }, { type: 'turn/start' })
    await new Promise((r) => setTimeout(r, 10))
    expect(seedContext).toHaveBeenCalledWith('s1')

    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '调研 StreamChunk usage/token 字段' }] })
    const cap = store.captures[0]!
    expect(cap.content).toBe('调研 StreamChunk usage/token 字段')
    expect(cap.context).toContain('llm 用量计量模块')
    expect(cap.sourceMessageId).toBe('msg-seed-9')
    dispose()
  })

  it('seeds only once per session (seedContext not called repeatedly)', async () => {
    const ctx = new Context()
    const store = makeStore()
    const seedContext = vi.fn(async () => '用户意图 A')
    const dispose = createAutoCapture(ctx, { store, seedContext })

    ctx.emit('session/event', { id: 's1' }, { type: 'turn/start' })
    await new Promise((r) => setTimeout(r, 10))
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '需求 A 的完整描述' }] })
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '需求 B 的完整描述' }] })
    await new Promise((r) => setTimeout(r, 10))
    expect(seedContext).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('live user/message beats the seed (cache updated by the stream)', async () => {
    const ctx = new Context()
    const store = makeStore()
    const seedContext = vi.fn(async () => ({ text: '旧意图（不该被用）', id: 'msg-stale-1' }))
    const dispose = createAutoCapture(ctx, { store, seedContext })

    // A real user request arrives AFTER the observer starts → cache is warm.
    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: {
        id: 'msg-live-2',
        content: [{ type: 'text', text: '新意图：请修复侧边栏不可见的问题并补测试' }], source: { kind: 'user' },
      },
    })
    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '排查 side panel' }] })
    await new Promise((r) => setTimeout(r, 10))
    expect(seedContext).not.toHaveBeenCalled() // cache already warm
    const cap = store.captures[0]!
    expect(cap.context).toContain('修复侧边栏')
    expect(cap.sourceMessageId).toBe('msg-live-2')
    dispose()
  })

  // ---- goal/change signal (2026-08-14: goal requirements were invisible —
  // only the first todo entry ever captured) ----

  it('captures a created goal as a requirement (goal/change create)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { id: 'msg-g-1', content: [{ type: 'text', text: 'A B 先做 C 需要讨论，状态机设计要详细讨论' }], source: { kind: 'user' } },
    })
    ctx.emit('session/event', { id: 's1' }, {
      type: 'goal/change',
      data: {
        operation: 'create',
        goal: { id: 'goal-1', objective: '完成 A/B 改造并落地 3080：A=修复完成确认通道；B=打通捕获→任务转化' },
      },
    })

    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const cap = store.captures[0]!
    expect(cap.content).toBe('完成 A/B 改造并落地 3080：A=修复完成确认通道；B=打通捕获→任务转化')
    expect(cap.tags).toContain('goal')
    expect(cap.sourceSessionId).toBe('s1')
    expect(cap.context).toContain('状态机设计要详细讨论')
    expect(cap.sourceMessageId).toBe('msg-g-1')
    dispose()
  })

  it('does NOT capture goal updates (only creation)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'goal/change',
      data: { operation: 'update', goal: { id: 'goal-1', objective: '进度更新' } },
    })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  it('dedupes repeated goal/change for one goal id, captures distinct goals', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    const goalChange = (id: string, objective: string) => ctx.emit('session/event', { id: 's1' }, {
      type: 'goal/change',
      data: { operation: 'create', goal: { id, objective } },
    })
    goalChange('goal-1', '目标一')
    goalChange('goal-1', '目标一（revision 2）') // same id → suppressed
    goalChange('goal-2', '目标二')
    expect(store.createCapture).toHaveBeenCalledTimes(2)
    expect(store.captures.map((c) => c.content)).toEqual(['目标一', '目标二'])
    dispose()
  })

  it('goal + todo in one session capture BOTH (the 2026-08-14 incident case)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    // Realistic sequence: user requirements → create_goal (A/B/C) → todo_write
    // whose FIRST entry is a sub-task (C 调研). Both must land on the wall.
    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '任务转派与历史状态清理机制讨论' }], source: { kind: 'user' } },
    })
    ctx.emit('session/event', { id: 's1' }, {
      type: 'goal/change',
      data: { operation: 'create', goal: { id: 'goal-x', objective: 'A=修复完成确认通道；B=打通捕获→任务转化；C=调研状态机论文' } },
    })
    emitTool(ctx, 's1', 'todo_write', {
      todos: [
        { content: 'C 调研：后台 subagent 搜集状态机论文' },
        { content: 'A: types.ts 增加 pendingConfirm 字段' },
        { content: 'B: promoteCaptureToIssue 质量提升' },
      ],
    })

    expect(store.createCapture).toHaveBeenCalledTimes(2)
    expect(store.captures[0]!.content).toContain('A=修复完成确认通道')
    expect(store.captures[0]!.tags).toContain('goal')
    expect(store.captures[1]!.content).toBe('C 调研：后台 subagent 搜集状态机论文')
    expect(store.captures[1]!.tags).toContain('todo')
    dispose()
  })

  // ---- todo/write event signal (the canonical structured form) ----

  it('captures from the todo/write EVENT (not just the tool call)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'todo/write',
      data: { todos: [{ content: '从事件驱动的规划信号捕获', status: 'in_progress' }] },
    })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    expect(store.captures[0]!.content).toBe('从事件驱动的规划信号捕获')
    expect(store.captures[0]!.tags).toContain('todo')
    dispose()
  })

  it('a todo_write tool call + its todo/write event capture once (shared gate)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '计划 X' }] })
    ctx.emit('session/event', { id: 's1' }, { type: 'todo/write', data: { todos: [{ content: '计划 X' }] } })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    dispose()
  })

  // ---- G1: subagent delegation signal (2026-08-14 audit gap) ----

  it('captures a subagent delegation prompt (child header origin=subagent)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    // A subagent child session carries origin:'subagent' in its header; its
    // delegation prompt arrives as the first user-kind user message. (The
    // subagent/descriptor event is a seed-phase write that never publishes.)
    ctx.emit('session/event', { id: 'child-1', header: { origin: 'subagent', parentSession: 'parent-1' } }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '你是研究助理。任务：为一款 AI 编码助手的嵌入式任务管理插件调研相关学术论文，并产出带链接的调研文档。' }], source: { kind: 'user' } },
    })

    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const cap = store.captures[0]!
    expect(cap.content).toContain('你是研究助理。任务：')
    expect(cap.tags).toContain('delegate')
    expect(cap.sourceSessionId).toBe('child-1')
    dispose()
  })

  it('does NOT delegate-capture normal (non-subagent) sessions', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1', header: { origin: undefined } }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '这是一个普通用户的第一个长消息，没有 subagent 头标记，不应该作为委托捕获，而应该作为需求级消息进入捕获墙。' }], source: { kind: 'user' } },
    })
    // Not a delegate capture — but it IS a requirement-level message (G2).
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    expect(store.captures[0]!.tags).not.toContain('delegate')
    expect(store.captures[0]!.tags).toContain('requirement')
    dispose()
  })

  it('fork children (origin=fork) are NOT delegate-captured', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 'fork-1', header: { origin: 'fork', parentSession: 'parent-1' } }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '分叉会话继承的第一条消息，是父会话内容而不是委托，不应作为 delegate 捕获。' }], source: { kind: 'user' } },
    })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    expect(store.captures[0]!.tags).toContain('requirement')
    expect(store.captures[0]!.tags).not.toContain('delegate')
    dispose()
  })

  it('delegation captures once per child session', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    const childMsg = (text: string) => ctx.emit('session/event', { id: 'child-1', header: { origin: 'subagent', parentSession: 'parent-1' } }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
    })
    childMsg('你是研究助理。任务：第一个委托任务，需要完整捕获。')
    childMsg('你是研究助理。任务：第二个委托任务（应被去重）。')
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    dispose()
  })

  // ---- G2: requirement-level user message signal ----

  it('captures the first requirement-level user message per session (G2)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '嗯，之后我们讨论一下：我们现在已经捕获了很多想法，第一是怎么转任务，第二是任务历史里很多已完成但还是 in progress 的怎么办，整个机制有很多可以讨论的地方。' }], source: { kind: 'user' } },
    })
    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '第二个同样长的需求消息：应该被 per-session 去重挡住，不产生第二条。' }], source: { kind: 'user' } },
    })

    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const cap = store.captures[0]!
    expect(cap.content).toContain('第一是怎么转任务')
    expect(cap.tags).toContain('requirement')
    dispose()
  })

  it('G2 requirement captures are title-ified, keep raw context + jump-back id, durable-dedup', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's-req' }, {
      type: 'user/message',
      data: {
        id: 'msg-42',
        content: [{ type: 'text', text: '1 pr merge 吧，tag 发布 npm，npm 要在 readme里提现吧？\n做npm tag的github pipeline？并且加 npm badge？' }],
        source: { kind: 'user' },
      },
    })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    const [cap, opts] = store.createCapture.mock.calls[0] as [Record<string, unknown>, { dedupeRequirementBySession?: boolean }]
    expect(cap.content).toBe('pr merge 吧，tag 发布 npm，npm 要在 readme里提现吧？ 做npm tag的github pipeline？并且加 npm badge？')
    expect(String(cap.content)).not.toContain('\n') // one line
    expect(String(cap.content)).not.toMatch(/^\d+ /) // leading list marker stripped
    expect(cap.context).toContain('1 pr merge 吧') // raw message preserved
    expect(cap.sourceMessageId).toBe('msg-42') // jump-back target
    expect(opts?.dedupeRequirementBySession).toBe(true) // durable marker requested
    dispose()
  })

  it('todo and goal captures are title-ified too (consistent one-liners)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })
    emitTool(ctx, 's-t', 'todo_write', { todos: [{ content: '\n\n  3.  调研 StreamChunk 结构\n  确认 usage/token 字段  ' }] })
    ctx.emit('session/event', { id: 's-g' }, {
      type: 'goal/change',
      data: { operation: 'create', goal: { id: 'g1', objective: '4. 做自动维护机制，\n让管线持续运行' } },
    })
    const todo = store.captures.find((c) => c.tags.includes('todo'))!
    const goal = store.captures.find((c) => c.tags.includes('goal'))!
    expect(String(todo.content)).toBe('调研 StreamChunk 结构 确认 usage/token 字段')
    expect(String(goal.content)).toBe('做自动维护机制， 让管线持续运行')
    dispose()
  })

  it('does NOT capture terse user messages as requirements (below minChars)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '查一下 dsh 机制' }], source: { kind: 'user' } },
    })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  // ---- signal mask configuration ----

  it('signal mask: todo off skips todo captures, others still fire', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store }, { signals: { todo: false } })

    emitTool(ctx, 's1', 'todo_write', { todos: [{ content: '计划 X' }] })
    expect(store.createCapture).not.toHaveBeenCalled()

    ctx.emit('session/event', { id: 's1' }, {
      type: 'goal/change',
      data: { operation: 'create', goal: { id: 'goal-x', objective: '目标 Y：仍然应该被捕获（goal 未关）' } },
    })
    expect(store.createCapture).toHaveBeenCalledTimes(1)
    expect(store.captures[0]!.tags).toContain('goal')
    dispose()
  })

  it('signal mask: requirement off skips requirement captures', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store }, { signals: { requirement: false } })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '这是一条足够长的需求消息，但 requirement 信号已关闭，不应捕获。' }], source: { kind: 'user' } },
    })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })

  it('requirement thresholds are configurable (custom minChars)', () => {
    const ctx = new Context()
    const store = makeStore()
    const dispose = createAutoCapture(ctx, { store }, { requirement: { minChars: 100 } })

    ctx.emit('session/event', { id: 's1' }, {
      type: 'user/message',
      data: { content: [{ type: 'text', text: '中等长度的需求消息，未达到自定义 100 字门槛，不应捕获。' }], source: { kind: 'user' } },
    })
    expect(store.createCapture).not.toHaveBeenCalled()
    dispose()
  })
})
