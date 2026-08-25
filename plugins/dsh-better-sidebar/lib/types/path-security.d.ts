/**
 * Resolve an existing workspace path through symlinks and enforce containment.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute path.
 * @returns The canonical absolute path used for the filesystem operation.
 */
export declare function ensureWorkspacePath(cwd: string, target: string): Promise<string>;
/**
 * Validate a write destination, including destinations that do not exist yet.
 * Existing targets are resolved to catch symlinks; missing targets are checked
 * against the nearest existing ancestor before the caller creates or renames.
 * The returned path is rebuilt from that canonical ancestor, so an existing
 * symlink is never left in the path passed to the write operation.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute destination path.
 * @returns A canonical path for an existing target or its nearest existing ancestor.
 */
export declare function ensureWorkspaceWritePath(cwd: string, target: string): Promise<string>;
