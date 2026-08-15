import { type DirectoryContentSample, type DirectoryStructure } from '../directory.ts';
interface FileSystemEntryLike {
    readonly name: string;
    readonly isFile: boolean;
    readonly isDirectory: boolean;
    file(success: (file: File) => void, error?: (error: DOMException) => void): void;
    createReader(): {
        readEntries(success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void): void;
    };
}
export interface DroppedDirectory {
    readonly itemIndex: number;
    readonly name: string;
    readonly entry: FileSystemEntryLike;
}
export declare function droppedDirectories(dataTransfer: Pick<DataTransfer, 'items'>): DroppedDirectory[];
export declare function readDirectoryStructure(root: FileSystemEntryLike): Promise<DirectoryStructure>;
export declare function readDirectoryContentSamples(root: FileSystemEntryLike, paths: readonly string[]): Promise<DirectoryContentSample[]>;
export {};
