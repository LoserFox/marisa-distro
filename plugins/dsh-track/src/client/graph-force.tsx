/**
 * Interactive project graph for the 会话结构图 tab — react-force-graph-2d
 * (the same library obsidian-vault-pipeline uses): real pan / zoom / node
 * drag / hover / click-to-jump, replacing the static force SVG.
 * @module @fakechris/dsh-track/client/graph-force
 */

import { useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ForceGraph2D from 'react-force-graph-2d'

export interface GFNode {
  id: string
  kind: string
  label: string
  sessionId?: string
  messageId?: string
}

export interface GFEdge { from: string; to: string; kind: string }
export interface GFData { nodes: GFNode[]; edges: GFEdge[] }

const NODE_COLOR: Record<string, string> = { session: '#4c8dff', issue: '#1a7f37', commit: '#8a8f98', decision: '#e8853c' }
const EDGE_COLOR: Record<string, string> = { 'forked-from': '#4c8dff', 'executed-in': '#2f9e44', landed: '#adb5bd', implements: '#40c057', 'raised-in': '#e8853c' }

function GraphForceView(props: { data: GFData; onNodeClick: (n: GFNode) => void }) {
  const gd = useMemo(() => ({
    nodes: props.data.nodes.map((n) => ({ ...n, color: NODE_COLOR[n.kind] ?? '#999' })),
    links: props.data.edges.map((e) => ({ source: e.from, target: e.to, color: EDGE_COLOR[e.kind] ?? '#bbb' })),
  }), [props.data])
  return (
    <ForceGraph2D
      graphData={gd as never}
      nodeLabel={(n: never) => (n as { label?: string }).label ?? ''}
      nodeColor={(n: never) => (n as { color?: string }).color ?? '#999'}
      linkColor={(l: never) => (l as { color?: string }).color ?? '#bbb'}
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      nodeRelSize={5}
      cooldownTicks={150}
      onNodeClick={(n: never) => { const node = n as unknown as GFNode; props.onNodeClick(node) }}
      onNodeHover={(n: never | null) => {
        const canvas = document.querySelector('.inv-graph canvas') as HTMLElement | null
        if (canvas !== null) canvas.style.cursor = n ? 'pointer' : 'default'
      }}
    />
  )
}

let root: Root | null = null

/** Mount (or re-mount) the interactive force graph into a container. */
export function mountGraphForce(container: HTMLElement, data: GFData, onNodeClick: (n: GFNode) => void): void {
  if (root === null) root = createRoot(container)
  root.render(<GraphForceView data={data} onNodeClick={onNodeClick} />)
}
