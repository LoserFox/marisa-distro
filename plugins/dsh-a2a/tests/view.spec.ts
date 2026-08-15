/**
 * Connection-graph projection of mesh peers.
 */

import { describe, expect, it } from 'vitest'
import { peerView } from '../src/view.ts'
import type { A2aPeer } from '../src/hub/types.ts'

function peer(overrides: Partial<A2aPeer> = {}): A2aPeer {
  return {
    name: 'web',
    presenceId: 'presence-web',
    ...overrides,
  }
}

describe('peerView', () => {
  it('projects a live peer with its presence id, project, and activity', () => {
    expect(peerView(peer(), 'demo', 'working')).toEqual({
      id: 'presence-web',
      name: 'web',
      transport: 'hub',
      target: 'demo',
      status: 'online',
      activity: 'working',
    })
  })
})
