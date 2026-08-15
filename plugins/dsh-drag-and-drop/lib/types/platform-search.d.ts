export declare const PLATFORM_MAX_CANDIDATES = 100;
export interface PlatformSearchHost {
    readonly platform: NodeJS.Platform;
    readonly home: string;
    commandExists(command: string): Promise<boolean>;
    exec(command: string, args: readonly string[]): Promise<string>;
    windowsDrives(): Promise<readonly string[]>;
}
export declare function indexedSearch(name: string, runtime?: PlatformSearchHost): Promise<string[]>;
export declare function broadSearchRoots(runtime?: PlatformSearchHost): Promise<string[]>;
