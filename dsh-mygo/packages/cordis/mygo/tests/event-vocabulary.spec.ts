/**
 * Generated-vocabulary contract: the manager's mount-time tier and property
 * vocabulary comes from `gen-cordis-catalog` (no handwritten allowlist), so
 * the artifact must carry every harness event with its mode and the expected
 * return-type-derived names/branches, and must exclude the inherited tier.
 */

import { describe, expect, it } from 'vitest'
import { EVENT_VOCABULARY } from '@r05en1cu/dsh-mygo'

describe('generated event vocabulary', () => {
  it('covers the harness tier and excludes the inherited tier', () => {
    expect(EVENT_VOCABULARY.length).toBeGreaterThan(40)
    const names = new Set(EVENT_VOCABULARY.map(entry => entry.name))
    for (const entry of EVENT_VOCABULARY) {
      expect(entry.name, 'event names must be unique').not.toBeUndefined()
      expect(['emit', 'waterfall', 'parallel', 'serial']).toContain(entry.mode)
      expect(entry.name.startsWith('internal/')).toBe(false)
      expect(entry.name.startsWith('hmr/')).toBe(false)
      expect(entry.name.startsWith('loader/')).toBe(false)
      expect(entry.name).not.toBe('exit')
    }
    expect(names.has('agent/status')).toBe(true)
    expect(names.has('internal/listener')).toBe(false)
    expect(names.has('internal/dispatch')).toBe(false)
  })

  it("tracks the snapshot's ecosystem events: plugin lifecycle present, agent/settled absent", () => {
    const names = new Set(EVENT_VOCABULARY.map(entry => entry.name))
    expect(names.has('plugin/activated')).toBe(true)
    expect(names.has('plugin/replaced')).toBe(true)
    expect(names.has('plugin/uninstalled')).toBe(true)
    // agent/settled exists in newer dsh-external harness sources but not in
    // this snapshot; the vocabulary must not invent events the harness does
    // not declare (distill's rejection is the documented consequence).
    expect(names.has('agent/settled')).toBe(false)
  })

  it('derives payload property names from Record-shaped return types', () => {
    const assemble = EVENT_VOCABULARY.find(entry => entry.name === 'system-prompt/assemble')
    expect(assemble?.mode).toBe('waterfall')
    expect(assemble?.properties).toEqual(['contexts', 'sections', 'tools', 'variables'])
    expect(assemble?.branches).toEqual([])

    const editIntent = EVENT_VOCABULARY.find(entry => entry.name === 'fs/edit-intent')
    expect(editIntent?.properties).toEqual(['version'])
  })

  it('derives discriminant labels from decision-union return types', () => {
    const preStep = EVENT_VOCABULARY.find(entry => entry.name === 'agent/pre-step')
    expect(preStep?.branches).toEqual(['enter', 'reject'])
    expect(preStep?.properties).toEqual(['kind', 'messages'])

    const preTool = EVENT_VOCABULARY.find(entry => entry.name === 'tools/pre-execute')
    expect(preTool?.branches).toEqual(['allow', 'ask', 'deny'])
    expect(preTool?.properties).toEqual(['kind', 'reason'])

    const postTool = EVENT_VOCABULARY.find(entry => entry.name === 'tools/post-execute')
    expect(postTool?.branches).toEqual(['accept', 'block'])
    expect(postTool?.properties).toEqual(['additionalContexts', 'content', 'feedback', 'kind', 'value'])

    const approval = EVENT_VOCABULARY.find(entry => entry.name === 'approval/request')
    expect(approval?.branches).toEqual(['allowed-once', 'cancelled', 'rejected', 'unavailable'])
    expect(approval?.properties).toEqual([])
  })

  it('keeps events sorted by name and vocabulary fields sorted', () => {
    const names = EVENT_VOCABULARY.map(entry => entry.name)
    expect(names).toEqual([...names].sort())
    for (const entry of EVENT_VOCABULARY) {
      expect(entry.properties ?? []).toEqual([...(entry.properties ?? [])].sort())
      expect(entry.branches ?? []).toEqual([...(entry.branches ?? [])].sort())
    }
  })
})
