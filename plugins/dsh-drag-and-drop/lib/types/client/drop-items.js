import { droppedDirectories } from "./directory.js";
export function droppedItems(dataTransfer) {
    const directories = droppedDirectories(dataTransfer);
    const directoryItemIndexes = new Set(directories.map(directory => directory.itemIndex));
    const files = [...dataTransfer.items].flatMap((item, index) => {
        if (directoryItemIndexes.has(index) || item.kind !== 'file')
            return [];
        const file = item.getAsFile();
        return file === null ? [] : [file];
    });
    return { directories, files };
}
