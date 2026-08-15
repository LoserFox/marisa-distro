export type PathPlatform = 'posix' | 'windows';
/** Infer the host path syntax without relying on deprecated platform APIs alone. */
export declare function detectPathPlatform(navigatorValue?: Navigator): PathPlatform;
/** Parse desktop file-manager URI payloads into unique native absolute paths. */
export declare function pathsFromUriList(value: string, platform?: PathPlatform): string[];
/** Read the drag payload formats exposed by desktop file managers and browsers. */
export declare function pathsFromDrop(dataTransfer: Pick<DataTransfer, 'getData' | 'types'>, platform?: PathPlatform): string[];
