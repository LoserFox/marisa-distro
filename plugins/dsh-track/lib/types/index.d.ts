/**
 * Track Bridge — embedded task-management engine for DeepSeek Harness.
 *
 * The model-facing tools (capture_thought, report_decision_point, track_*)
 * are the ONLY entry points to the store; the model never touches storage or
 * session events directly (storage is host-side; cross-session reads are
 * cwd-fenced for the model). This plugin is the thin data face: it owns the
 * KV store, subscribes to session events, and registers the tools the fat
 * skill (skills/dsh-track/SKILL.md) instructs the model to call.
 *
 * Registrations are effects: unloading the plugin disposes tools and store.
 * @module @fakechris/dsh-track
 */
import type { Context } from '@deepseek-ai/cordis';
import { TrackStore } from './store.ts';
import type { Decision } from './types.ts';
import { type CaptureSignalsConfig } from './capture/observe.ts';
export declare const name = "@fakechris/dsh-track";
export declare const inject: string[];
/** Track Bridge plugin configuration. */
export interface Config {
    /** Workspace / team key used for Linear-style identifiers (default INV). */
    teamKey?: string;
    /** Auto-capture signal mask — which structured signals produce captures.
     *  Default: every signal on (todo / goal / delegate / requirement). */
    captureSignals?: CaptureSignalsConfig;
    /** G2 requirement-capture thresholds: minChars (below = terse ask, skipped)
     *  and maxChars (truncation bound). Defaults 40 / 500. */
    requirementCapture?: {
        minChars?: number;
        maxChars?: number;
    };
}
/** Default team key when config omits it. */
export declare const DEFAULT_TEAM_KEY = "INV";
/** Lifecycle sweep cadence: re-evaluate in_progress issues this often (6h). */
export declare const SWEEP_INTERVAL_MS: number;
export declare const store: TrackStore;
export declare function apply(ctx: Context, config?: Config): void;
export { store as trackStore };
/**
 * Render a raised decision as the tool result — the first line carries the
 * stable decision id that anchors the record in the conversation transcript
 * (the KV record is the source of truth; this text is the pointer).
 */
export declare function formatDecisionRaised(decision: Decision): string;
