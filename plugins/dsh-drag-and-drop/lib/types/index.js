import { locate } from "./locator.js";
import { FILE_DROP_ROUTE } from "./protocol.js";
export const inject = ['webServer'];
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_BODY_BYTES)
            throw new Error('request body too large');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sendJson(res, status, body) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(body));
}
export function apply(ctx) {
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: FILE_DROP_ROUTE,
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { status: 'error', message: 'method not allowed' });
                return;
            }
            try {
                sendJson(res, 200, await locate(await readJson(req)));
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                sendJson(res, 400, { status: 'error', message });
            }
        },
    }), 'file-drop: locator route');
}
