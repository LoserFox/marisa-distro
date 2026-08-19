/**
 * Mount-time acceptance: manifest/declaration checks (events, vocabulary,
 * property names, mode ceilings) and protected-field enforcement. Permission
 * grants are gone.
 */

import { describe, expect, it } from 'vitest'
import { PluginError, definePlugin } from '@r05en1cu/dsh-mygo-api'
import {
  assertEventOptions,
  validateMount,
  type MountValidationOptions,
} from '@r05en1cu/dsh-mygo'
import { fixturePlugin } from './helpers.ts'

const BASE_OPTIONS: MountValidationOptions = {
  source: { type: 'inline', code: 'export default {}' },
  origin: 'runtime-api',
  protectedFields: [],
}

function caught(definition: Parameters<typeof validateMount>[0], options: MountValidationOptions = BASE_OPTIONS): PluginError {
  try {
    validateMount(definition, options)
  } catch (error) {
    expect(error).toBeInstanceOf(PluginError)
    return error as PluginError
  }
  throw new Error(`expected validateMount to throw for ${definition.id}`)
}

describe('validateMount group 1 (manifest and declarations)', () => {
  it('rejects a malformed manifest with manifest-invalid naming field and expected contract', () => {
    const error = caught({ ...fixturePlugin(), id: 'Bad_Id' })
    expect(error.code).toBe('manifest-invalid')
    expect(error.details).toMatchObject({ field: 'id' })
    expect(error.message).toContain('id')
    expect(error.message).toContain('expected')
    expect(error.pluginId).toBeUndefined()
  })

  it('accepts declared custom events and rejects reserved collisions / observe-only violations', () => {
    const ok = validateMount(fixturePlugin({
      events: ['custom/thing'],
      permissions: { ...fixturePlugin().permissions, observe: ['custom/thing'] },
    }), BASE_OPTIONS)
    expect(ok.warnings).toEqual([])

    const reserved = caught(fixturePlugin({ events: ['session/created'] }))
    expect(reserved.code).toBe('manifest-invalid')
    expect(reserved.details).toMatchObject({ field: 'events' })

    const observeOnly = caught(fixturePlugin({
      events: ['custom/thing'],
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'custom/thing', writes: [] }],
      },
    }))
    expect(observeOnly.code).toBe('manifest-invalid')
    expect(observeOnly.details).toMatchObject({ field: 'events' })
  })

  it('accepts declared event namespaces and rejects malformed/reserved patterns and permission use', () => {
    const ok = validateMount(fixturePlugin({
      events: ['pi-ext/*'],
    }), BASE_OPTIONS)
    expect(ok.warnings).toEqual([])

    const malformed = caught(fixturePlugin({ events: ['pi-ext/*/deep'] }))
    expect(malformed.code).toBe('manifest-invalid')
    expect(malformed.details).toMatchObject({ field: 'events.0' })

    const reserved = caught(fixturePlugin({ events: ['agent/*'] }))
    expect(reserved.code).toBe('manifest-invalid')
    expect(reserved.details).toMatchObject({ field: 'events' })

    const observeOnly = caught(fixturePlugin({
      events: ['pi-ext/*'],
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'pi-ext/gate', writes: [] }],
      },
    }))
    expect(observeOnly.code).toBe('manifest-invalid')
    expect(observeOnly.details).toMatchObject({ field: 'events' })
  })

  it('accepts dynamicInstallAccess without any deployment grant', () => {
    const result = validateMount(fixturePlugin({ dynamicInstallAccess: true }), BASE_OPTIONS)
    expect(result.warnings).toEqual([])
  })

  it('names the manifest root for a non-object manifest', () => {
    const error = caught(null as unknown as Parameters<typeof validateMount>[0])
    expect(error.code).toBe('manifest-invalid')
    expect(error.details).toMatchObject({ field: 'manifest' })

    const nonStringId = caught({ id: 42 } as unknown as Parameters<typeof validateMount>[0])
    expect(nonStringId.code).toBe('manifest-invalid')
    expect(nonStringId.details).toMatchObject({ field: 'id' })
  })

  it('validates all optional hooks and rejects non-function hooks', () => {
    const allHooks = fixturePlugin({
      hooks: {
        setup: async () => {},
        activate: () => {},
        deactivate: async () => {},
        captureState: () => ({}),
        restoreState: async () => {},
        dispose: async () => {},
      },
    })
    expect(validateMount(allHooks, BASE_OPTIONS).warnings).toEqual([])

    const error = caught({
      ...fixturePlugin(),
      hooks: { activate: 'not-a-function' },
    } as unknown as Parameters<typeof validateMount>[0])
    expect(error.code).toBe('manifest-invalid')
    expect(error.details).toMatchObject({ field: 'hooks.activate' })
  })

  it('accepts a client-half declaration and rejects a malformed one', () => {
    const result = validateMount(fixturePlugin({
      client: { main: './lib/client.js', inject: ['@deepseek-ai/dsh-client-runtime'] },
    }), BASE_OPTIONS)
    expect(result.warnings).toEqual([])

    const error = caught(fixturePlugin({
      client: { main: '', inject: [] },
    }))
    expect(error.code).toBe('manifest-invalid')
    expect(error.details).toMatchObject({ field: 'client.main' })
  })

  it('rejects observe declarations outside the harness tier with event-not-mountable', () => {
    const error = caught(fixturePlugin({
      permissions: { ...fixturePlugin().permissions, observe: ['internal/listener'] },
    }))
    expect(error.code).toBe('event-not-mountable')
    expect(error.details).toEqual({ event: 'internal/listener', tier: 'harness' })
    expect(error.message).toContain('internal/listener')
    expect(error.message).toContain('harness')
    expect(error.pluginId).toBe('fixture-plugin')
  })

  it('rejects transform declarations on non-waterfall events with mode-ceiling-exceeded', () => {
    const error = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'agent/status', writes: ['status'] }],
      },
    }))
    expect(error.code).toBe('mode-ceiling-exceeded')
    expect(error.details).toEqual({ event: 'agent/status', mode: 'transform', ceiling: 'observe' })
    expect(error.message).toContain('agent/status')
    expect(error.message).toContain('transform')
    expect(error.message).toContain('observe')
  })

  it('rejects intercept declarations on emit events with mode-ceiling-exceeded (serial allows intercept)', () => {
    const emit = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        intercept: [{ event: 'agent/status', returns: [] }],
      },
    }))
    expect(emit.code).toBe('mode-ceiling-exceeded')
    expect(emit.details).toEqual({ event: 'agent/status', mode: 'intercept', ceiling: 'observe' })

    const serial = validateMount(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        intercept: [{ event: 'agent/turn-stopping', returns: [] }],
      },
    }), BASE_OPTIONS)
    expect(serial.warnings).toEqual([])
  })

  it('rejects payload-external names with non-payload-name', () => {
    const error = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'system-prompt/assemble', reads: ['service:memory.pending'] }],
      },
    }))
    expect(error.code).toBe('non-payload-name')
    expect(error.details).toEqual({ name: 'service:memory.pending', boundary: 'payload properties only' })
    expect(error.message).toContain('service:memory.pending')
    expect(error.message).toContain('payload properties only')
  })

  it('rejects unknown property names with unknown-property naming the valid set', () => {
    const error = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'system-prompt/assemble', writes: ['modle'] }],
      },
    }))
    expect(error.code).toBe('unknown-property')
    expect(error.details).toEqual({
      event: 'system-prompt/assemble',
      name: 'modle',
      valid: ['contexts', 'sections', 'tools', 'variables'],
    })
    expect(error.message).toContain('modle')
    expect(error.message).toContain('system-prompt/assemble')
    expect(error.message).toContain('contexts, sections, tools, variables')
  })

  it('rejects unknown intercept branches with unknown-property naming the branch vocabulary', () => {
    const error = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        intercept: [{ event: 'tools/pre-execute', returns: ['maybe'] }],
      },
    }))
    expect(error.code).toBe('unknown-property')
    expect(error.details).toEqual({
      event: 'tools/pre-execute',
      name: 'maybe',
      valid: ['allow', 'ask', 'deny'],
    })
    expect(error.message).toContain('maybe')
    expect(error.message).toContain('allow, ask, deny')
  })

  it('rejects capability range syntax with capability-range-reserved', () => {
    const requires = caught(fixturePlugin({ requires: ['loop-detection@2'] }))
    expect(requires.code).toBe('capability-range-reserved')
    expect(requires.details).toEqual({ entry: 'loop-detection@2', note: 'v2 name@range' })
    expect(requires.message).toContain('loop-detection@2')
    expect(requires.message).toContain('v2 name@range')

    const provides = caught(fixturePlugin({ provides: ['service@^1'] }))
    expect(provides.code).toBe('capability-range-reserved')
  })

  it('rejects writes hitting protected fields with protected-field', () => {
    const error = caught(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{ event: 'tools/post-execute', writes: ['value'] }],
      },
    }), {
      ...BASE_OPTIONS,
      protectedFields: ['tools/post-execute.value'],
    })
    expect(error.code).toBe('protected-field')
    expect(error.details).toEqual({ field: 'tools/post-execute.value' })
    expect(error.message).toContain('tools/post-execute.value')
  })
})

describe('validateMount success path', () => {
  it('accepts a waterfall transform with reads/writes/appends and no warnings', () => {
    const definition = fixturePlugin({
      requires: ['llm'],
      provides: ['counter'],
      permissions: {
        ...fixturePlugin().permissions,
        observe: ['agent/status'],
        transform: [{
          event: 'tools/post-execute',
          reads: ['kind'],
          writes: ['value'],
          appends: ['additionalContexts'],
        }],
      },
    })
    const result = validateMount(definePlugin(definition), BASE_OPTIONS)
    expect(result.warnings).toEqual([])
  })

  it('accepts a transform that declares only reads and appends', () => {
    const result = validateMount(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        transform: [{
          event: 'tools/post-execute',
          reads: ['kind'],
          appends: ['additionalContexts'],
        }],
      },
    }), BASE_OPTIONS)
    expect(result.warnings).toEqual([])
  })

  it('accepts claims and serial intercept without any grant', () => {
    const claims = validateMount(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        claims: ['service:llm'],
      },
    }), BASE_OPTIONS)
    expect(claims.warnings).toEqual([])

    const intercept = validateMount(fixturePlugin({
      permissions: {
        ...fixturePlugin().permissions,
        intercept: [{ event: 'agent/turn-stopping', returns: [] }],
      },
    }), BASE_OPTIONS)
    expect(intercept.warnings).toEqual([])
  })
})

describe('assertEventOptions', () => {
  it('names a string option, a keyed option object, and an empty object', () => {
    const cases: readonly [unknown, string][] = [
      ['prepend', 'prepend'],
      [{ prepend: true }, 'prepend'],
      [{}, ''],
    ]
    for (const [option, expected] of cases) {
      try {
        assertEventOptions([option], 'fixture-plugin')
      } catch (error) {
        expect((error as PluginError).code).toBe('unsupported-event-option')
        expect((error as PluginError).details).toEqual({ option: expected })
        continue
      }
      throw new Error('expected assertEventOptions to throw')
    }
  })
})
