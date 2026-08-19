/**
 * Compile-time boundary against the public DSH browser contracts.
 *
 * Keep version-sensitive declaration merging in one place so a future DSH
 * upgrade fails here instead of being papered over by local copies of slots.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { MnemonKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        mnemon: MnemonKey;
    }
}
/** DSH 0.1.0-rc.6 client context plus the two injected feature services. */
export type MnemonClientContext = ClientContext & {
    connection: ConnectionHandle;
    locale: LocaleRuntime;
};
