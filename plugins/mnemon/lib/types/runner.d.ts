import type { JsonValue } from './contracts.ts';
import type { ResolvedConfig } from './config.ts';
import { type ProcessRunner } from './process.ts';
export interface CommandDiscoveryOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
    isExecutable?: (path: string) => boolean;
}
/** Locate the local Mnemon binary without invoking a shell. */
export declare function findMnemonCommand(config: Pick<ResolvedConfig, 'cliPath'>, options?: CommandDiscoveryOptions): string | undefined;
export declare class MnemonCliError extends Error {
    readonly exitCode: number | null;
    readonly stderr: string;
    constructor(message: string, exitCode?: number | null, stderr?: string);
}
export interface MnemonRunOptions {
    signal?: AbortSignal;
    globalFlags?: boolean;
    store?: string;
}
export interface MnemonTextCommand {
    args: readonly string[];
    options?: MnemonRunOptions;
}
export interface MnemonRunner {
    readonly command: string;
    readonly commandFound: boolean;
    readonly config: ResolvedConfig;
    runJson(args: readonly string[], options?: MnemonRunOptions): Promise<JsonValue>;
    runText(args: readonly string[], options?: MnemonRunOptions): Promise<string>;
    /** Run related CLI commands consecutively without allowing queued work between them. */
    runTextBatch(commands: readonly MnemonTextCommand[]): Promise<string[]>;
    /** Run one operation after all CLI work and hold the same queue until it settles. */
    withExclusive<T>(operation: () => T | Promise<T>): Promise<T>;
    effectiveDataDir(): string;
    /** Read Mnemon's persisted active-file selection, ignoring config and environment overrides. */
    persistedStore(): string;
    effectiveStore(): string;
}
export declare function createRunner(config: ResolvedConfig, processRunner?: ProcessRunner, workspaceRoot?: string): MnemonRunner;
