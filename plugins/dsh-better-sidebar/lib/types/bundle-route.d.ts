import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from './context-types.ts';
/** The chunk names the client may request (mirror of src/client/chunk-loader.ts). */
export declare const CHUNK_NAMES: readonly ["docx", "xlsx", "pptx", "terminal", "editor"];
export type ChunkName = (typeof CHUNK_NAMES)[number];
/**
 * Build the /sidebar/bundle route handler. `fence` is the shared browser-
 * trust check every /sidebar route applies; `chunkDir` is the directory the
 * chunk scripts live in (overridable for tests).
 */
export declare function createBundleRouteHandler(fence: (req: IncomingMessage) => boolean, chunkDir?: string): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
/** Register the /sidebar/bundle route (disposed with the fiber). */
export declare function registerBundleRoute(ctx: Context, fence: (req: IncomingMessage) => boolean): () => void;
