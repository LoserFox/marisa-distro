/**
 * M1 — deterministic event-graph builder: one session's raw log becomes a
 * session->turn->step->tool execution tree with seq citations.
 *
 * Pure function over the raw SessionEvent[] (the same view sync/raw-event.ts
 * reads): identical (session, log) always yields an identical graph — same
 * node/edge ids, same citations — so rebuilds are idempotent. LLM-free:
 * every edge is a structural fact of the log, which is what makes the graph
 * trustworthy as the genealogy layer's floor (docs/genealogy-vision.md §4).
 * @module @fakechris/dsh-track/graph/build
 */
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import type { SessionGraph } from '../types.ts';
/** Deterministic node id — stable across rebuilds of the same log. */
export declare function graphNodeId(sessionId: string, kind: string, key: string, extra?: string): string;
/** Deterministic edge id — (kind, from, to) only, so the same logical edge
 *  dedupes across rebuilds regardless of the seq it was first seen at. */
export declare function graphEdgeId(sessionId: string, kind: string, fromId: string, toId: string): string;
/** Builder schema version — bump on shape changes; stored graphs older than
 *  this are stale and get rebuilt (service freshness check). */
export declare const GRAPH_VERSION = 6;
/**
 * Build the execution graph of one session from its raw log.
 * @param sessionId session id (also the graph record key).
 * @param events raw events (a header line with no seq is skipped here).
 * @param header optional session header — facts on the session root node.
 * @param now build timestamp (injectable so tests are deterministic).
 */
export declare function buildSessionGraph(sessionId: string, events: readonly SessionEvent[], header?: SessionHeader, now?: number): SessionGraph;
