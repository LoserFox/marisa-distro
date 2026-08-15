export function createToastTimer(duration, dismiss, host) {
    let handle;
    let deadline = 0;
    let remaining = duration;
    const cancel = () => { if (handle !== undefined)
        host.clear(handle); handle = undefined; };
    const schedule = (delay) => {
        cancel();
        remaining = delay;
        deadline = host.now() + delay;
        handle = host.set(() => { handle = undefined; dismiss(); }, delay);
    };
    return {
        arm() { schedule(duration); },
        pause() { remaining = Math.max(0, deadline - host.now()); cancel(); },
        resume() { schedule(remaining); },
        cancel,
    };
}
