export interface ToastTimerHost {
  now(): number
  set(callback: () => void, delay: number): unknown
  clear(handle: unknown): void
}

export interface ToastTimer {
  arm(): void
  pause(): void
  resume(): void
  cancel(): void
}

export function createToastTimer(duration: number, dismiss: () => void, host: ToastTimerHost): ToastTimer {
  let handle: unknown
  let deadline = 0
  let remaining = duration
  const cancel = (): void => { if (handle !== undefined) host.clear(handle); handle = undefined }
  const schedule = (delay: number): void => {
    cancel()
    remaining = delay
    deadline = host.now() + delay
    handle = host.set(() => { handle = undefined; dismiss() }, delay)
  }
  return {
    arm() { schedule(duration) },
    pause() { remaining = Math.max(0, deadline - host.now()); cancel() },
    resume() { schedule(remaining) },
    cancel,
  }
}
