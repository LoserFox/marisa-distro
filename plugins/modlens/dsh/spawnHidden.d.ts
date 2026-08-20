import type { ChildProcess, SpawnOptions } from 'child_process';

/**
 * Starts a child with its console window hidden, whatever the caller asked for
 * (issue #60). `windowsHide` is accepted and ignored rather than refused: the
 * plugin is plain JavaScript, so refusing it in the types would stop nothing,
 * and the wrapper overwrites it either way.
 */
export declare function spawnHidden(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
): ChildProcess;
