/** Durable per-Session sidecar state for the suggested-replies Web surface. */
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { SuggestedReply } from './types.ts';
/** Session header fields that fence one sidecar row to one log lifecycle. */
export declare const suggestedRepliesSessionIdentitySchema: z.ZodObject<{
    createdAt: z.ZodNumber;
    cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Persisted identity of one exact Session lifecycle. */
export type SuggestedRepliesSessionIdentity = z.infer<typeof suggestedRepliesSessionIdentitySchema>;
/** Runtime schema for one durable suggested-replies row. */
export declare const suggestedRepliesRowSchema: z.ZodObject<{
    session: z.ZodObject<{
        createdAt: z.ZodNumber;
        cwd: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    revision: z.ZodNumber;
    turn: z.ZodNumber;
    phase: z.ZodUnion<readonly [z.ZodLiteral<"generating">, z.ZodLiteral<"ready">, z.ZodLiteral<"cleared">]>;
    suggestions: z.ZodArray<z.ZodString>;
    generationSessionId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One persisted state row owned by this plugin. */
export type SuggestedRepliesRow = z.infer<typeof suggestedRepliesRowSchema>;
/** Plugin-owned state domain; parent Session logs contain no plugin event types. */
export declare const suggestedRepliesStateDomainSpec: {
    name: string;
    version: number;
    tables: {
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<SessionId, {
            session: {
                createdAt: number;
                cwd?: string | undefined;
            };
            revision: number;
            turn: number;
            phase: "generating" | "ready" | "cleared";
            suggestions: string[];
            generationSessionId?: string | undefined;
        }>;
    };
};
/** Client-facing state snapshot. */
export interface SuggestedRepliesStateSnapshot {
    /** Header identity of the Session lifecycle represented by this snapshot. */
    readonly lifecycle: SuggestedRepliesSessionIdentity;
    /** Monotonic revision within the current Session lifecycle. */
    readonly revision: number;
    /** Completed parent turn, or null before this lifecycle has stored state. */
    readonly turn: number | null;
    /** Current UI phase. */
    readonly phase: 'generating' | 'ready' | 'cleared';
    /** Ready candidates; empty in every other phase. */
    readonly suggestions: readonly SuggestedReply[];
}
type CurrentPredicate = () => boolean;
/** Owns the storage-domain handle, serialized row mutations, and RPC waiters. */
export declare class SuggestedRepliesStateStore {
    private readonly ctx;
    private readonly table;
    private readonly domain;
    private readonly operationTails;
    private readonly waiters;
    private readonly lifecycle;
    private closing;
    private closeTask;
    /** Open the plugin domain through the official storage-domain facility. */
    static open(ctx: Context): Promise<SuggestedRepliesStateStore>;
    /** Construct around one owned table; public for focused storage tests. */
    constructor(ctx: Context, table: KvTable<SessionId, SuggestedRepliesRow>, domain: Pick<Domain<typeof suggestedRepliesStateDomainSpec>, 'close'>);
    /** Read state only when the sidecar identity matches the addressed Session. */
    get(sessionId: SessionId, signal?: AbortSignal): Promise<SuggestedRepliesStateSnapshot>;
    /** Wait until the Session state revision differs, or until the request is aborted. */
    watch(sessionId: SessionId, observedLifecycle: SuggestedRepliesSessionIdentity, observedRevision: number, signal: AbortSignal): Promise<SuggestedRepliesStateSnapshot>;
    /** Publish loading state after the parent turn is durably checkpointed. */
    setGenerating(session: Session, turn: number, generationSessionId: SessionId, isCurrent: CurrentPredicate): Promise<boolean>;
    /** Commit candidates only over the exact generation row that produced them. */
    setReady(session: Session, turn: number, generationSessionId: SessionId, suggestions: readonly SuggestedReply[], isCurrent: CurrentPredicate): Promise<boolean>;
    /** Clear one current row, optionally checkpointing a new parent Session fact first. */
    clear(session: Session, flushSession: boolean): Promise<boolean>;
    /** Clear only if no newer generation has replaced the expected row. */
    clearGeneration(session: Session, generationSessionId: SessionId): Promise<boolean>;
    /** Clear every stored non-cleared row after a global disable or plugin unload. */
    clearAll(): Promise<void>;
    /** Replace crash-orphaned loading rows before the RPC surface becomes available. */
    clearInterruptedGenerations(): Promise<void>;
    /** Reject new operations, wake long polls, drain writes, and release the domain. */
    close(): Promise<void>;
    private currentRow;
    private inspectHeader;
    private ensureSessionDurable;
    private put;
    private enqueue;
}
export {};
