import { DIRECTORY_MAX_DEPTH, DIRECTORY_MAX_ENTRIES } from "../directory.js";
import { sampleFingerprint } from "./fingerprint.js";
function readFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
}
async function readChildren(entry) {
    const reader = entry.createReader();
    const entries = [];
    while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0)
            return entries;
        entries.push(...batch);
    }
}
export function droppedDirectories(dataTransfer) {
    const directories = [];
    for (const [itemIndex, item] of [...dataTransfer.items].entries()) {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory === true)
            directories.push({ itemIndex, name: entry.name, entry });
    }
    return directories;
}
export async function readDirectoryStructure(root) {
    const entries = [];
    let truncated = false;
    const visit = async (directory, prefix, depth) => {
        if (depth >= DIRECTORY_MAX_DEPTH) {
            truncated = true;
            return;
        }
        const children = await readChildren(directory);
        children.sort((a, b) => a.name.normalize('NFC').localeCompare(b.name.normalize('NFC')));
        for (const child of children) {
            if (entries.length >= DIRECTORY_MAX_ENTRIES) {
                truncated = true;
                return;
            }
            const path = prefix === '' ? child.name : `${prefix}/${child.name}`;
            if (child.isDirectory) {
                entries.push({ path, kind: 'directory' });
                await visit(child, path, depth + 1);
            }
            else if (child.isFile) {
                const file = await readFile(child);
                entries.push({ path, kind: 'file', size: file.size });
            }
        }
    };
    await visit(root, '', 0);
    return { entries, truncated };
}
async function findEntry(root, relativePath) {
    let current = root;
    for (const part of relativePath.split('/')) {
        if (!current.isDirectory)
            return undefined;
        current = (await readChildren(current)).find(entry => entry.name.normalize('NFC') === part.normalize('NFC'));
        if (current === undefined)
            return undefined;
    }
    return current;
}
export async function readDirectoryContentSamples(root, paths) {
    const samples = [];
    for (const path of paths) {
        const entry = await findEntry(root, path);
        if (entry?.isFile !== true)
            continue;
        const file = await readFile(entry);
        samples.push({ path, size: file.size, digest: await sampleFingerprint(file) });
    }
    return samples;
}
