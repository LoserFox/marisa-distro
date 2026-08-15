/** Infer the host path syntax without relying on deprecated platform APIs alone. */
export function detectPathPlatform(navigatorValue = navigator) {
    const userAgentPlatform = navigatorValue.userAgentData?.platform;
    const platform = userAgentPlatform ?? navigatorValue.platform;
    return /win/i.test(platform) ? 'windows' : 'posix';
}
function pathFromFileUrl(url, platform) {
    if (url.protocol !== 'file:')
        return undefined;
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/') || pathname === '/')
        return undefined;
    if (platform === 'posix') {
        // POSIX file URLs must be local; a hostname represents a remote share.
        return url.host === '' || url.host === 'localhost' ? pathname : undefined;
    }
    if (url.host !== '' && url.host !== 'localhost') {
        return `\\\\${decodeURIComponent(url.host)}${pathname.replaceAll('/', '\\')}`;
    }
    const drivePath = /^\/([A-Za-z]:)(\/.*)$/.exec(pathname);
    if (drivePath === null)
        return undefined;
    return `${drivePath[1]}${drivePath[2].replaceAll('/', '\\')}`;
}
/** Parse desktop file-manager URI payloads into unique native absolute paths. */
export function pathsFromUriList(value, platform = detectPathPlatform()) {
    const paths = [];
    const seen = new Set();
    for (const line of value.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate === '' || candidate.startsWith('#'))
            continue;
        let url;
        try {
            url = new URL(candidate);
        }
        catch {
            continue;
        }
        const path = pathFromFileUrl(url, platform);
        if (path === undefined || seen.has(path))
            continue;
        seen.add(path);
        paths.push(path);
    }
    return paths;
}
/** Read the drag payload formats exposed by desktop file managers and browsers. */
export function pathsFromDrop(dataTransfer, platform = detectPathPlatform()) {
    const uriList = dataTransfer.getData('text/uri-list');
    const uriPaths = pathsFromUriList(uriList, platform);
    if (uriPaths.length > 0)
        return uriPaths;
    const plain = dataTransfer.getData('text/plain');
    return pathsFromUriList(plain, platform);
}
