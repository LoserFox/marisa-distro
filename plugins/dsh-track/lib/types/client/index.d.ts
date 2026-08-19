/**
 * Track Bridge client plugin — browser half.
 *
 * Visible surfaces:
 * 1. A sidebar entry row ("Track") injected below New Session — the
 *    primary entry point (sidebar slots are single-occupant; DOM injection
 *    is the task-board precedent).
 * 2. A center-column panel (capture wall + pending decisions + issues)
 *    toggled by the entry, fed by the host HTTP API (/api/track/*).
 * 3. A composer-dock strip showing pending counts.
 * @module @fakechris/dsh-track/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { TrackStripProps } from './strip-contract.ts';
export type { TrackKey } from './locales.ts';
/** Required services: slot registration, locale dictionaries, and the
 *  sessions face (the right-panel jump-back links call ctx.sessions.open /
 *  binding — cordis property access requires the service declared). */
export declare const inject: string[];
/**
 * Client plugin body: sidebar entry + center panel + composer strip.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
