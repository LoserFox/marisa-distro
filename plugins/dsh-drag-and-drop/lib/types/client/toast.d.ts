export interface FileDropToast {
    showError(message: string): void;
    dispose(): void;
}
export declare function createFileDropToast(): FileDropToast;
