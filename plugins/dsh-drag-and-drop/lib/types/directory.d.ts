export declare const DIRECTORY_MAX_ENTRIES = 10000;
export declare const DIRECTORY_MAX_DEPTH = 32;
export declare const DIRECTORY_SAMPLE_FILES = 24;
export type DirectoryEntryKind = 'file' | 'directory';
export interface DirectoryEntryMeta {
    readonly path: string;
    readonly kind: DirectoryEntryKind;
    readonly size?: number;
}
export interface DirectoryStructure {
    readonly entries: readonly DirectoryEntryMeta[];
    readonly truncated: boolean;
}
export interface DirectoryContentSample {
    readonly path: string;
    readonly size: number;
    readonly digest: string;
}
export declare function normalizedDirectoryPath(path: string): string;
export declare function canonicalDirectoryEntries(entries: readonly DirectoryEntryMeta[]): DirectoryEntryMeta[];
export declare function directoryStructureDigest(structure: DirectoryStructure): string;
export declare function selectDirectorySamplePaths(entries: readonly DirectoryEntryMeta[]): string[];
export declare function directoryContentDigest(samples: readonly DirectoryContentSample[]): string;
