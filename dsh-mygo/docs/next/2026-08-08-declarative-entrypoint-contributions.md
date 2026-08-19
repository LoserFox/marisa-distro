# Agent Note: Declarative entrypoint contributions for bundles

Status: proposed

English | [中文](2026-08-08-declarative-entrypoint-contributions.zh.md)

## Problem

A bundle today contributes to a shared extension point in exactly two ways, and both are the wrong shape for one common case.

- **Imperative registration**: the plugin's `apply` calls `ctx.tools.register(...)` or an equivalent registry. This works for code-backed contributions, but forces every contribution — including purely static ones like "mount this skill root" or "add this compaction strategy descriptor" — to ship executable plugin code, and the contribution's provenance exists only at runtime.
- **Patch-row config**: the user (or a bundle layer) edits the owning row's `config` in a `cordis.patch.yml` layer. This is declarative, but it addresses a *row*, not an *extension point*: the contributor must know the owner's row id and config schema, and two bundles contributing to the same point collide on last-write-wins instead of both landing.

What is missing is a **many-to-one declarative contribution channel**: any bundle declares in its own manifest "I contribute this value to extension point `K`", and the owner of `K` — and only the owner — decides what a contributed value becomes. Without it, extension-point authors invent per-key config plumbing, contributors run code for static data, removal of a bundle does not reliably withdraw its contributions, and inspection cannot answer "who contributes to `K`" without booting the composition.

Fabric Loader's entrypoint mechanism is the working precedent: any mod may define an entrypoint key, any other mod contributes under that key in `fabric.mod.json`, and `FabricLoader.getEntrypoints(key, type)` aggregates them in one typed list. That single mechanism is responsible for most of the Fabric ecosystem's decoupling — `fabric-api` defines keys, thousands of mods contribute without a compile-time edge to each other. The analysis that motivates this note is a read of `fabric-loader`'s `FabricLoader`/`EntrypointStorage`/`LanguageAdapter` surfaces against the 0806 profile/bundle/patch-layer plugin manager.

## Proposal

Add a manifest-declared contribution section and one aggregation service. Three parts, all additive.

### Manifest: `dsh.bundle.entrypoints`

`DshBundleManifest` (`packages/ui/app-boot/src/profile.ts`) gains an optional section:

```jsonc
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml",
      "entrypoints": {
        "skill:roots": ["./skills"],
        "compact:strategies": [
          { "value": { "id": "prune-reads", "priority": "late" } }
        ]
      }
    }
  }
}
```

A contribution is a string or a single-key `{ value }` object — **static data only**. No module specifiers, no code references: executable contributions keep going through plugin code (`apply`) or the [static repository Plugin format](../../implemented/architecture/2026-07-30-static-repository-plugin-format.md)'s fixed wrapper. This is the deliberate hardening of Fabric's `LanguageAdapter`, which instantiates arbitrary classes from manifest strings; the harness security stance does not admit that, and nothing in the motivating use cases needs it.

### Aggregation: `ctx.entrypoints`

One Cordis service, living in `plugin-manager` (or a small standalone cordis plugin until that lands):

```ts ignore-check
interface Entrypoints {
  define<T>(key: string, adapt: (value: unknown, ctx: Context) => T): void
  get<T>(key: string): readonly Contribution<T>[]
  keys(): readonly string[]
}

interface Contribution<T> {
  value: T              // adapted value, ready to use
  raw: unknown          // the manifest declaration
  provider: string      // contributing bundle's package name
}
```

- **Keys are owned.** The plugin that defines key `K` registers its `adapt` function through `define`. This is the per-key, harness-safe analogue of Fabric's global adapter registry: instantiation logic lives with the key's owner, not with a string-notation convention. Contributions under an undefined key are inert — held, listed in inspection, never adapted — matching Fabric's treatment of unknown keys.
- **Order is the profile's layer order.** `get(key)` returns contributions in `dsh.profile.bundles` order, then the user's own layer. Deterministic by construction — the same guarantee the [permission and ordering note](../../implemented/architecture/2026-08-05-plugin-permission-levels-and-transform-ordering.md) derives for listener order, here free, because composition already has a total order and Fabric's discovery-order problem does not exist.
- **Contributions are fiber effects.** A bundle's contributions register when its layer composes and withdraw when the layer is removed; an HMR layer swap withdraws and re-adds atomically with the bundle, and a failed compose keeps the last-good contribution set — the same transactionality `repository-plugins` already has for its source list.

### Relationship to `provides` / `requires`

The [hot-plug plugin API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md)'s `provides` declares a capability the plugin *owns* and others *depend on* — a one-to-many service edge. `entrypoints` is the dual: a many-to-one contribution edge into a point someone else owns. A compaction-strategy bundle does not provide a service other plugins inject; it contributes one row to the `compact:strategies` table the compact plugin owns. Neither mechanism expresses the other; v1 of this note covers only the manifest-declared, static-data form, and managed plugins under the hot-plug API gain the same `entrypoints` section when both land.

## Alternatives considered

**Keep imperative registration only (status quo).** Rejected: it forces code for static data, hides provenance until runtime, and makes contribution withdrawal the plugin author's responsibility rather than the runtime's. Every extension point in the tree today (`ctx.tools.register`, skill roots, MCP server lists) is a bespoke instance of the same missing primitive.

**Patch-row config arrays.** Rejected as the contribution channel: patch rows address a row's whole `config` with last-write-wins, so two bundles cannot both contribute to one point without the user hand-merging a layer. Patch layers remain the *user override* story; this note is the *bundle author* story.

**Cordis events as the contribution channel.** Rejected: events are ephemeral dispatches with no persistent, inspectable contributor set, and ordering would inherit registration-order nondeterminism. Contributions are state, not dispatches.

**Port Fabric's global `LanguageAdapter` registry verbatim.** Rejected: it instantiates arbitrary classes from manifest strings, which contradicts the import-free wrapper stance of the [static repository Plugin format](../../implemented/architecture/2026-07-30-static-repository-plugin-format.md). The per-key `adapt` owned by the key's definer keeps the decoupling without admitting string-driven code loading.

## Acceptance criteria

- A fixture bundle declaring `dsh.bundle.entrypoints` contributes values that surface through `ctx.entrypoints.get(key)` in profile layer order, attributed to the bundle's package name; no plugin code runs for the contribution.
- Removing the bundle from `dsh.profile.bundles` (or an HMR layer change dropping it) withdraws exactly its contributions; a failing compose leaves the previous contribution set untouched and broadcasts the existing `hmr/config-update-failed` signal.
- Contributions under a key with no `define` are visible through `keys()`/inspection and are never passed to any `adapt`.
- `dsh plugin add` of a bundle whose manifest declares `entrypoints` needs no reconcile change: the section rides the existing bundle declaration, and the CLI's bundle detection (`dsh.bundle.patch`) is unaffected.
- The contribution set is inspectable without booting the composition: a `dump-config`-family command lists keys, raw values, and providers from the profile manifest stack alone.

## Risks

- **Two ways to contribute one thing.** After this lands, a static contribution can be declared in `entrypoints` *or* written as imperative registration in `apply`. The mitigation is convention, not enforcement: manifest-declared is the documented default for static data, and extension-point owners stop accepting imperative registrations for what their key covers. Accepting duplication as a lint-level concern is the price of not breaking existing plugins.
- **Key squatting and namespacing.** Fabric keys are informal strings and collisions happen across mods; the same hazard exists here. v1 adopts the `owner:suffix` convention by documentation only, with no registry — a centralized key registry would recreate the coupling the mechanism exists to remove.
- **Static-data-only may prove too narrow.** The first contribution that legitimately needs a function (e.g. a scoring callback) cannot be expressed. That is intentional pressure toward the managed-plugin path rather than a hole to patch with string code references; if the pressure proves constant, the follow-up is a `definePlugin`-mediated contribution form, not a `LanguageAdapter` port.
- **Adapt runs at compose time.** A throwing `adapt` fails the compose of the contributing layer; the failure attribution (which bundle, which key, which value) must be in the error, or debugging a third-party bundle becomes guesswork.
