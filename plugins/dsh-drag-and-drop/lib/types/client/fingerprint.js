import { SAMPLE_BYTES } from "../protocol.js";
export function droppedFileMeta(file) {
    return { kind: 'file', name: file.name, size: file.size, lastModified: file.lastModified };
}
function sampleRanges(size) {
    if (size <= SAMPLE_BYTES * 3)
        return [{ start: 0, end: size }];
    const starts = [0, Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)), size - SAMPLE_BYTES];
    return starts.map(start => ({ start, end: Math.min(start + SAMPLE_BYTES, size) }));
}
function hex(buffer) {
    return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function sampleFingerprint(file) {
    const ranges = sampleRanges(file.size);
    const parts = await Promise.all(ranges.map(range => file.slice(range.start, range.end).arrayBuffer()));
    const total = parts.reduce((sum, part) => sum + part.byteLength, 8);
    const combined = new Uint8Array(total);
    new DataView(combined.buffer).setBigUint64(0, BigInt(file.size));
    let cursor = 8;
    for (const part of parts) {
        combined.set(new Uint8Array(part), cursor);
        cursor += part.byteLength;
    }
    return hex(await crypto.subtle.digest('SHA-256', combined));
}
export async function fullFingerprint(file) {
    return hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
}
