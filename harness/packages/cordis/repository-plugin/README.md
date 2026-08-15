# @deepseek-ai/dsh-repository-plugin

English | [中文](README.zh.md)

Restricted repository Plugin format for DeepSeek Harness. A repository author declares static skill roots and an optional common `.mcp.json` in `.dsh-plugin/package.json`; the prepare helper copies those assets and emits a fixed import-free Cordis wrapper. The runtime wrapper can only delegate to this DSH-owned package, which composes [`dsh-skill-local`](../../skill/skill-local/README.md) and [`dsh-mcp-client`](../../mcp/mcp-client/README.md). Design rationale: [static repository Plugin format Agent Note](../../../.agents/notes/implemented/architecture/2026-07-30-static-repository-plugin-format.md).

## Authoring format

Place an ordinary package in the repository's `.dsh-plugin` directory:

```json
{
  "name": "humanize-dsh-plugin",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "prepare": "dsh-plugin-prepare"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-repository-plugin": "^0.0.1"
  },
  "dsh": {
    "skills": ["../skills"],
    "mcpServers": "../.mcp.json"
  }
}
```

`dsh.skills` is an optional array of local skill roots. `dsh.mcpServers` is an optional path to one `.mcp.json`; at least one field is required. Paths are relative to `.dsh-plugin`, must stay under its parent source directory, and may therefore refer to existing repository assets such as `../skills`. A repository containing several Plugins gives each one its own `.dsh-plugin` package under a different selectable subdirectory.

## Standalone app configuration

The shipped `dsh-base` bundle every profile starts from contains an empty `repository-plugins` row. A user enables exact GitHub generations by replacing that row's config in a user patch layer — `$DSH_HOME/profiles/<name>/cordis.patch.yml`, or the home-level `$DSH_HOME/cordis.patch.yml` shared by every profile; a `--patch` overlay patches the same row for one run:

```yaml
- id: repository-plugins
  name: '@deepseek-ai/dsh-repository-plugin'
  config:
    repositories:
      - 'github:PolyArch/humanize#<commit>'
      - 'github:owner/repository#<ref>&path:/plugins/one/.dsh-plugin'
```

Each source must use `github:owner/repository#<ref>`. Omitting `&path:` selects `/.dsh-plugin`; an explicit path is absolute within the repository and must end in `.dsh-plugin`. A commit ref gives the clearest immutable identity, while tags and branches remain accepted exact config values. `cacheDir` may override the default `$DSH_HOME/cache/repository-plugins` cache root.

Long-lived surfaces watch both `cordis.patch.yml` layers through Cordis HMR. A valid source-list change installs and swaps the complete repository Plugin generation; a failed fetch, prepare, import, or Plugin application keeps the last good tree and broadcasts `hmr/config-update-failed(filename, error)`. One-shot runs read the layers only at startup, and a `--patch` overlay is never watched. An identical source string permanently reuses its prepared cache entry, so selecting changed code requires a ref, path, or other source-config change. App integration rationale: [config-only repository Plugins Agent Note](../../../.agents/notes/implemented/feature/2026-07-30-config-only-repository-plugins.md).

## Preparation

`dsh-plugin-prepare` validates `package.json#dsh`, verifies skill-root types, parses the MCP file, copies assets under `dsh-plugin-assets`, and writes `dsh-plugin.mjs`. The wrapper contains only the normalized static manifest and fixed code that looks up the `dsh-repository-plugin` Loader builtin. It neither discovers nor compiles repository JavaScript, and the runtime never imports another repository entry point.

The containing package manager still runs the configured repository package's lifecycle scripts. This restriction defines the supported DSH contribution surface; it is not a security boundary for a repository that the user chose to install as executable package-manager source.

## Runtime composition

Loading this package registers one effect-scoped Loader builtin. Each generated wrapper delegates to that builtin with its own module URL and prepared manifest. The runtime validates every declared skill root as an existing in-package directory before mounting — a package whose generated outputs were dropped (a `files`/`.npmignore` mistake, a damaged cache entry) fails the plugin load instead of silently mounting a skill-less plugin. Repository skill roots mount as a uniquely named `dsh-skill-local` provider with default project/user roots excluded and watching disabled; cached package generations are immutable. Wrapper disposal removes the provider and all composed MCP clients through normal Cordis child-fiber teardown.

## Common MCP format

The `.mcp.json` root is `{ "mcpServers": { ... } }`. A stdio entry accepts only `type: "stdio"` (optional), `command`, `args`, and `env`; an HTTP entry accepts only `type: "http"`, `url`, and `headers`. String values support exact `${NAME}` process-environment expansion at Plugin load, and a missing name fails that load. HTTP URLs become the existing MCP client's `streamable-http` transport; stdio entries use the prepared package directory as `cwd`.

Unknown fields reject, including OAuth and `auth` objects. There is no `CLAUDE_PLUGIN_ROOT` expansion or compatibility layer. After translation, the existing `dsh-mcp-client` exclusively owns transport creation, connection diagnostics, tool synchronization, calls, and disconnect lifecycle; a network or child-process connection failure retains that client's established log-and-no-tools behavior.

## Export shape

Namespace Plugin: named exports `name` / `inject` / `apply`, preparation constants, and `prepareDshPlugin`; no default export. The package also exposes the `dsh-plugin-prepare` executable and an invariant companion.

## Model Experience

### Repository skills

#### What the model sees

Indirectly through `dsh-tool-skill`: prepared, model-invocable skills join its logged catalog and selected instruction-body surface under their declared names and descriptions. The exact consumer schema is in the generated [`skill` tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill).

#### Token effect

Conditional and data-dependent: each visible repository skill adds one capped catalog row; loading one adds its full current instruction body and resource-base guidance to retained tool history.

#### KV Cache effect

A stable prepared Plugin set is prefix-stable. Adding, removing, or replacing a repository Plugin can append the consumer's replacement catalog and affect later request prefixes.

### Repository MCP tools

#### What the model sees

Indirectly through `dsh-mcp-client`: every connected server contributes its server-qualified tool schemas, and calls retain that client's canonical MCP results and rendering.

#### Token effect

Conditional on successful connection and the remote tool list; schemas recur on requests in the active tool view, while calls and results remain in history until compaction.

#### KV Cache effect

Stable connected tool lists are prefix-stable. Plugin lifecycle or MCP tool-list changes can change later tool-schema prefixes from the first affected definition.

## Known Limitations and Deferred Work

- **Skills and MCP only** — commands, hooks, agents, apps, arbitrary Cordis code, marketplaces, and compatibility shims are intentionally outside this format.
- **No MCP authentication protocol** — static headers may use environment expansion, but OAuth-bearing definitions reject and private-server login flows are not implemented here.
- **Generated assets are immutable runtime input** — repository cache generations are not watched; source, ref, path, or configuration must select another prepared generation.
