export interface ToastTimerHost {
    now(): number;
    set(callback: () => void, delay: number): unknown;
    clear(handle: unknown): void;
}
export interface ToastTimer {
    arm(): void;
    pause(): void;
    resume(): void;
    cancel(): void;
}
export declare function createToastTimer(duration: number, dismiss: () => void, host: ToastTimerHost): ToastTimer;
