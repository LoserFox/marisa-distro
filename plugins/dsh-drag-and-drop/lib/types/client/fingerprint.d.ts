import { type DroppedFileMeta } from '../protocol.ts';
export declare function droppedFileMeta(file: File): DroppedFileMeta;
export declare function sampleFingerprint(file: File): Promise<string>;
export declare function fullFingerprint(file: File): Promise<string>;
