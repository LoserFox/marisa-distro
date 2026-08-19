<center>
<h1>@dpskh/a2a — Agent2Agent realtime mesh for the DeepSeek Harness</h1>

English | [中文](README.zh.md)

[![dshfind](https://dshfind.com/api/card/dpskh/dsh-a2a?lang=zh)](https://dshfind.com/zh/plugins/dpskh/dsh-a2a?ref=badge)

</center>

One package, one entry plugin. Mounting `@dpskh/a2a` 0.3 provides the **realtime A2A mesh**: the hub host (`ctx.a2aHub`: project registry + immutable message history over the storage domain, with an optional listening hub server that also serves the realtime WebSocket), the mesh client (`ctx.a2aMesh`: one WebSocket presence per joined agent with serial injection), the `a2a_peers` / `a2a_message` / `a2a_history` tools, and the `/a2a` command surface. Presence is a live socket; messages are the durable record — realtime chat on a trusted private network.

## Configuration

```yaml
- id: a2a
  name: '@dpskh/a2a'
  config:
    hub:                      # optional: run the mesh hub server
      host: 127.0.0.1
      port: 43123             # base bind port
      maxPort: 43223          # optional: walk up on EADDRINUSE
    mesh:                     # optional: mesh client
      project: main           # project to connect to (defaults to main)
      agentId: main           # local agent this presence belongs to
      name: main              # roster name; defaults to the agent id
      autoConnect: true       # connect when the configured agent registers
      persistConnections: false # remember each session's last connection and rejoin it
      reconnectMs: 500        # initial reconnect delay (doubles to 10 s)
```

The hub needs a routed storage backend: mount `@deepseek-ai/dsh-storage`, a backend (`storage-json` or `storage-sqlite`), and `@deepseek-ai/dsh-storage-domain` with the backend routed to the `a2a` domain. The entry plugin composes the hub host service (`ctx.a2aHub`), the mesh client (`ctx.a2aMesh`), and — when a mesh is configured — the tool and command plugins (cordis activates them by their inject dependencies). Removed 0.2 mesh fields (`persistBindings`, `autoRejoin`, `pollIntervalMs`, `heartbeatMs`, `caps`) are ignored for compatibility with copied 0.2 configs.

## The mesh

- **Hub** (`ctx.a2aHub`): authoritative project registry and the append-only message history (per-project monotonic sequences, project-scoped `messageRef`s like `demo:42`). The optional hub server serves the project/history routes over HTTP and the realtime WebSocket at `/v1/connect` (protocol version 3).
- **Presence**: a presence exists if and only if one WebSocket is alive. Claimed roster names are unique per project; a same-named later connection is a new presence and inherits nothing. Hub restart clears every presence while the message history survives.
- **Messages**: immutable, idempotent by `messageId` (retrying the same body returns the original message; reusing the id for different content fails with `MessageIdConflictError`). Direct sends resolve the recipient's current presence at accept time and fail immediately when absent; project broadcasts freeze the current presence snapshot (excluding the sender) and never backfill later joiners. `replyTo` provides causality inside the same project history. Text and attachments share a 4 MiB decoded-content budget; up to eight attachments per message travel as base64 (gzip when it shrinks).
- **Delivery**: in-memory outcomes reported to the sender — `delivered` proves the receiving client injected the message, `failed` a materialization/injection error, `disconnected` a socket that closed before acknowledging.
- **Mesh client** (`ctx.a2aMesh`): each joined agent owns one connection (project + roster name). Inbound messages are pushed serially in hub-assigned sequence and injected into the owning agent's session (follow-up turn when idle, plain context when busy), with attachments materialized under the system temp dir. Unexpected drops auto-reconnect with backoff while the connection is desired; a rejected claim (name in use, unknown project, protocol mismatch) stops wanting the connection. `a2a/presence-changed` events announce local connect/disconnect; `a2a/delivery` events announce delivery outcomes. Disposed agents drop their presence automatically. With `persistConnections`, each successful connect records `agentId → (project, name)` in the `a2a-connections` settings namespace, and an agent registering with a stored record rejoins it — the GUI path, where session ids are dynamic and no static `agentId` is configured; an explicit disconnect forgets the record. Each membership also tracks a local conversation-activity view (`idle` / `conversing` / `working`, inferred from sends, deliveries, and inbound messages — no activity state crosses the hub wire) and exposes it in `status()` for the connection-graph animations; activity transitions emit `a2a/change` so the browser refreshes live.

## Tools and commands

- `a2a_peers` — list the exact roster names currently present in this project.
- `a2a_message` — send to one current peer (`target: {type: 'agent', name}`) or broadcast to all current peers (`target: {type: 'project'}`), with optional `replyTo`, attachment file paths, and an idempotency `messageId`. The reply arrives passively — never wait or poll after send.
- `a2a_history` — review earlier project messages using `before`, `after`, `limit`, or `from` (past context only).
- `/a2a hub`, `/a2a project create|list|delete`, `/a2a connect <project> [--as <name>]`, `/a2a disconnect`, `/a2a status`, `/a2a peers`, `/a2a history [--before <ref>] [--after <ref>] [--limit <n>] [--from <name>]`, `/a2a help`.

## Web collaboration controls

`@dpskh/ui-a2a` consumes one Host `a2a.snapshot` per session: connection identity, the live roster, and projects. Local and remote roster changes emit `host/a2a-changed`; the browser refetches the snapshot so its Overview page, Projects page, badge, and quick panel stay on one state source. The roster is primary; the auxiliary topology uses an orbit for up to six peers and a grid above that threshold, and hides on narrow layouts. The browser never connects to the Hub WebSocket.

## Trust model

The mesh assumes a fully trusted private network: hub endpoints do not authenticate callers, and caller-supplied project and member identities are trusted claims. Do not expose a hub to the public Internet or an untrusted network.

## Model Experience

Indirectly, through the `a2a_*` tools, the `/a2a` command, and injected inbound envelopes: project member ids, message refs, join outcomes, and delivered messages can enter the conversation.

#### KV Cache effect

Prefix-stable while the plugin config and tool definitions are unchanged; project, roster, or history changes do not alter the schemas.

## Known Limitations and Deferred Work

- **Live recipients only** — direct sends fail immediately when the recipient is not currently present; there is no offline delivery or durable roster.
- **Single hub per client** — a mesh client connects to one hub at a time; multi-hub fan-out is deferred.
- **In-memory delivery outcomes** — `delivered`/`failed`/`disconnected` are not persisted; rich delivery metadata is deferred.
- **Temp-dir attachment materialization** — inbound attachments land under the system temp directory; a configurable session-scoped location is deferred.
