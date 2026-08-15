/**
 * runner.ts — subprocess execution for `run_python` / `run_node` tools.
 *
 * Spawns the interpreter with `-` (read code from stdin), writes the code
 * to stdin, and collects stdout/stderr with a 1 MB cap per stream.
 * Honours `AbortSignal` and a timeout — both kill the process and report
 * the outcome in the canonical result (C5: non-ideal states are values,
 * not thrown errors).
 *
 * @module dsh-interpreters/runner
 */
export interface RunResult {
    ok: boolean;
    exit_code: number;
    stdout: string;
    stderr: string;
    duration_ms: number;
    timed_out: boolean;
    cancelled: boolean;
}
/**
 * Execute `code` by piping it into `executable -` (stdin).
 *
 * @param executable - interpreter path (e.g. `python`, `node`, or an absolute path).
 * @param code - source code to pipe via stdin.
 * @param cwd - optional working directory.
 * @param timeoutMs - wall-clock budget; the process is killed with SIGKILL on expiry.
 * @param signal - caller-owned abort signal; aborting kills the process.
 * @returns a {@link RunResult} describing the outcome.
 */
export declare function runCode(executable: string, code: string, cwd: string | undefined, timeoutMs: number, signal: AbortSignal): Promise<RunResult>;
