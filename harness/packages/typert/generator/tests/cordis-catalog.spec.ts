import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  projectCordisCatalog,
  renderEvents,
  renderServices,
} from '../src/cordis-catalog.ts'
import { CORDIS_CATALOG_POLICY } from '../../../../scripts/gen-cordis-catalog.ts'

const workspaceRoot = resolve(import.meta.dirname, '../../../..')

describe('Typert-backed Cordis catalog', () => {
  it('reproduces every committed catalog artifact byte for byte', { timeout: 480_000 }, () => {
    const { projector, model } = projectCordisCatalog(workspaceRoot, CORDIS_CATALOG_POLICY)
    const expected = (path: string): string => { return readFileSync(join(workspaceRoot, path), 'utf8') }

    expect(renderEvents([...model.events], CORDIS_CATALOG_POLICY)).toBe(expected('docs/cordis-catalog/events.md'))
    expect(renderServices([...model.services], CORDIS_CATALOG_POLICY)).toBe(expected('docs/cordis-catalog/services.md'))
    expect(projector.renderRuntimeApi(model)).toBe(
      expected('packages/cordis/tool-cordis/src/api-catalog.ts'),
    )
  })
})
