import { type DroppedDirectory } from './directory.ts';
export interface DroppedItems {
    readonly directories: readonly DroppedDirectory[];
    readonly files: readonly File[];
}
export declare function droppedItems(dataTransfer: Pick<DataTransfer, 'items'>): DroppedItems;
