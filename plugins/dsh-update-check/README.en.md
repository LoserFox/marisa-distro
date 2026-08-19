# dsh-update-check

Marisa distro's first-party update-check plugin. Periodically checks GitHub
Releases and notifies in the settings page and via a startup banner.

**Check + notify only**: no download, no verification, no installation — the
download buttons deep-link to the GitHub Release assets (MSI / standalone EXE,
selected by install form; the dev form links to the release page).

## Composition

- Host half (`lib/index.js`): a Cordis function plugin registering four
  same-origin routes (`/plugins/dsh-update-check/{state,check,dismiss,settings}`)
  and the `update-check` settings namespace; first check 30s after startup,
  then every `checkIntervalHours` (default 24h); state cached at
  `$DSH_HOME/update-check/state.json`.
- Client half (`lib/client.js`): the startup banner (top-fixed, minimal DOM
  injection) and the settings card (`settings.plugin.item`, key
  `update-check`).

## Configuration (Cordis entry config / settings page)

| Key | Default | Meaning |
|---|---|---|
| `repo` | `omdsh-dev/marisa-distro` | GitHub repository to watch (owner/repo) |
| `apiBase` | `https://api.github.com` | GitHub API base URL (mirror/test overrides) |
| `checkIntervalHours` | `24` | Periodic check interval (hours) |
| `autoCheck` | `true` | Automatic checks (toggle lives in the settings namespace) |

When `MARISA_VERSION` is empty (dev build) the plugin goes inert: routes are
registered, but no scheduled checks, no network requests, no cache writes.

## Permission impact

See [docs/plugins/dsh-update-check.md](../../docs/plugins/dsh-update-check.md).

## Development

```sh
pnpm install       # root workspace install (this plugin is a workspace member)
pnpm run build     # tsdown: lib/index.js + lib/client.js
pnpm run typecheck
pnpm test          # vitest: semver / state cache / proxy / routes / mock integration
```
