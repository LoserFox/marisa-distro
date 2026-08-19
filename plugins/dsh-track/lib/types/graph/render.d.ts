/**
 * M1 — textual tree renderer for a SessionGraph (the track_session_graph
 * tool's output). Indented session→turn→step→tool tree, citations on every
 * line, error flags on tool calls.
 * @module @fakechris/dsh-track/graph/render
 */
import type { SessionGraph } from '../types.ts';
/**
 * Render a session's execution graph as an indented text tree.
 * Display tree: session → turns → (steps → tools | assistant replies | the
 * user requests that provoked each turn). Every line carries its seq citation
 * — the jump-back pointer into the raw session log.
 */
export declare function renderGraphText(g: SessionGraph): string;
/** One-line summary of a session graph (status output). */
export declare function renderGraphSummary(g: SessionGraph): string;
