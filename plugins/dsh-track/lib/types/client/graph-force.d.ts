/**
 * Interactive project graph for the 会话结构图 tab — react-force-graph-2d
 * (the same library obsidian-vault-pipeline uses): real pan / zoom / node
 * drag / hover / click-to-jump, replacing the static force SVG.
 * @module @fakechris/dsh-track/client/graph-force
 */
export interface GFNode {
    id: string;
    kind: string;
    label: string;
    sessionId?: string;
    messageId?: string;
}
export interface GFEdge {
    from: string;
    to: string;
    kind: string;
}
export interface GFData {
    nodes: GFNode[];
    edges: GFEdge[];
}
/** Mount (or re-mount) the interactive force graph into a container. */
export declare function mountGraphForce(container: HTMLElement, data: GFData, onNodeClick: (n: GFNode) => void): void;
