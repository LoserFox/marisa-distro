/**
 * Skill provider view: the manager publishes one provider per owning plugin,
 * and the view must preserve the plugin's declared invocation/source/provider
 * /rank fields (dsh-101 registers them explicitly) instead of overwriting
 * them with manager defaults.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DispatchMachine, InMemoryRegistryStore, LifecycleEngine, resolvePluginManagerConfig } from '@r05en1cu/dsh-mygo'

interface CapturedProvider {
  readonly list: () => Promise<unknown[]>
  readonly get: (candidate: { locator?: unknown }) => Promise<unknown>
}

class FakeSkillService {
  readonly providers: CapturedProvider[] = []

  registerProvider(create: (control: unknown) => unknown): () => void {
    this.providers.push(create({}) as CapturedProvider)
    return () => {}
  }
}

async function boot(): Promise<{ engine: LifecycleEngine; skills: FakeSkillService }> {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  const skills = new FakeSkillService()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: [],
    skillService: skills,
  })
  return { engine, skills }
}

describe('managed skill provider view', () => {
  it('preserves plugin-declared invocation/source/provider/rank fields', async () => {
    const { engine, skills } = await boot()
    await engine.adoptRaw({
      name: 'skill-plugin',
      apply(ctx: { skills: { register(skill: unknown): () => void } }): void {
        ctx.skills.register({
          name: 'dsh-101-curator',
          description: 'Refresh the corpus curation',
          whenToUse: 'When docs are outdated',
          content: '# Curator\n\nInstructions.',
          invocation: { modelInvocable: true, userInvocable: false },
          source: 'runtime',
          provider: 'runtime',
          rank: 7,
        })
      },
    } as never, {}, 'skill-plugin')
    const provider = skills.providers[0]!
    expect(provider).toBeDefined()
    const list = (await provider.list()) as Array<Record<string, unknown>>
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      name: 'dsh-101-curator',
      description: 'Refresh the corpus curation',
      whenToUse: 'When docs are outdated',
      invocation: { modelInvocable: true, userInvocable: false },
      source: 'runtime',
      provider: 'runtime',
      rank: 7,
      locator: 'dsh-101-curator',
    })
    const loaded = (await provider.get({ locator: 'dsh-101-curator' })) as Record<string, unknown>
    expect(loaded).toMatchObject({
      name: 'dsh-101-curator',
      content: '# Curator\n\nInstructions.',
      invocation: { modelInvocable: true, userInvocable: false },
      source: 'runtime',
      provider: 'runtime',
    })
  })

  it('falls back to manager defaults when the plugin omits the fields', async () => {
    const { engine, skills } = await boot()
    await engine.adoptRaw({
      name: 'plain-skill',
      apply(ctx: { skills: { register(skill: unknown): () => void } }): void {
        ctx.skills.register({
          name: 'plain',
          description: 'Plain skill',
          content: 'Body.',
        })
      },
    } as never, {}, 'plain-skill')
    const provider = skills.providers[0]!
    const list = (await provider.list()) as Array<Record<string, unknown>>
    expect(list[0]).toMatchObject({
      name: 'plain',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'runtime',
      provider: 'managed-plain-skill',
      rank: 0,
      locator: 'plain',
    })
  })
})
