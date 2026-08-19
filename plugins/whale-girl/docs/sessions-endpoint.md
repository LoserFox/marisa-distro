# Per-session activity endpoint

`GET /whale-girl/sessions` returns one row per running session — the title and
the current activity each session is performing. It is the per-session
companion to the aggregate mood in `/whale-girl/state` (sessionThink /
sessionWait): external consumers such as a desktop companion's message bubbles
read per-session detail from here.

## Response

```json
[
  {
    "id": "session-<id>",
    "title": "session title or null",
    "activity": "thinking",
    "since": 1786793963547
  }
]
```

- `activity` is a closed set: `thinking` (turn in progress), `tool:<name>`
  (a tool call is running; `bash`/`pwsh` mean a command is executing),
  `waiting` (turn blocked on approval), `done` (turn completed).
- `title` is the latest `session/title` from the session log, or the
  `sessionTitle` service value; `null` when unknown.
- `since` is the session start time (Unix epoch ms).
- Rows are removed once a session leaves `sessions.list()` — a finished
  session's bubble disappears.

`cache-control: no-store`; activity changes with session events, so consumers
poll or re-read on every `/whale-girl/events` signal.

## Derivation

Each `session/event` is folded into a per-session view:

| event | effect |
|---|---|
| `turn/start` | activity `thinking` |
| `tool/call` | activity `tool:<data.name>` |
| `turn/end` (`reason.kind === 'blocked'`) | activity `waiting` |
| `turn/end` (other reason) | activity `done` |
| `session/title` | title |

Sessions absent from the event stream (created before the plugin loaded) are
back-filled from `sessions.list()` (log title, `header.createdAt`).
