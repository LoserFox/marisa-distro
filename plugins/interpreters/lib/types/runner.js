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
import { spawn } from 'node:child_process';
/** Maximum captured bytes per stream (stdout / stderr). */
const MAX_OUTPUT_BYTES = 1024 * 1024;
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
export function runCode(executable, code, cwd, timeoutMs, signal) {
    return new Promise((resolve) => {
        const start = Date.now();
        if (signal.aborted) {
            resolve({ ok: false, exit_code: -1, stdout: '', stderr: '', duration_ms: 0, timed_out: false, cancelled: true });
            return;
        }
        let child;
        try {
            child = spawn(executable, ['-'], { cwd, windowsHide: true });
        }
        catch (error) {
            resolve({
                ok: false,
                exit_code: -1,
                stdout: '',
                stderr: `Failed to spawn "${executable}": ${String(error)}`,
                duration_ms: Date.now() - start,
                timed_out: false,
                cancelled: false,
            });
            return;
        }
        let stdout = '';
        let stderr = '';
        let stdoutCapped = false;
        let stderrCapped = false;
        let timedOut = false;
        const append = (buf, target) => {
            const str = buf.toString('utf8');
            if (target === 'stdout') {
                if (stdout.length + str.length > MAX_OUTPUT_BYTES && !stdoutCapped) {
                    stdout += str.slice(0, MAX_OUTPUT_BYTES - stdout.length);
                    stdoutCapped = true;
                }
                else if (!stdoutCapped) {
                    stdout += str;
                }
            }
            else {
                if (stderr.length + str.length > MAX_OUTPUT_BYTES && !stderrCapped) {
                    stderr += str.slice(0, MAX_OUTPUT_BYTES - stderr.length);
                    stderrCapped = true;
                }
                else if (!stderrCapped) {
                    stderr += str;
                }
            }
        };
        child.stdout?.on('data', (d) => append(d, 'stdout'));
        child.stderr?.on('data', (d) => append(d, 'stderr'));
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);
        const onAbort = () => {
            clearTimeout(timer);
            child.kill('SIGKILL');
        };
        signal.addEventListener('abort', onAbort, { once: true });
        const finish = (exitCode) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            if (stdoutCapped)
                stdout += '\n[stdout truncated at 1 MB]';
            if (stderrCapped)
                stderr += '\n[stderr truncated at 1 MB]';
            resolve({
                ok: exitCode === 0 && !timedOut && !signal.aborted,
                exit_code: exitCode ?? -1,
                stdout,
                stderr,
                duration_ms: Date.now() - start,
                timed_out: timedOut,
                cancelled: signal.aborted,
            });
        };
        child.on('error', (error) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            resolve({
                ok: false,
                exit_code: -1,
                stdout,
                stderr: stderr + (stderr !== '' ? '\n' : '') + String(error),
                duration_ms: Date.now() - start,
                timed_out: false,
                cancelled: signal.aborted,
            });
        });
        child.on('close', (code) => finish(code));
        child.stdin?.on('error', () => { });
        child.stdin?.write(code, 'utf8');
        child.stdin?.end();
    });
}
