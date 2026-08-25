/**
 * Proxy parsing and CONNECT tunneling primitives for dsh-model-proxy.
 *
 * Pure Node stdlib (node:net / node:tls): SOCKS5 (with optional
 * username/password), HTTP(S) proxy CONNECT, direct connections, and
 * NO_PROXY matching. Shared by the plugin entry and its tests.
 * @module dsh-model-proxy/tunnel
 */
import net from 'node:net';
import tls from 'node:tls';
const HANDSHAKE_TIMEOUT_MS = 15_000;
/** First set environment variable, or undefined. */
export function firstEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (value)
            return value;
    }
    return undefined;
}
/**
 * Parse a proxy URL into {@link ProxyConfig}.
 * @param raw - `socks5://`, `socks5h://`, `http://` or `https://` URL,
 *   optionally with `user:pass@`; `direct` / `none` / `off` is rejected by
 *   the caller and means "no proxy".
 * @throws when the URL is malformed or uses an unsupported scheme.
 */
export function parseProxy(raw) {
    const u = new URL(raw);
    const scheme = u.protocol.slice(0, -1).toLowerCase();
    if (!['socks5', 'socks5h', 'http', 'https'].includes(scheme)) {
        throw new Error(`unsupported proxy scheme "${scheme}" (use socks5://, socks5h://, http://, https://)`);
    }
    const defaultPort = scheme === 'https' ? 443 : scheme.startsWith('socks') ? 1080 : 80;
    return {
        scheme: scheme,
        host: u.hostname,
        port: u.port ? Number(u.port) : defaultPort,
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
    };
}
/** Human-readable proxy identity without credentials. */
export function displayProxy(proxy) {
    const auth = proxy.username ? `${proxy.username}:***@` : '';
    return `${proxy.scheme}://${auth}${proxy.host}:${proxy.port}`;
}
/** Default direct-connect exemptions applied by the plugin entry. */
export const DEFAULT_NO_PROXY = ['localhost', '127.0.0.1', '::1'];
/**
 * Whether `host:port` must connect directly, per the `NO_PROXY` environment
 * variable or the configured extra list.
 * @param extra - additional entries (host, `.suffix`, or `host:port`).
 */
export function inNoProxy(host, port, extra = []) {
    const h = host.toLowerCase();
    const entries = [...extra, ...(firstEnv('NO_PROXY', 'no_proxy') ?? '').split(',').map(s => s.trim()).filter(Boolean)];
    if (entries.includes('*'))
        return true;
    for (const entry of entries) {
        const e = entry.toLowerCase();
        if (!e)
            continue;
        let eHost = e;
        let ePort;
        const colon = e.lastIndexOf(':');
        if (colon > 0 && !e.includes(']')) {
            eHost = e.slice(0, colon);
            ePort = e.slice(colon + 1);
        }
        const hostMatch = eHost === h || (eHost.startsWith('.') && h.endsWith(eHost));
        if (hostMatch && (ePort === undefined || String(ePort) === String(port)))
            return true;
    }
    return false;
}
/** Exact-byte reader for handshake phases; surplus bytes stay buffered. */
class HandshakeReader {
    sock;
    buffer = Buffer.alloc(0);
    waiter = null;
    constructor(sock) {
        this.sock = sock;
        sock.on('data', this.onData);
        sock.on('error', this.failAll);
        sock.on('end', () => this.failAll(new Error('proxy closed during handshake')));
    }
    onData = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (!this.waiter || this.buffer.length < this.waiter.n)
            return;
        const waiter = this.waiter;
        this.waiter = null;
        clearTimeout(waiter.timer);
        const out = this.buffer.subarray(0, waiter.n);
        this.buffer = this.buffer.subarray(waiter.n);
        waiter.resolve(out);
    };
    failAll = (err) => {
        if (!this.waiter)
            return;
        const waiter = this.waiter;
        this.waiter = null;
        clearTimeout(waiter.timer);
        waiter.reject(err);
    };
    read(n) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.failAll(new Error('tunnel handshake timeout')), HANDSHAKE_TIMEOUT_MS);
            this.waiter = { n, resolve, reject, timer };
            this.onData(Buffer.alloc(0));
        });
    }
    destroy() {
        this.sock.removeListener('data', this.onData);
        this.sock.removeListener('error', this.failAll);
        this.sock.removeListener('end', this.failAll);
    }
}
/** SOCKS5 CONNECT tunnel. `socks5h` semantics are identical (remote DNS). */
function socks5Connect(proxy, host, port) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(proxy.port, proxy.host);
        const reader = new HandshakeReader(sock);
        const fail = (err) => {
            reader.destroy();
            sock.destroy();
            reject(err);
        };
        sock.once('error', fail);
        sock.once('connect', () => {
            const withAuth = proxy.username !== undefined;
            sock.write(Buffer.from([0x05, withAuth ? 0x02 : 0x01, 0x00, ...(withAuth ? [0x02] : [])]));
            reader.read(2)
                .then(([ver, method]) => {
                if (ver !== 0x05)
                    throw new Error(`socks5: bad version ${ver}`);
                if (method === 0x02) {
                    const user = Buffer.from(proxy.username, 'utf8');
                    const pass = Buffer.from(proxy.password ?? '', 'utf8');
                    sock.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]));
                    return reader.read(2).then(([aVer, status]) => {
                        if (aVer !== 0x01 || status !== 0x00)
                            throw new Error(`socks5: auth failed (status ${status})`);
                    });
                }
                if (method === 0x00)
                    return;
                throw new Error(`socks5: no acceptable auth method (${method})`);
            })
                .then(() => {
                let atyp;
                let addr;
                const ip = net.isIP(host);
                if (ip === 4) {
                    atyp = 0x01;
                    addr = host.split('.').map(Number);
                }
                else if (ip === 6) {
                    atyp = 0x04;
                    addr = [...Buffer.from(host, 'hex')];
                }
                else {
                    atyp = 0x03;
                    addr = [host.length, ...Buffer.from(host, 'utf8')];
                }
                sock.write(Buffer.from([0x05, 0x01, 0x00, atyp, ...addr, (port >> 8) & 0xff, port & 0xff]));
                return reader.read(4);
            })
                .then(([ver, rep, , atyp]) => {
                if (ver !== 0x05)
                    throw new Error(`socks5: bad reply version ${ver}`);
                if (rep !== 0x00) {
                    const reasons = {
                        0x01: 'general failure', 0x02: 'not allowed', 0x03: 'network unreachable',
                        0x04: 'host unreachable', 0x05: 'connection refused', 0x06: 'ttl expired',
                        0x07: 'command not supported', 0x08: 'address type not supported',
                    };
                    throw new Error(`socks5: connect failed (${reasons[rep] ?? rep})`);
                }
                const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : 1;
                return reader.read(addrLen + 2);
            })
                .then(() => {
                reader.destroy();
                sock.on('error', () => { });
                resolve(sock);
            })
                .catch(fail);
        });
    });
}
/** Read a CRLF-terminated header block (8 KiB cap). */
function readHeadersBlock(sock) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        const timer = setTimeout(() => fail(new Error('proxy handshake timeout')), HANDSHAKE_TIMEOUT_MS);
        const cleanup = () => {
            clearTimeout(timer);
            sock.removeListener('data', onData);
            sock.removeListener('error', onError);
            sock.removeListener('end', onEnd);
        };
        const fail = (err) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            reject(err);
        };
        const done = (text) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve(text);
        };
        const onData = (chunk) => {
            chunks.push(chunk);
            size += chunk.length;
            if (size > 8192)
                return fail(new Error('proxy handshake response too large'));
            const idx = Buffer.concat(chunks).indexOf('\r\n\r\n');
            if (idx >= 0)
                done(Buffer.concat(chunks).toString('latin1', 0, idx));
        };
        const onError = (err) => fail(err);
        const onEnd = () => fail(new Error('proxy closed during handshake'));
        sock.on('data', onData);
        sock.on('error', onError);
        sock.on('end', onEnd);
    });
}
/** HTTP(S) proxy CONNECT tunnel. */
function httpProxyConnect(proxy, host, port) {
    return new Promise((resolve, reject) => {
        const base = net.connect(proxy.port, proxy.host);
        const fail = (err) => {
            base.destroy();
            reject(err);
        };
        base.once('error', fail);
        const wrapped = proxy.scheme === 'https'
            ? new Promise((res, rej) => {
                const tlsSock = tls.connect({ socket: base, servername: proxy.host });
                tlsSock.once('secureConnect', () => res(tlsSock));
                tlsSock.once('error', rej);
            })
            : Promise.resolve(base);
        wrapped.then((sock) => {
            const auth = proxy.username !== undefined
                ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64')}\r\n`
                : '';
            sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
            return readHeadersBlock(sock).then((head) => {
                const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(head)?.[1]);
                if (!status || status < 200 || status >= 300) {
                    throw new Error(`http proxy CONNECT failed (${status ?? 'bad response'})`);
                }
                sock.on('error', () => { });
                resolve(sock);
            });
        }, fail);
    });
}
/**
 * Establish a connection to `host:port`: directly when {@link inNoProxy}
 * matches, otherwise through the configured proxy.
 */
export function connectSocket(proxy, host, port, noProxyExtra = []) {
    if (inNoProxy(host, port, noProxyExtra)) {
        return new Promise((resolve, reject) => {
            const sock = net.connect(port, host);
            sock.once('connect', () => resolve(sock));
            sock.once('error', reject);
        });
    }
    if (proxy.scheme === 'socks5' || proxy.scheme === 'socks5h') {
        return socks5Connect(proxy, host, port);
    }
    return httpProxyConnect(proxy, host, port);
}
//# sourceMappingURL=tunnel.js.map