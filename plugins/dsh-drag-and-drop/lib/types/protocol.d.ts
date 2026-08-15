import type { DirectoryContentSample, DirectoryStructure } from './directory.ts';
export declare const FILE_DROP_ROUTE = "/file-drop/locate";
export declare const SAMPLE_BYTES: number;
export declare const SMALL_FILE_BYTES: number;
export interface DroppedFileMeta {
    readonly kind: 'file';
    readonly name: string;
    readonly size: number;
    readonly lastModified: number;
}
export interface DroppedDirectoryMeta {
    readonly kind: 'directory';
    readonly name: string;
    readonly structure?: DirectoryStructure;
}
export type DroppedEntryMeta = DroppedFileMeta | DroppedDirectoryMeta;
export interface LocateRequest {
    readonly phase: 'metadata' | 'sample' | 'full' | 'directory-structure' | 'directory-content';
    readonly file: DroppedEntryMeta;
    readonly digest?: string;
    readonly directorySamples?: readonly DirectoryContentSample[];
    readonly candidates?: readonly string[];
    readonly workspacePaths?: readonly string[];
    readonly currentWorkspacePath?: string;
}
export type LocateResponse = {
    readonly status: 'found';
    readonly path: string;
} | {
    readonly status: 'sample-required';
    readonly candidates: readonly string[];
} | {
    readonly status: 'full-required';
    readonly candidates: readonly string[];
} | {
    readonly status: 'directory-structure-required';
    readonly candidates: readonly string[];
} | {
    readonly status: 'directory-content-required';
    readonly candidates: readonly string[];
    readonly paths: readonly string[];
} | {
    readonly status: 'choose';
    readonly candidates: readonly string[];
} | {
    readonly status: 'not-found';
} | {
    readonly status: 'error';
    readonly message: string;
};
