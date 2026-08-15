import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { executeViewCommand, viewRequestMessage } from '../src/command.ts'
import { translator } from '../src/client/i18n.ts'
import type { ViewUiConfig } from '../src/types.ts'
import { ViewService } from '../src/view-service.ts'

function fixture(): { service: ViewService; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sonar-'))
  const path = join(dir, 'state.json')
  return { service: new ViewService('/workspace', path), path }
}

describe('ViewService', () => {
  it('keeps proposals out of the active View and applies accepted writes immediately', () => {
    const { service, path } = fixture()
    const proposal = service.propose({
      sourceId: 'project-memory', type: 'memory', title: 'Build command',
      summary: 'Use pnpm test', content: 'Run pnpm test before committing.', proposedBy: 'model',
    })
    expect(service.query('pnpm')).toEqual([])
    expect(service.status().candidates[0]?.status).toBe('pending')

    service.decide(proposal.id, 'accept')
    expect(service.query('pnpm')).toHaveLength(1)
    const activeStatus = service.status()
    expect(activeStatus.pendingActivation).toBe(false)
    expect(activeStatus.active).toEqual(activeStatus.next)

    const nextRuntime = new ViewService('/workspace', path)
    expect(nextRuntime.query('pnpm')).toHaveLength(1)
  })

  it('applies source disabling immediately without affecting other sources', () => {
    const { service, path } = fixture()
    const proposal = service.propose({ sourceId: 'project-skills', type: 'skill', title: 'Release', content: 'Release safely', proposedBy: 'user' })
    service.decide(proposal.id, 'accept')
    const loaded = new ViewService('/workspace', path)
    expect(loaded.query('', 'skill')).toHaveLength(1)

    loaded.setSourceEnabled('project-skills', false)
    expect(loaded.query('', 'skill')).toHaveLength(0)
    expect(loaded.status().active.entries).toHaveLength(0)
    expect(loaded.status().next.entries).toHaveLength(0)
    expect(new ViewService('/workspace', path).query('', 'skill')).toHaveLength(0)
  })

  it('updates teamwork through confirmed replacements without exposing session identifiers', () => {
    const { service, path } = fixture()
    const proposal = service.propose({
      sourceId: 'teamwork', type: 'teamwork', readMode: 'query', title: 'Validate the UI',
      summary: 'Waiting to start browser verification', teamwork: { owner: 'reviewer', state: 'queued', progress: 0 }, proposedBy: 'model',
    })
    service.decide(proposal.id, 'accept')
    const runtime = new ViewService('/workspace', path)
    const queued = runtime.query('', 'teamwork')[0]!
    expect(queued.teamwork).toEqual({ owner: 'reviewer', state: 'queued', progress: 0 })

    const update = runtime.propose({
      operation: 'replace', targetId: queued.id, sourceId: 'teamwork', type: 'teamwork', readMode: 'query',
      title: 'Validate the UI', summary: 'Browser verification is in progress',
      teamwork: { owner: 'reviewer', state: 'active', progress: 50 }, proposedBy: 'model',
    })
    runtime.decide(update.id, 'accept')
    const active = new ViewService('/workspace', path).query('', 'teamwork')[0]!
    expect(active.teamwork).toEqual({ owner: 'reviewer', state: 'active', progress: 50 })
    expect(active.replaces).toBe(queued.id)
  })

  it('rejects candidates without changing the Active View', () => {
    const { service } = fixture()
    const before = service.status().next.digest
    const proposal = service.propose({ sourceId: 'project-memory', type: 'memory', title: 'Unsafe guess', proposedBy: 'background' })
    service.decide(proposal.id, 'reject')
    expect(service.status().next.digest).toBe(before)
    expect(service.status().pendingActivation).toBe(false)
  })

  it('shares candidates and confirmed active changes across Runtime instances in real time', () => {
    const { service: runtimeA, path } = fixture()
    const runtimeB = new ViewService('/workspace', path)
    const proposal = runtimeA.propose({
      sourceId: 'teamwork', type: 'teamwork', title: 'Runtime B review',
      teamwork: { owner: 'reviewer', state: 'active' }, proposedBy: 'user',
    })

    expect(runtimeB.status().candidates.some(candidate => candidate.id === proposal.id)).toBe(true)
    runtimeB.decide(proposal.id, 'accept')
    expect(runtimeA.status().active.entries.some(entry => entry.title === 'Runtime B review')).toBe(true)
    expect(runtimeA.query('Runtime B review')).toHaveLength(1)
    expect(runtimeB.query('Runtime B review')).toHaveLength(1)
  })

  it('preserves the write operation that produced each candidate and accepted entry', () => {
    const { service } = fixture()
    const record = service.propose({
      sourceId: 'project-memory', type: 'memory', title: 'Explicit decision',
      writeMode: 'record', proposedBy: 'user',
    })
    const targeted = service.propose({
      sourceId: 'project-skills', type: 'skill', title: 'Release checklist',
      writeMode: 'target', writeTarget: 'release/checklist', proposedBy: 'model',
    })
    const organized = service.propose({
      sourceId: 'teamwork', type: 'teamwork', title: 'Background session signal',
      writeMode: 'background', proposedBy: 'background',
    })

    expect([record.writeMode, targeted.writeMode, organized.writeMode]).toEqual(['record', 'target', 'background'])
    service.decide(record.id, 'accept')
    service.decide(targeted.id, 'accept')
    service.decide(organized.id, 'accept')
    expect(Object.fromEntries(service.status().next.entries.map(entry => [entry.title, [entry.writeMode, entry.writeTarget]]))).toEqual({
      'Explicit decision': ['record', undefined],
      'Release checklist': ['target', 'release/checklist'],
      'Background session signal': ['background', undefined],
    })
  })

  it('observes read and write primitives without mutating the active View', () => {
    const { service } = fixture()
    const digest = service.status().active.digest
    service.observeRead('query', 'Search project context', 'model', 'memory')
    service.propose({
      sourceId: 'project-skills', type: 'skill', title: 'Targeted capability',
      writeMode: 'target', writeTarget: 'skills/release', proposedBy: 'user',
    })

    expect(service.status().active.digest).toBe(digest)
    expect(service.status().activity.slice(0, 2).map(item => item.primitive)).toEqual(['target', 'query'])
    expect(() => service.propose({
      sourceId: 'project-skills', type: 'skill', title: 'Missing destination',
      writeMode: 'target', proposedBy: 'user',
    })).toThrow('target write requires writeTarget')
  })

  it('keeps the three read modes behaviorally distinct', () => {
    const { service, path } = fixture()
    const direct = service.propose({
      sourceId: 'project-memory', type: 'memory', readMode: 'direct', title: 'Direct context',
      content: 'direct needle', proposedBy: 'user',
    })
    const expand = service.propose({
      sourceId: 'project-skills', type: 'skill', readMode: 'expand', title: 'Expandable guide',
      summary: 'compact directory summary', content: 'expand needle', proposedBy: 'user',
    })
    const query = service.propose({
      sourceId: 'teamwork', type: 'teamwork', readMode: 'query', title: 'Queryable signal',
      content: 'query needle', proposedBy: 'user',
    })
    for (const candidate of [direct, expand, query]) service.decide(candidate.id, 'accept')

    const runtime = new ViewService('/workspace', path)
    expect(runtime.query('needle', undefined, 'query').map(entry => entry.title)).toEqual(['Queryable signal'])
    expect(runtime.read(runtime.query('Expandable')[0]!.id)?.content).toBe('expand needle')
    expect(runtime.renderPrompt()).toContain('direct needle')
    expect(runtime.renderPrompt()).toContain('Expandable guide')
    expect(runtime.renderPrompt()).not.toContain('expand needle')
    expect(runtime.renderPrompt()).toContain('1 item(s) are available through the view tool')
    expect(runtime.renderPrompt()).toContain('When a user message starts with `/view`')
    expect(runtime.renderPrompt()).toContain('searches only entries whose read mode is query')
    expect(runtime.renderPrompt()).toContain('If it exists in the active View, it is already effective as a View skill')
    expect(runtime.renderPrompt()).toContain('do not inspect or require an external memory or skill registry')
    expect(runtime.renderPrompt()).toContain('never ask for or mention a session identifier')
    expect(runtime.renderPrompt()).toContain('propose a replacement, never simulate a transition')
    expect(runtime.renderPrompt()).toContain('Acceptance immediately rebuilds the active View')
    expect(runtime.renderPrompt()).toContain('There is no staged future View')
    expect(runtime.renderPrompt()).toContain('title, summary, and full content consistently')
  })

  it('makes self-evolution a real confirmed replacement of View skill content', () => {
    const { service, path } = fixture()
    const first = service.propose({
      sourceId: 'project-skills', type: 'skill', readMode: 'expand', writeMode: 'target',
      writeTarget: 'skills/release', title: 'Release checklist', content: 'Run tests before release.', proposedBy: 'model',
    })
    service.decide(first.id, 'accept')

    const runtime = new ViewService('/workspace', path)
    const original = runtime.query('Release checklist', 'skill')[0]!
    const improvement = runtime.propose({
      operation: 'replace', targetId: original.id, sourceId: 'project-skills', type: 'skill',
      readMode: 'expand', writeMode: 'target', writeTarget: 'skills/release', title: 'Release checklist',
      content: 'Run tests and type checks before release.', proposedBy: 'model',
    })
    runtime.decide(improvement.id, 'accept')

    const evolved = new ViewService('/workspace', path).query('Release checklist', 'skill')[0]!
    expect(evolved.content).toBe('Run tests and type checks before release.')
    expect(evolved.revision).toBe(2)
    expect(evolved.replaces).toBe(original.id)
  })

  it('turns completed collaboration records into de-duplicated background candidates only', () => {
    const { service, path } = fixture()
    const completed = service.propose({
      sourceId: 'teamwork', type: 'teamwork', title: 'Browser verification', content: 'The final browser checks passed.',
      teamwork: { owner: 'reviewer', state: 'done', progress: 100 }, proposedBy: 'user',
    })
    const waiting = service.propose({
      sourceId: 'teamwork', type: 'teamwork', title: 'Pending review', content: 'Still waiting.',
      teamwork: { owner: 'reviewer', state: 'waiting', progress: 70 }, proposedBy: 'user',
    })
    service.decide(completed.id, 'accept')
    service.decide(waiting.id, 'accept')

    const runtime = new ViewService('/workspace', path)
    const activeDigest = runtime.status().active.digest
    const sourceEntry = runtime.query('Browser verification', 'teamwork')[0]!
    const organized = runtime.organizeCompletedTeamwork()

    expect(organized).toHaveLength(1)
    expect(organized[0]).toMatchObject({
      sourceId: 'project-memory', type: 'memory', readMode: 'direct', writeMode: 'background',
      status: 'pending', proposedBy: 'background', derivedFrom: sourceEntry.id,
    })
    expect(runtime.status().active.digest).toBe(activeDigest)
    expect(runtime.status().next.digest).toBe(activeDigest)
    expect(runtime.organizeCompletedTeamwork()).toEqual([])
    expect(runtime.status().candidates.filter(candidate => candidate.writeMode === 'background')).toHaveLength(1)
  })

  it('exposes dashboard configuration and complete locale dictionaries', () => {
    const { service: defaults, path } = fixture()
    const ui: ViewUiConfig = {
      locale: 'en-US', refreshIntervalMs: 4_000, motion: 'reduced',
      backgroundReviewEnabled: false, backgroundReviewIntervalMs: 30_000,
    }
    const service = new ViewService('/workspace', path, ui)
    expect(defaults.status().ui.refreshIntervalMs).toBe(500)
    expect(service.status().ui).toEqual(ui)
    expect(translator('en-US')('boardTitle')).toBe('View Operations Board')
    expect(translator('zh-CN')('boardTitle')).toBe('View 操作看板')
    expect(translator('en-US')('navConfiguration')).toBe('Configuration')
    expect(translator('zh-CN')('navConfiguration')).toBe('配置')
    expect(translator('zh-CN')('pendingCount', { count: 3 })).toBe('3 条待确认')
  })

  it('updates UI configuration live without rebuilding the active View', () => {
    const { service } = fixture()
    const active = service.status().active
    const next: ViewUiConfig = {
      locale: 'en-US', refreshIntervalMs: 1_200, motion: 'reduced',
      backgroundReviewEnabled: false, backgroundReviewIntervalMs: 30_000,
    }

    service.setUiConfig(next)

    expect(service.status().ui).toEqual(next)
    expect(service.status().active.id).toBe(active.id)
    expect(service.status().active.digest).toBe(active.digest)
  })

  it('routes natural-language /view input to the current agent without interpreting it', () => {
    const delivered: unknown[] = []
    const invocation = {
      rawInput: '  发布开始时直接提供约束，需要时再展开检查步骤。  ',
      agent: { followup: (message: unknown) => delivered.push(message) },
    } as unknown as Parameters<typeof executeViewCommand>[0]

    expect(viewRequestMessage(invocation.rawInput)).toBe('/view 发布开始时直接提供约束，需要时再展开检查步骤。')
    expect(executeViewCommand(invocation)).toMatchObject({ kind: 'success' })
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '/view 发布开始时直接提供约束，需要时再展开检查步骤。' }],
    })
  })

  it('rejects an empty /view description before starting model work', () => {
    let delivered = false
    const result = executeViewCommand({
      rawInput: '   ',
      agent: { followup: () => { delivered = true } },
    } as unknown as Parameters<typeof executeViewCommand>[0])

    expect(result).toMatchObject({ kind: 'error' })
    expect(delivered).toBe(false)
  })
})
