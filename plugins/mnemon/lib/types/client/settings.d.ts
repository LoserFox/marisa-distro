import { type ClientConnectionHandle, type ClientSettingsScope, type ClientSettingsSnapshot, type SettingsOperation } from '../shared/contracts.ts';
export declare class MnemonSettingsScope<T extends object> implements ClientSettingsScope<T> {
    private readonly connection;
    private readonly namespace;
    private readonly requestTimeoutMs;
    private snapshot;
    private readonly listeners;
    private tail;
    constructor(connection: ClientConnectionHandle, namespace?: string, requestTimeoutMs?: number);
    getSnapshot: () => ClientSettingsSnapshot<T>;
    subscribe: (listener: () => void) => (() => void);
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
    /** Set a nested field. */
    setPath(path: string[], value: unknown): Promise<void>;
    /** Unset a nested field, falling back to its schema default. */
    unsetPath(path: string[]): Promise<void>;
    mutate(ops: SettingsOperation[]): Promise<void>;
    private load;
    private write;
    private call;
    private publish;
}
