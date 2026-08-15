# Agent Note: Static repository Plugin format

Status: implemented

English | [中文](2026-07-30-static-repository-plugin-format.zh.md)

## Problem

A repository that already contains reusable skills or an MCP server declaration should be usable by standalone Harness applications without becoming a Harness SDK project or rewriting its existing layout. Popular repositories must be able to add one `.dsh-plugin` directory while keeping their current skills and `.mcp.json` elsewhere in the tree. At the same time, treating an arbitrary repository entry point as a Cordis Plugin would make every repository a new unrestricted runtime extension surface and would bypass the existing skill and MCP lifecycle owners.

The [package-manager-native repository cache](2026-07-30-package-manager-native-repository-cache.md) prepares an exact package source but intentionally knows nothing about DSH formats. This layer therefore needs a package-manager-compatible authoring format, a deterministic prepared artifact, and a Cordis composition that stays transactional under Loader disposal and replacement.

## Decision

`@deepseek-ai/dsh-repository-plugin` owns a restricted `.dsh-plugin` package format with two contribution kinds only: skill roots and one common `.mcp.json`. Its package metadata uses `package.json#dsh.skills` for relative skill-root paths and `package.json#dsh.mcpServers` for the relative MCP document path. At least one is required. Each path may leave `.dsh-plugin` to reuse repository content but must remain beneath the directory containing that `.dsh-plugin`; a nested selectable Plugin therefore owns the adjacent subtree above its package without gaining access to unrelated host paths.

The `.dsh-plugin` package declares `dsh-plugin-prepare` as its ordinary package-manager `prepare` script. The helper validates metadata and source types, strictly parses `.mcp.json`, copies static assets into `dsh-plugin-assets`, and writes `dsh-plugin.mjs`. The `.mjs` extension avoids imposing `type: module` on repository-authored package metadata. The generated module is a fixed import-free template containing only a normalized manifest, an `inject` list derived from it (`loader`, plus `skills` and/or `tools` per the declared capabilities, so the wrapper fiber gates on the services its children need), and delegation to the `dsh-repository-plugin` Loader builtin. Preparation never discovers, transpiles, bundles, or preserves a custom repository entry point.

Loading the DSH package registers that builtin as an effect. A generated wrapper mounts the builtin as its child with `import.meta.url`, so all contributions belong to the wrapper fiber and disappear on Loader removal or rollback. The builtin revalidates the prepared manifest and path containment before reading assets. It composes the existing implementations rather than registering skills or MCP tools itself.

Each prepared skill set mounts `dsh-skill-local` with a unique `repository:<package-name>` provider name, only the copied custom roots, and watching disabled. `dsh-skill-local` therefore gains two general configuration fields: `providerName` and `includeDefaultRoots`. Their defaults preserve its existing single local provider; repository instances set a distinct name and exclude project/user roots so multiple instances neither collide nor duplicate host-local discovery.

Each `.mcp.json` server becomes one existing `dsh-mcp-client` child. The adapter accepts the common root `{ "mcpServers": ... }`; stdio definitions allow only optional `type: "stdio"`, `command`, `args`, and `env`, while HTTP definitions allow only `type: "http"`, `url`, and `headers`. Exact `${NAME}` process-environment references expand at runtime, after cache preparation; missing names fail Plugin load. HTTP maps to the client's Streamable HTTP transport, and stdio uses the prepared package directory as `cwd`. The existing client alone owns connection attempts, failure logging, remote tool synchronization, tool calls, and disconnects. Consequently an MCP connection failure keeps its established successful-plugin/no-tools behavior and is not reclassified as a repository preparation or Loader failure.

Unknown MCP fields reject. This intentionally excludes OAuth, `auth` objects, `CLAUDE_PLUGIN_ROOT`, and a broader Claude compatibility contract. Hooks, commands, agents, apps, arbitrary Cordis code, marketplaces, and discovery are also unsupported. Repository subdirectory selection and GitHub source configuration belong to the [standalone app integration](../feature/2026-07-30-config-only-repository-plugins.md), not this format package.

## Alternatives considered

**Load a repository's own Cordis entry point.** Rejected because it makes the advertised static format an unrestricted code-loading API, requires repository authors to depend on Harness internals, and duplicates the ordinary SDK/plugin-dependency path.

**Teach generated wrappers to implement skills and MCP directly.** Rejected because copied runtime code would drift from `dsh-skill-local` and `dsh-mcp-client`, especially their provider invalidation, tool synchronization, failure, and teardown contracts.

**Import Harness packages from each generated wrapper.** Rejected because repository packages should not resolve or version the application's internal dependency graph. A Loader builtin supplies one app-owned implementation and keeps generated wrappers import-free.

**Watch prepared repository assets.** Rejected because an exact repository cache generation is immutable. Ref, subdirectory, or configuration changes select a new generation; a second watcher would create an unowned refresh identity.

**Treat MCP connect failures as Loader update failures.** Rejected because the existing MCP client deliberately contains connect failures and exposes no tools. Changing that semantic only for repository sources would create two failure contracts for the same server configuration.

## Consequences

- Existing skill/MCP repositories can add a small `.dsh-plugin/package.json` without relocating their assets or adopting an SDK project.
- Prepared output is deterministic static glue, while the configured repository and its dependency lifecycle remain trusted executable package-manager input rather than a sandbox.
- Multiple repository Plugins coexist through provider names and ordinary MCP server-name uniqueness; duplicate names fail through their existing registries and participate in Loader rollback.
- Cached source edits do not appear live. Another exact source/ref/path/config selection is required.
- Adding another contribution kind requires an explicit format and DSH-owned runtime consumer; it cannot arrive as repository JavaScript by accident.

## Testing

Focused tests prepare skills and MCP metadata, prove the emitted wrapper contains no imports, reject Work IQ-style OAuth fields, map Expo-style HTTP and DataJunction-style stdio plus environment values, and exercise missing variables. A real Loader test mounts a generated wrapper through the registered builtin, reads its skill through `ctx.skills`, removes the Loader entry, and observes provider cleanup. The keyless headless example loads a checked-in prepared wrapper through its real `cordis.yml` and snapshots the repository skill's logged model catalog row.
