/**
 * M2 — project induction: group graph docs by the REPOSITORIES their tool
 * calls actually touched (`header.repos` — resolved at graph build time from
 * file_path / workdir / `git -C` targets), falling back to the workspace cwd
 * when a session touched no repo. A workspace directory like
 * ~/source/dsh/explorer is NOT a project — the user works on dsh-track,
 * dsh-harness-ops, the dsh web harness etc. from inside it, and those repos
 * carry the work.
 *
 * Deterministic: project ids are hashes of the repo URL (or cwd), so re-runs
 * are idempotent. `repoProjectIdFor(url)` is the canonical id for repo-touch
 * projects; `projectIdFor(cwd)` remains for cwd-fallback (tests, commits).
 * @module @fakechris/dsh-track/graph/projects
 */
import { nameOfUrl } from './repos.ts';
import type { TrackStore } from '../store.ts';
export interface ProjectInductionResult {
    projects: number;
    sessionsMapped: number;
    issuesAssigned: number;
}
/** Deterministic project id from a repo origin URL (repo-touch induction). */
export declare function repoProjectIdFor(url: string): string;
/** Deterministic project id from the workspace cwd (cwd-fallback). */
export declare function projectIdFor(cwd: string): string;
/** Parse <path>/.git/config for the origin remote URL (pure fs read). */
export declare function repoUrlOf(cwd: string): string | undefined;
/**
 * Requirement-level project attribution: an issue's project is the repo its
 * own span's tool calls touched (sourceSpan window), NOT the session's first
 * repo. This fixes the extraction defect where every requirement of a
 * multi-repo session collapsed onto repos[0] — the user-visible symptom was
 * 'no requirement ever crosses projects' while 36 sessions touched 2-4 repos.
 *
 * Legacy issues (no sourceSpan) anchor at their k-th user message so the span
 * is recoverable from the graph. Events come from the injected reader.
 */
export declare function attributeIssuesBySpan(store: TrackStore, dryRun?: boolean): Promise<number>;
/**
 * Induct projects from stored graphs and assign issues to them.
 * @param store track store.
 * @param dryRun preview without writing (default false).
 */
export declare function induceProjects(store: TrackStore, dryRun?: boolean, now?: number): Promise<ProjectInductionResult>;
export { nameOfUrl };
