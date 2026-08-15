# dsh-a2a repository

This repository owns the standalone DeepSeek Harness A2A packages. Build artifacts are not tracked; `lib/` and `node_modules/` remain ignored.

## Packages

| Package | Location | Role |
|---|---|---|
| [`@dpskh/a2a`](README.md) | repository root | Realtime A2A mesh, Hub transport and storage, model tools, and the `/a2a` command surface. |
| [`@dpskh/ui-a2a`](ui-a2a/README.md) | `ui-a2a/` | Host RPC projection and browser collaboration console for the A2A mesh. |

The core package can be installed directly from Git:

```json
{
  "dependencies": {
    "@dpskh/a2a": "github:dpskh/dsh-a2a#main"
  }
}
```

Git dependencies cannot address the nested browser package. Clone this repository and install it by path until it is published:

```json
{
  "dependencies": {
    "@dpskh/a2a": "github:dpskh/dsh-a2a#main",
    "@dpskh/ui-a2a": "file:../dsh-a2a/ui-a2a"
  }
}
```

Both packages consume Harness services through peer dependencies. The application owns those services and the Cordis composition.

## Development

```sh
pnpm install
pnpm run typecheck:all
pnpm run test
pnpm run build:all
```

The root workspace links `@dpskh/ui-a2a` to the local `@dpskh/a2a` package. Tests cover the core and browser packages from the same checkout.
