/** Inputs of one upload: the session scope plus the request body stream. */
export interface WorkspaceUploadInput {
    /** The session workspace root; target and directory must stay inside it. */
    cwd: string;
    /** Absolute upload directory chosen by the client (inside `cwd`). */
    dir: string;
    /** Relative path below `dir` (absolute paths, '.', '..' and empty segments refused). */
    relativePath: string;
    /** The request body stream (raw bytes). */
    chunks: AsyncIterable<string | Uint8Array>;
    /** Byte cap; an oversized upload is refused without touching the target. */
    limit: number;
}
/**
 * Stream `chunks` into `dir/relativePath` atomically: a uniquely named temp
 * sibling receives the bytes, then is renamed over the target. The parent
 * directory is created on demand (recursive), so folder uploads work before
 * any level exists. The unique temp name keeps concurrent uploads to the same
 * target independent (each writes and renames its own file; the last rename
 * wins) and never blocks later uploads after a crashed process.
 *
 * @throws SidebarError with a wire code for containment, shape, and size
 * failures; the temp file is always removed on failure.
 */
export declare function writeWorkspaceUpload(input: WorkspaceUploadInput): Promise<{
    path: string;
    size: number;
}>;
