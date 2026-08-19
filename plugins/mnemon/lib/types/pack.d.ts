import type { ResolvedConfig } from './config.ts';
import type { MnemonRunner } from './runner.ts';
import type { MnemonPackComponent, MnemonPackExport, MnemonPackImportMode, MnemonPackImportResult, MnemonPackPreview, MnemonPackScope } from './shared/contracts.ts';
export type { MnemonPackComponent, MnemonPackComponentSummary, MnemonPackExport, MnemonPackImportMode, MnemonPackImportResult, MnemonPackManifest, MnemonPackPreview, MnemonPackScope } from './shared/contracts.ts';
export declare const MNEMON_PACK_FORMAT = "mnemonpack";
export declare const MNEMON_PACK_VERSION = 1;
export declare const MNEMON_PACK_MIME = "application/zip";
export declare const MNEMON_PACK_MAX_ARCHIVE_BYTES: number;
export declare const MNEMON_PACK_MAX_EXPANDED_BYTES: number;
/** Native, checksummed import/export for the one currently effective Mnemon root. */
export declare class MnemonPackManager {
    private readonly runner;
    private readonly config;
    private readonly afterImport;
    private readonly now;
    private readonly root;
    constructor(runner: MnemonRunner, config: Pick<ResolvedConfig, 'storageScope'>, afterImport?: (components: MnemonPackComponent[]) => void, now?: () => Date);
    target(): {
        root: string;
        scope: ResolvedConfig['storageScope'];
    };
    exportPack(scope: MnemonPackScope): Promise<MnemonPackExport>;
    inspectPack(base64: string, fileName?: string): MnemonPackPreview;
    importPack(base64: string, options: {
        mode: MnemonPackImportMode;
        components?: MnemonPackComponent[];
    }): Promise<MnemonPackImportResult>;
}
