/**
 * M3 — git artifact scan: read a project's commit log, persist commits, and
 * align them with sessions (activity time window → landed-in) and issues
 * (title token overlap + session-window → implements). The git runner is
 * injected so tests never exec git; production uses execFileSync.
 *
 * P1/P2 (2026-08-18, aligned with Better Harness evidence discipline):
 * - explicit channel first: typed commit-body trailers (`Track-Issue:`,
 *   `Harness-Session:`) produce `declared` links with confidence 1.0 —
 *   the only provenance-grade relation;
 * - heuristics (time window, title overlap) are always labeled `candidate`
 *   with a fixed limitation string — never promoted to observed/declared;
 * - correlation uses COMMITTER time (`%cI`), author time stays display-only;
 * - every fresh implements link records a `commit-observed` lifecycle signal
 *   so the state machine's done proposal is Output-gated (P0).
 * @module @fakechris/dsh-track/graph/commits
 */
import type { TrackStore } from '../store.ts';
import type { CommitArtifact } from '../types.ts';
/** Git command runner — injectable (tests use a fake; prod execs git). */
export type GitRunner = (args: string[]) => string;
export declare const defaultGitRunner: GitRunner;
export interface CommitScanResult {
    commits: number;
    sessionsLinked: number;
    issuesLinked: number;
    byKind: Record<string, number>;
    /** Issues that received a fresh commit-observed lifecycle signal (P0). */
    commitSignals: number;
    error?: string;
}
/** Grace added to a session's last-activity window when matching commits. */
export declare const SESSION_GRACE_MS: number;
/** Title-overlap threshold for issue → commit implements links. */
export declare const IMPLEMENTS_OVERLAP = 0.5;
/** Typed trailers recognized as an explicit commit→session/issue channel (P2). */
export declare const TRAILER_ISSUE = "Track-Issue";
export declare const TRAILER_SESSION = "Harness-Session";
export declare function commitIdFor(sha: string): string;
/**
 * Parse typed trailers out of a commit body: lines like
 * `Track-Issue: INV-12` / `Harness-Session: c-sess-1` at any position.
 */
export declare function parseTrailers(body: string): Array<{
    key: string;
    value: string;
}>;
/**
 * Parse `git log -z --format=%H%x00%aI%x00%cI%x00%s%x00%b` output into commit
 * artifacts. `-z` NUL-terminates each record, so multi-line bodies survive;
 * every record is exactly 5 NUL-fields (sha, author, committer, subject,
 * body) plus the `-z` terminator NUL. Malformed records are dropped.
 */
export declare function parseCommitLines(raw: string, repo: string): CommitArtifact[];
/**
 * Scan one project repo: persist commits, then align with sessions (time
 * window) and issues (title overlap / session window), explicit trailer
 * links first. Idempotent: commit ids and link ids are deterministic hashes.
 * @param store track store.
 * @param cwd repo working directory.
 * @param opts dryRun previews counts without writing; limit caps the log;
 *        runGit injects the git runner (default execs git); now injects the
 *        clock for the P0 freshness window (tests use fixture times).
 */
export declare function scanProjectCommits(store: TrackStore, cwd: string, opts?: {
    dryRun?: boolean;
    limit?: number;
    runGit?: GitRunner;
    now?: number;
}): Promise<CommitScanResult>;
