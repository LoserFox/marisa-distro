/**
 * Track Bridge data shapes — Linear-compatible issue model plus Track's
 * capture/decision/link extensions. KV records keep these exact shapes so a
 * future export to a real Linear-compatible GraphQL service is a straight
 * mapping (see docs/track-bridge-plugin-plan.md).
 * @module @fakechris/dsh-track/types
 */
/** Defaults: 14d auto-cancel grace (“至少两周”), weekly v1 sync capped at 10. */
export const DEFAULT_TRACK_CONFIG = {
    autoCancelPendingDays: 14,
    syncIntervalDays: 7,
    syncMaxSessions: 10,
    syncEngine: 'v1',
    nearDupThreshold: 0.6,
};
/** KV unit descriptor for the track unit. */
export const TRACK_UNIT = {
    name: 'track',
    version: 1,
    tables: ['captures', 'issues', 'epics', 'links', 'decisions', 'audit', 'usage', 'graph', 'projects', 'commits', 'extractions'],
    hasGlobal: true,
};
// No custom session-event declarations: the `track/decision` and
// `track/sync-preview` appends were removed (2026-08-11) because the 20260811
// harness refuses to resume a session carrying an unknown (out-of-repo) event
// type, and neither event was ever consumed by anything.
