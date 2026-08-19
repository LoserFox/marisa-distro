# External consumers

Local companion applications may read whale-girl state from a running DSH Web profile. The snapshot is read-only and non-consuming: multiple clients can observe the same activity windows without stealing events from one another.

## Endpoints

- `GET /whale-girl/state` returns the current snapshot with `cache-control: no-store`.
- `GET /whale-girl/events` is an SSE refresh signal. Fetch `/state` after each message and retain polling as a reconnect fallback.
- `GET /whale-girl/config` returns the current presentation configuration.
- `GET /whale-girl/assets/*` serves the character manifest and sprite sheets.
- `POST /whale-girl/presence` is the desktop-companion heartbeat (display-layer write, cross-origin guarded). A companion application that replaces the in-page pet posts `{ "online": true }` every 15s while running, and `{ "online": false }` on clean exit. While the presence window (45s TTL) is active, `/state` reports `companionOnline: true` and the in-page pet hides itself; if the companion dies without a farewell, the window expires and the in-page pet returns automatically.

The snapshot response is:

```json
{
  "apiVersion": 1,
  "pet": {},
  "activity": {
    "name": "idle",
    "until": 0,
    "sessionThink": false,
    "sessionWait": false,
    "turnCompleted": false,
    "turnCompletedUntil": 0
  },
  "configRevision": 1,
  "companionOnline": false
}
```

`turnCompletedUntil` is an absolute Unix timestamp in milliseconds. Consumers should use it as the animation deadline; `turnCompleted` is the corresponding convenience boolean. Unknown fields may be added compatibly within an API version.

```js
const base = 'http://127.0.0.1:3080'
const readState = async () => {
  const response = await fetch(`${base}/whale-girl/state`)
  if (!response.ok) throw new Error(`whale-girl state: HTTP ${response.status}`)
  return response.json()
}

const events = new EventSource(`${base}/whale-girl/events`)
events.onmessage = async () => render(await readState())
```

Keep DSH bound to loopback when its local state should not be visible to other machines. Consumers must tolerate the server being unavailable during DSH startup, shutdown, and profile restarts.
