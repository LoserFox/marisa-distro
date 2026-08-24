# VENDOR — dsh-change-ledger

- Upstream: https://github.com/dsh-external/dsh-change-ledger
- Version: 0.1.0 (`@dsh-external/change-ledger`)
- Source commit: `ae742c6`（ae742c65689cbe8676f4ad99a673e010008f1e91；本地参考源为单 commit 导出。历史记录中的 `c8d1340a` 为更早来源 commit，不在本次 clone 中）
- Vendored into marisa-distro: 2026-08-24
- Local reference copy: `~/.dsh/plugins/dsh-change-ledger`

## Vendored contents

Full source tree (`src/`, `tests/`, `dist/` build output, `docs/`, `scripts/`,
`cordis.patch.yml`, `package.json`, `pnpm-lock.yaml`, `README*`, `LICENSE`,
`SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.github/workflows/ci.yml`),
excluding `node_modules/`, `.git/`, and `*.log`.

`dist/` is the runtime build (prebuilt by upstream `pnpm run build`); the repo
does not rebuild it. `src/` and `tests/` are kept for reference and upstream
sync.

## Runtime wiring notes

- Plugin name: `@dsh-external/change-ledger`, bundle patch id `change-ledger`
  (`cordis.patch.yml`), declared via `dsh.bundle.patch` in `package.json`.
- Client half: top-level `dshClient` field (`platform: web`, injects
  `@deepseek-ai/dsh-client-runtime` + `@deepseek-ai/dsh-client-ui-conversation`);
  harness reads this legacy field (see harness `cordis-client-runner`).
- Host runtime imports only bare `cordis` (`import { Service } from 'cordis'`).
  The plugin declares `peerDependencies.cordis: ^4.0.0-rc.7`; the repo root
  `pnpm-workspace.yaml` override pins bare `cordis` to `4.0.0-rc.7`, which is
  already present in the root lockfile (used by other vendored plugins such as
  `dsh-diff-viewer` / `ya-workspace-sidebar`), so the peer resolves.
- After vendoring, `plugins/*` is a workspace glob: a `pnpm install` will add
  this package to the root dependency graph (peer `cordis` + devDeps
  `typescript`/`react`/`@types/*` already in the lockfile).
