import { type ProcessRunner } from './process.ts';
import type { VersionComponentId, VersionStatus, VersionUpdateResult } from './shared/contracts.ts';
export type { VersionComponentId, VersionComponentStatus, VersionInstallMode, VersionStatus, VersionUpdateResult } from './shared/contracts.ts';
export interface VersionUpdateDependencies {
    packageManifestPath?: string;
    dshHome?: string;
    mnemonCliPath?: () => string | undefined;
    processRunner?: ProcessRunner;
    resolveExecutable?: (command: string) => string | undefined;
    fetchNpmLatest?: (name: string) => Promise<string | undefined>;
    fetchMnemonLatest?: () => Promise<string | undefined>;
}
/** Resolve one executable without invoking a shell. */
export declare function resolveExecutable(command: string): string | undefined;
export interface SemverParts {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}
export declare function parseSemver(value: string): SemverParts | undefined;
export declare function compareVersions(a: string, b: string): number;
export declare class VersionUpdateManager {
    private dshMnemonVersion;
    private readonly packageManifestPath;
    private readonly dshHome;
    private readonly mnemonCliPath;
    private readonly processRunner;
    private readonly executable;
    private readonly fetchNpmLatest;
    private readonly fetchMnemonLatest;
    constructor(dependencies?: VersionUpdateDependencies);
    get currentDshMnemonVersion(): string;
    private inspectMnemon;
    check(): Promise<VersionStatus>;
    update(component: VersionComponentId): Promise<VersionUpdateResult>;
}
