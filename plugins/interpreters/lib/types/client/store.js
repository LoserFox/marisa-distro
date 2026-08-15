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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Initial empty state. */
function initialState() {
    return {
        status: 'idle',
        loaded: false,
        available: false,
        writable: false,
        draft: {},
        dirty: false,
        applyState: { kind: 'idle' },
    };
}
/** A number field renders empty when the section carries none. */
function formatNumber(value) {
    return typeof value === 'number' ? String(value) : '';
}
/** A text field renders the empty string when absent. */
function formatText(value) {
    return typeof value === 'string' ? value : '';
}
/**
 * The card's staged form over the interpreters settings.
 *
 * The store publishes through a `SnapshotStore` because slot components read
 * through a snapshot selector; both the HTTP read and the local drafts
 * change underneath, and every projection is rebuilt from the two together.
 */
export class InterpretersCardController {
    store;
    /** True after the first successful load; gates `connection/reset` refreshes. */
    loaded = false;
    generation = 0;
    staged = new Map();
    constructor() {
        this.store = createSnapshotStore(initialState());
        void this.load();
    }
    /**
     * Read the resolved config from the Host HTTP route and publish it.
     * @returns settlement after the read.
     */
    async load() {
        const gen = ++this.generation;
        this.store.update((s) => { s.status = 'loading'; });
        let config;
        try {
            const response = await fetch('/interpreters/api/get', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            if (response.ok) {
                const parsed = await response.json().catch(() => null);
                if (parsed?.ok === true && parsed.value !== undefined) {
                    config = parsed.value.config;
                }
            }
        }
        catch {
            // Channel unreachable: leave the card unavailable; not a hard error.
        }
        if (gen !== this.generation)
            return;
        if (config === undefined) {
            this.store.update((s) => {
                s.status = 'ready';
                s.available = false;
                s.writable = false;
            });
            return;
        }
        this.loaded = true;
        this.staged.clear();
        this.store.update((s) => {
            s.status = 'ready';
            s.available = true;
            s.writable = true;
            s.draft = { ...config };
            s.dirty = false;
            s.applyState = { kind: 'idle' };
        });
    }
    /** Stage draft text for one field. */
    edit(field, text) {
        this.staged.set(field, text);
        this.store.update((s) => {
            s.draft = { ...s.draft, [field]: text };
            s.dirty = true;
            s.applyState = { kind: 'idle' };
        });
    }
    /** Drop every staged edit. */
    discard() {
        if (this.staged.size === 0) {
            this.store.update((s) => { s.applyState = { kind: 'idle' }; });
            return;
        }
        this.staged.clear();
        // Re-seed draft from the last-known host config (drop local edits).
        void this.load();
    }
    /** Write every staged edit, then re-seed from what the Host accepted. */
    save() {
        void this.doSave();
    }
    async doSave() {
        const gen = ++this.generation;
        const patch = this.patchOf();
        if (Object.keys(patch).length === 0) {
            this.staged.clear();
            this.store.update((s) => { s.dirty = false; s.applyState = { kind: 'idle' }; });
            return;
        }
        this.store.update((s) => { s.applyState = { kind: 'saving' }; });
        try {
            const response = await fetch('/interpreters/api/set', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ patch }),
            });
            if (gen !== this.generation)
                return;
            if (!response.ok) {
                const parsed = await response.json().catch(() => null);
                const message = parsed?.error?.message ?? `HTTP ${response.status}`;
                this.store.update((s) => { s.applyState = { kind: 'error', message }; });
                return;
            }
            const parsed = await response.json().catch(() => null);
            if (parsed?.ok !== true || parsed.value === undefined) {
                const message = parsed?.error?.message ?? 'unknown error';
                this.store.update((s) => { s.applyState = { kind: 'error', message }; });
                return;
            }
            const next = parsed.value.config;
            this.staged.clear();
            this.store.update((s) => {
                s.draft = { ...next };
                s.dirty = false;
                s.applyState = { kind: 'saved' };
            });
        }
        catch (error) {
            if (gen !== this.generation)
                return;
            this.store.update((s) => {
                s.applyState = { kind: 'error', message: error instanceof Error ? error.message : String(error) };
            });
        }
    }
    /** The staged edits as one patch (only changed fields). */
    patchOf() {
        const patch = {};
        for (const [field, text] of this.staged) {
            const value = parseField(field, text);
            if (value === undefined)
                continue;
            patch[field] = value;
        }
        return patch;
    }
}
/** Parse one field's draft text into a stored value; the empty string clears. */
function parseField(field, text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return '';
    if (field === 'timeoutMs') {
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return trimmed;
}
/** Refresh the store only after its first load (background invalidation gate). */
export function refreshIfLoaded(controller) {
    if (controller.loaded)
        void controller.load();
}
/** Format helpers exposed for the card component. */
export const formatFieldText = formatText;
export const formatFieldNumber = formatNumber;
