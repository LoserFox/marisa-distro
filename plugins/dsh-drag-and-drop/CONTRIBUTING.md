# Contributing to dsh-drag-and-drop

Focused fixes, tests, and documentation changes are welcome. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

1. Read [README.md](README.md) — install, usage, and troubleshooting.
2. Search existing [issues](https://github.com/omdsh-dev/dsh-drag-and-drop/issues) and pull requests before opening duplicate work.
3. Open an issue before changing the drag-and-drop surface (path resolution, candidate confirmation, the chooser or toast, supported platforms) or the bundle manifest.
4. Keep each change narrowly scoped. Do not mix a feature or fix with unrelated refactoring or generated-output churn.

## Architecture and scope

dsh-drag-and-drop is an out-of-tree DeepSeek Harness Web **bundle** plugin. Contributions must preserve these responsibilities:

- The node half (package root) registers the file-locate HTTP route; the browser half (`dsh.client` declaration + `exports["./client"]`) handles drag events and inserts resolved paths into the input.
- The plugin never uploads, copies, moves, modifies, or deletes files; all resolution and fingerprinting happens locally on the machine running DSH.
- Searches stay bounded: a 3-second timeout per external index command, at most 100 candidate paths, at most 20,000 directory entries per recursive root.
- Content is fingerprinted only when multiple candidates share the same name and size; byte-identical copies fall back to a user chooser.

## Development

```sh
pnpm install
pnpm run build   # needs a DSH checkout (DSH_CHECKOUT=/path/to/dsh pnpm run build)
pnpm test        # vitest: directory / locator / fingerprint / platform-search / drop-items / toast-timer suites
pnpm run check   # tsc type-check
```

Keep the bilingual README in sync (edit both `README.md` and `README.zh.md`, then `node scripts/verify-i18n.mjs --write`).

## Commit and release

- Bump the version and update `CHANGELOG.md` (Keep a Changelog format) in the same change that ships a user-visible difference.
- Tag releases with a semantic version (`v0.1.3`) and push tags with the release.
