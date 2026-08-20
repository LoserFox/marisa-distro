/** One explorer row. */
export interface SidebarFsEntry {
    name: string;
    path: string;
    isDir: boolean;
    hidden: boolean;
    /** Whether the row is a symlink; `isDir` then describes the link's target. */
    isSymlink: boolean;
    /** For symlinks: the target is missing or unreadable (stat failed). */
    broken: boolean;
}
/** One listed level. */
export interface SidebarFsListing {
    path: string;
    entries: SidebarFsEntry[];
    truncated: boolean;
}
/** Directory-first, case-insensitive name ordering (VSCode explorer order). */
export declare function compareEntries(a: SidebarFsEntry, b: SidebarFsEntry): number;
/**
 * List one directory level.
 * @param path - absolute directory path.
 * @param maxEntries - row bound of one level (extra rows flag `truncated`).
 * @returns the sorted listing.
 * @throws {SidebarError} fs-error when the level is unreadable or not a directory.
 */
export declare function listDirectory(path: string, maxEntries?: number): Promise<SidebarFsListing>;
/** The root row label of a listing: the last path segment (or the full path at the filesystem root). */
export declare function rootLabel(path: string): string;
/** Parent of a path, or undefined at the filesystem root (the explorer's "up" target). */
export declare function parentOf(path: string): string | undefined;
/**
 * Normalize a caller-supplied path to an absolute, resolved path or throw
 * fs-error. `path.isAbsolute()` is the OS's own notion of absolute: POSIX
 * roots (`/...`), Windows drive letters (`C:\...`) and — on win32 — UNC
 * network shares (`\\server\share\...`); drive-relative forms (`C:foo`)
 * stay rejected.
 */
export declare function requireAbsolute(path: string): string;
/**
 * Whether `target` lies under `base` (or equals it), tolerant of separator
 * style and — on Windows, where the filesystem is case-insensitive — of
 * letter case. The media route uses this instead of a raw `startsWith` so a
 * case-mismatched or mixed-separator path can never be misclassified
 * (e.g. `C:\Users\Me` vs `c:/users/me/file.png`).
 * @param platform - filesystem semantics; injectable so both branches are
 * unit-testable on any host.
 */
export declare function isWithin(base: string, target: string, platform?: NodeJS.Platform): boolean;
/** Message text of an unknown thrown value. */
export declare function messageOf(error: unknown): string;
