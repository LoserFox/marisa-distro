export declare function sampleRanges(size: number): readonly {
    start: number;
    length: number;
}[];
export declare function hashParts(size: number, parts: readonly Uint8Array[]): string;
export declare function sampleFingerprint(path: string, size: number): Promise<string>;
export declare function fullFingerprint(path: string): Promise<string>;
