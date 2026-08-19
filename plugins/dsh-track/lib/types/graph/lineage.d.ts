/**
 * M5 — lineage view: from any semantic entity (issue / decision / capture /
 * commit / project / session), resolve the local graph neighborhood — the
 * 'why does this exist, from which utterances, what superseded it, where did
 * it land' narrow chain. Deterministic: reads the store tables + graph docs,
 * no LLM. The first Lens per both research reports (Why/lineage before any
 * global force graph).
 * @module @fakechris/dsh-track/graph/lineage
 */
import type { TrackStore } from '../store.ts';
/** One resolved neighbor node (lightweight title/kind view). */
export interface LineageNode {
    id: string;
    kind: 'issue' | 'decision' | 'capture' | 'commit' | 'project' | 'session' | 'epic';
    title: string;
    meta?: Record<string, string | undefined>;
}
/** One edge touching the target (both directions, with provenance). */
export interface LineageEdge {
    kind: string;
    fromId: string;
    toId: string;
    linkMethod?: string;
    eventTime?: number;
    direction: 'out' | 'in';
}
/** One evidence span resolved against the stored graph (user messages in range). */
export interface LineageEvidence {
    sessionId: string;
    seqStart: number;
    seqEnd: number;
    kind: string;
    promptMessageId?: string;
    userMessages: Array<{
        messageId?: string;
        title: string;
        seqStart: number;
        seqEnd: number;
    }>;
}
export interface LineageView {
    target: LineageNode & {
        state?: string;
        origin?: string;
    };
    edges: LineageEdge[];
    neighbors: Record<string, LineageNode>;
    evidence: LineageEvidence[];
    commits: Array<{
        id: string;
        sha: string;
        subject: string;
        authorAt: number;
    }>;
}
/** Resolve one entity id into its node view (auto-detects the table). */
export declare function resolveNode(store: TrackStore, id: string, kindHint?: 'issue' | 'decision' | 'capture' | 'commit' | 'project' | 'session' | 'epic'): Promise<LineageNode | null>;
/**
 * Build the lineage view of one entity: neighbors via links, evidence spans
 * resolved against graphs, implementing commits. Returns null for unknown ids.
 */
export declare function buildLineage(store: TrackStore, entity: string): Promise<LineageView | null>;
