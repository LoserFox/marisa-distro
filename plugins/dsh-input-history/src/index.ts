/**
 * dsh-input-history host half: no server-side behavior — the input-history
 * keyboard capture lives entirely in the browser bundle (exports["./client"]).
 * The host half exists so the manifest has a node entry and a home for the
 * invariant companion; keep it a registration shell.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name (matches the manifest id). */
export const name = '@dsh-external/dsh-input-history'

/**
 * Browser-only behavior; the host half is an empty registration shell.
 * @param _ctx - host root context (unused).
 */
export function apply(_ctx: Context): void {}
