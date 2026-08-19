import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Interactive project graph for the 会话结构图 tab — react-force-graph-2d
 * (the same library obsidian-vault-pipeline uses): real pan / zoom / node
 * drag / hover / click-to-jump, replacing the static force SVG.
 * @module @fakechris/dsh-track/client/graph-force
 */
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ForceGraph2D from 'react-force-graph-2d';
const NODE_COLOR = { session: '#4c8dff', issue: '#1a7f37', commit: '#8a8f98', decision: '#e8853c' };
const EDGE_COLOR = { 'forked-from': '#4c8dff', 'executed-in': '#2f9e44', landed: '#adb5bd', implements: '#40c057', 'raised-in': '#e8853c' };
function GraphForceView(props) {
    const gd = useMemo(() => ({
        nodes: props.data.nodes.map((n) => ({ ...n, color: NODE_COLOR[n.kind] ?? '#999' })),
        links: props.data.edges.map((e) => ({ source: e.from, target: e.to, color: EDGE_COLOR[e.kind] ?? '#bbb' })),
    }), [props.data]);
    return (_jsx(ForceGraph2D, { graphData: gd, nodeLabel: (n) => n.label ?? '', nodeColor: (n) => n.color ?? '#999', linkColor: (l) => l.color ?? '#bbb', linkDirectionalArrowLength: 4, linkDirectionalArrowRelPos: 1, nodeRelSize: 5, cooldownTicks: 150, onNodeClick: (n) => { const node = n; props.onNodeClick(node); }, onNodeHover: (n) => {
            const canvas = document.querySelector('.inv-graph canvas');
            if (canvas !== null)
                canvas.style.cursor = n ? 'pointer' : 'default';
        } }));
}
let root = null;
/** Mount (or re-mount) the interactive force graph into a container. */
export function mountGraphForce(container, data, onNodeClick) {
    if (root === null)
        root = createRoot(container);
    root.render(_jsx(GraphForceView, { data: data, onNodeClick: onNodeClick }));
}
