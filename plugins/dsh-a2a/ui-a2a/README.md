# @dpskh/ui-a2a

English | [中文](README.zh.md)

Browser A2A collaboration controls over a plugin-owned Connection RPC channel. A per-session directory owns one authoritative snapshot containing connection identity, the live roster, and projects; the Overview page, Projects page, composer badge, and quick panel consume that same state. A plugin-owned WebSocket downlink (`/dpskh-a2a/events`) pushes `changed` frames on Hub state change; the directory then refetches the complete snapshot instead of replaying Hub events. Project-directory changes invalidate every session, and Connection reset re-baselines the active session. The browser never opens a Hub WebSocket.

The Overview page puts connection status and the live roster first. The topology is auxiliary: up to six peers use an orbit, larger rosters use a collision-free grid, and narrow layouts hide it in favor of the roster. Each node carries the snapshot's conversation activity: a live exchange draws a glowing edge between the two conversing peers and both nodes breathe; the node working on a received conversation switches to a spinning ring. The same language wraps the identity dots in the roster rows and the composer badge, and every animation respects `prefers-reduced-motion`. The Projects page lists the Hub directory, creates projects, and connects or disconnects the session. Agent names follow the Hub's 32-character rule; project names follow its 64-character rule. The composer panel fits above its anchor and closes on Escape or outside interaction.

The `/client` export is the plugin body (`apply`/`inject`).

## Model Experience

None, as these views render Hub state and produce no model-visible content.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **No history or messaging controls** — the browser surface manages live presence and projects; durable history and sends remain in the model tools and `/a2a` commands.
- **Host-mediated refresh** — the browser refetches after a downlink `changed` frame or Connection reset; it never consumes Hub WebSocket events directly.
- **Inferred peer activity** — no activity state crosses the hub wire: a peer shows `working` from the delivery acknowledgment of a local send until it answers or a fixed window ends, so a silent fast finish keeps spinning until the window expires.
