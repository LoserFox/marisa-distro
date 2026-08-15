/**
 * tools.ts — `run_python` and `run_node` model-facing tools.
 *
 * Conventions (per plugin-development-guide.md §3):
 *   C4 — execute returns a canonical JSON value; render is a separate pure projection.
 *   C5 — timeout and cancellation are non-ideal business outcomes, represented in
 *        the value (timed_out / cancelled) rather than thrown.
 *   C6 — exec.signal is forwarded to the subprocess via runCode().
 *   C10 — no UI-specific formats in the canonical value.
 *
 * The tool `description` is computed from the resolved config at registration
 * time so the model sees the interpreter path. Settings changes dispose the
 * old registration and re-register with the fresh description (host index.ts).
 *
 * @module dsh-interpreters/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
import { type RunResult } from './runner.js';
export interface RunCodeArgs {
    code: string;
    cwd?: string;
}
/**
 * Build the model-visible description for `run_python`, embedding the
 * configured interpreter path so the model knows exactly which executable
 * will be invoked.
 */
export declare function buildPythonDescription(cfg: ResolvedConfig): string;
/**
 * Build the model-visible description for `run_node`, embedding the
 * configured interpreter path.
 */
export declare function buildNodeDescription(cfg: ResolvedConfig): string;
export declare function renderRunCodeOutput(value: RunResult): string;
/**
 * Register `run_python` and `run_node` tools with descriptions that embed
 * the interpreter paths from `cfg`. Returns a disposer that unregisters
 * both tools — call it before re-registering with a fresh config.
 */
export declare function registerTools(ctx: Context, cfg: ResolvedConfig): () => void;
