import { type DirectoryStructure } from './directory.ts';
export declare function readNodeDirectoryStructure(root: string): Promise<DirectoryStructure>;
export declare function nodeDirectoryStructureDigest(path: string): Promise<{
    digest: string;
    paths: string[];
}>;
export declare function nodeDirectoryContentDigest(root: string, paths: readonly string[]): Promise<string>;
