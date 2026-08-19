/**
 * M7 — Evolution Brief: deterministic project-intent summary + gap detection.
 * Aggregates the store (issues, decisions, commits, links, sessions) into a
 * compact brief for planning. Zero LLM — every line is store fact; gaps are
 * 'proposed' findings (never auto-confirmed, per the research invariants).
 * @module @fakechris/dsh-track/graph/brief
 */
import type { TrackStore } from '../store.ts';
import type { Issue } from '../types.ts';
export interface BriefIssue {
    id: string;
    identifier: string;
    title: string;
    state: Issue['state'];
    semanticKind?: string;
    projectId?: string;
    lastProgressAt?: number;
}
export type BriefGapType = 'no-artifact' | 'done-without-commit' | 'in-progress-stale' | 'unresolved-question';
export interface BriefGap {
    type: BriefGapType;
    issue?: BriefIssue;
    decisionId?: string;
    question?: string;
    detail: string;
}
export interface EvolutionBrief {
    project?: {
        id: string;
        name: string;
        path: string;
        repoUrl?: string;
        sessionCount: number;
        issueCount: number;
    };
    issues: {
        total: number;
        byState: Record<string, number>;
        bySemantic: Record<string, number>;
        recent: BriefIssue[];
    };
    openDecisions: Array<{
        id: string;
        question: string;
        createdAt: string;
    }>;
    recentCommits: Array<{
        sha: string;
        subject: string;
        authorAt: number;
    }>;
    superseded: Array<{
        newer: string;
        older: string;
    }>;
    gaps: BriefGap[];
    generatedAt: string;
}
/** Stale window for in_progress issues with no recent evidence. */
export declare const STALE_MS: number;
/**
 * Build the evolution brief for one project (or the whole store).
 * @param store track store.
 * @param projectId optional project filter (issue.projectId).
 * @param now injectable clock for deterministic tests.
 */
export declare function buildEvolutionBrief(store: TrackStore, projectId?: string, now?: number): Promise<EvolutionBrief>;
