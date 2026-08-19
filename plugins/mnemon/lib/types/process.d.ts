export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
export interface ProcessOptions {
    signal?: AbortSignal | undefined;
    timeoutMs: number;
    maxOutputBytes?: number;
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    label?: string | undefined;
}
export type ProcessRunner = (command: string, args: readonly string[], options: ProcessOptions) => Promise<ProcessResult>;
/** Spawn without a shell, with bounded output and cooperative cancellation. */
export declare const runProcess: ProcessRunner;
