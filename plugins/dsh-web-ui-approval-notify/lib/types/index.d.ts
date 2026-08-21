/**
 * Node half: routes browser notification intents to the desktop shell's
 * native-toast bridge. All event detection stays in the browser half
 * (src/client, built into lib/client.js); in the Wails desktop shell the
 * browser half POSTs {title, body} to {@link TOAST_ROUTE} instead of using
 * the WebView2 default (Edge-styled) notification UI, and this half forwards
 * it to the loopback bridge (MARISA_TOAST_PORT, injected by the shell) which
 * shows a native Windows toast via the Wails notification service. Outside
 * the shell (no MARISA_TOAST_PORT) the route answers 503 and the browser
 * half falls back to `new Notification`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Plugin name (= the config entry id). */
export declare const name = "dsh-web-ui-notify";
/** Required services: the host web server (same-origin route). */
export declare const inject: string[];
/** 同源路由：浏览器半在 Wails 壳内把通知意图 POST 到这里。 */
export declare const TOAST_ROUTE = "/plugins/dsh-web-ui-approval-notify/toast";
/** 与 dsh-update-check 同款的最小路由注册面（真实 cordis ctx 结构兼容）。 */
export interface ToastRouteContext {
    readonly webServer: {
        register(route: {
            kind: 'exact';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
    effect(disposer: () => void, label?: string): void;
}
/** 桌面壳回环桥地址（MARISA_TOAST_PORT 由壳注入）；未设置/非法时返回 null。 */
export declare function toastEndpoint(env?: Record<string, string | undefined>): string | null;
/** 注册 toast 转发路由。env 参数供测试注入（真实运行默认读进程环境）。 */
export declare function registerToastRoute(ctx: ToastRouteContext, env?: Record<string, string | undefined>): void;
/** Host plugin body: mount the toast-forwarding route. */
export declare function apply(ctx: ToastRouteContext): void;
