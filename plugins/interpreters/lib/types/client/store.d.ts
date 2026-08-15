/**
 * store.ts — the interpreters card's staged form over the
 * `/interpreters/api/get|set` HTTP route.
 *
 * The DSH settings RPC domain only serves allowlisted namespaces to
 * configuration clients, so this store reads and writes the `interpreters`
 * namespace through the plugin's self-hosted HTTP route
 * (`fetch('/interpreters/api/get'|'set')`) instead of the host's typertRemote
 * dispatch. State publishes through a `SnapshotStore` so the card binds a
 * selector hook via `bindSnapshotSelector`; the store tracks load status,
 * the staged draft, and the apply lifecycle (idle/saving/saved/error).
 *
 * @module dsh-interpreters/client/store
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** The persisted shape of the `interpreters` namespace. */
export interface InterpretersSettings {
    pythonPath?: string;
    nodePath?: string;
    timeoutMs?: number;
}
/** Apply lifecycle states (mirrors advisor-store's ApplyState shape). */
export type ApplyState = {
    kind: 'idle';
} | {
    kind: 'saving';
} | {
    kind: 'saved';
} | {
    kind: 'error';
    message: string;
};
/** Card state published through the snapshot store. */
export interface InterpretersCardState {
    /** 'idle' before the first load fires; 'loading' while in flight; 'ready' once seeded. */
    status: 'idle' | 'loading' | 'ready';
    /** False until the first successful load gates `connection/reset` refreshes. */
    loaded: boolean;
    /** False while the namespace is not served to this client; the card renders the unavailable notice. */
    available: boolean;
    /** Whether the Host document accepts writes. */
    writable: boolean;
    /** Staged draft (last-known host config + local edits). */
    draft: InterpretersSettings;
    /** Whether the form holds edits that a save would write. */
    dirty: boolean;
    /** Apply lifecycle. */
    applyState: ApplyState;
}
/** A number field renders empty when the section carries none. */
declare function formatNumber(value: unknown): string;
/** A text field renders the empty string when absent. */
declare function formatText(value: unknown): string;
/**
 * The card's staged form over the interpreters settings.
 *
 * The store publishes through a `SnapshotStore` because slot components read
 * through a snapshot selector; both the HTTP read and the local drafts
 * change underneath, and every projection is rebuilt from the two together.
 */
export declare class InterpretersCardController {
    readonly store: SnapshotStore<InterpretersCardState>;
    /** True after the first successful load; gates `connection/reset` refreshes. */
    loaded: boolean;
    private generation;
    private staged;
    constructor();
    /**
     * Read the resolved config from the Host HTTP route and publish it.
     * @returns settlement after the read.
     */
    load(): Promise<void>;
    /** Stage draft text for one field. */
    edit(field: keyof InterpretersSettings, text: string): void;
    /** Drop every staged edit. */
    discard(): void;
    /** Write every staged edit, then re-seed from what the Host accepted. */
    save(): void;
    private doSave;
    /** The staged edits as one patch (only changed fields). */
    private patchOf;
}
/** Refresh the store only after its first load (background invalidation gate). */
export declare function refreshIfLoaded(controller: InterpretersCardController): void;
/** Format helpers exposed for the card component. */
export declare const formatFieldText: typeof formatText;
export declare const formatFieldNumber: typeof formatNumber;
export {};
