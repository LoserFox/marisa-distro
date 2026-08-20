/**
 * uSES bridge: turns any bare observable snapshot source into a typed
 * selector hook. Inlined from dsh-client-ui-renderer/src/client/bind.ts
 * (shell-only glue; business plugins depend on runtime + ui-slots only).
 *
 * @module dsh-interpreters/client/bindSnapshotSelector
 */
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector.js';
/**
 * Bind a bare observable source to a typed uSES selector hook.
 * subscribe/getSnapshot are captured once per source into stable closures
 * (also re-binds `this` for method-based sources), so components never
 * resubscribe across renders. Equality defaults to Object.is.
 * @param w - snapshot source (engine store, Session object, store instance).
 * @returns the selector hook.
 */
export function bindSnapshotSelector(w) {
    const subscribe = (fn) => w.subscribe(fn);
    const getSnapshot = () => w.getSnapshot();
    return function useSelector(sel, eq) {
        return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, sel, eq);
    };
}
