# Agent Note: Profile plugin bundles replace the fixed surface overlays

Status: implemented

English | [中文](2026-08-05-profile-plugin-bundles.zh.md)

## Problem

The `dsh` launcher hardcoded its compositions: `base.cordis.yml` + `web.cordis.yml` shipped inside `apps/cli`, three bespoke entry modes (`--config`, `web`, `-p`) each with its own layer stack, and a single global personal overlay (`$DSH_HOME/config.yaml`). There was no way to install an out-of-tree plugin (a TUI, a provider pack) into a shipped surface without editing the repository, and no place where a third-party package could contribute a default composition.

## Decision

Everything becomes a **profile**: a directory `$DSH_HOME/profiles/<name>` with a `package.json` (pnpm-managed out-of-tree plugin `dependencies` plus the profile manifest `dsh.profile` with its ordered `bundles` layer list) and a user `cordis.patch.yml`. A **bundle** is an npm package declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the two manifest kinds live under distinct `dsh.profile` / `dsh.bundle` keys so a package.json states which role it plays. The tree composes over an empty root by applying each bundle's patch in `dsh.profile.bundles` order, then the user layer, then `--patch` overlays, then flag patches — one `applyEntryPatches` call, identical for boot, flag derivation, and `--dump-config`.

The shipped compositions became bundles: `@deepseek-ai/dsh-base` (the former base rows as one insert), `@deepseek-ai/dsh-web-app` (the former web overlay plus a runtime glue plugin that owns what used to be launcher code — frontend-dist resolution, the web-surface prompt section, bash runtime variables, the URL line), and `@deepseek-ai/dsh-headless` (a one-shot runner plugin over base + web-app). `dsh web` stays as an alias for `--profile web` carrying the Web flag family; `dsh run [--profile <name>] "task"` owns one-shot execution and defaults to the headless profile, while generic `dsh --profile <name>` boots without a task; `dsh --config` is removed (its uses migrate to `--patch`). `dsh plugin --profile <name> <args...>` is a thin pnpm forwarder that initializes the profile and reconciles `dsh.profile.bundles` after `add`/`remove` (a bundle-less package warns and stays a plain dependency).

The [`dsh run` command decision](../feature/2026-08-08-dsh-run-headless-command.md) owns the one-shot grammar; this note owns the profile composition it selects.

Resolution is two-anchored by construction: `dsh.profile.bundles` names resolve from the dsh installation first, then the profile directory — so in-box bundles always come from the same installation as the running `dsh` and pnpm never manages them — while bare plugin names in patch rows resolve through the profile directory's Node parent-walk into the maintained flat fallback `$DSH_HOME/profiles/node_modules` (one symlink per package the installation's app and bundles depend on, healed on every launch).

Two supporting refactors: the webserver's built-in static dist serving became the single-owner **fallback seat** (`registerFallback`/`applyIndexTaps`), with the SPA server extracted to `@deepseek-ai/dsh-frontend-static` so the web bundle owns its dist as composition, not launcher code; and the personal-overlay machinery of the [dsh CLI personal-config decision](../feature/2026-07-20-dsh-cli-personal-config.md) (`loadPersonalPatches`, `$DSH_HOME/config.yaml`) was retargeted to the per-profile and home-level `cordis.patch.yml` layers (`loadOptionalPatches`, `watchUserPatches` taking a filename), superseding that note's entry modes and file location while keeping its Harness-home root, patch semantics, and fail-loud parsing.

## Alternatives considered

- **Dependency-scan plus partial `patchOrder`** (the original sketch): scanning `dependencies` for bundles and ordering unlisted ones alphabetically has two sources of truth and an implicit tie-break; one explicit ordered `dsh.profile.bundles` list is smaller and fully deterministic. A raw `pnpm add` inside the profile installs a library without activating any patch — explicit, no spooky scan.
- **`link:` entries for in-box bundles**: pnpm cannot version, install, or update a `link:` into the installation, it embeds a machine path in a user file, and it breaks when the installation moves. The two-anchor resolution plus healed symlink fallback gives the same guarantee ("bundles come from the installation") without ceremony.
- **A pre-boot `context` module in the bundle manifest** for boot-time values (dist path, flag facts): rejected in favor of pure plugins — the glue is ordinary rows the launcher patches, so the composition stays fully dumpable and the manifest stays data-only. The launcher-owned `ctx.headlessIo` seam is the one host-provided slot, and it is provided in `boot()`'s `prepare` hook, before any config-tree entry mounts.
- **Transitive bundle auto-application**: only direct `dsh.profile.bundles` entries contribute layers; a meta-bundle wanting to re-export another bundle's patch must do so explicitly in its own patch file.

## Consequences

- New composition surfaces (a TUI, provider packs) ship as ordinary npm packages installable per profile; the repository no longer needs a row for every deployment shape.
- `apps/cli` shrank to argv parsing, profile machinery consumption, and the pnpm forwarder; `AppCLIEntry` and the per-surface boot paths are gone.
- The keyless web e2e scaffold boots the same bundle layers over the same empty-root shape as production, including the profiles module fallback, so composition drift between test and product fails loudly.
- Backends reject nothing old on disk (pre-release stance): `$DSH_HOME/config.yaml` is simply no longer read.
