# Agent Note: Bundle compatibility constraints with readable reports

Status: proposed

English | [中文](2026-08-08-bundle-compatibility-constraints.zh.md)

## Problem

The 0806 plugin manager resolves *packages* and never checks *plugins*. pnpm picks versions, `reconcilePlugins` (`apps/cli/src/plugin.ts`) joins any installed package declaring `dsh.bundle.patch` into the layer stack, and composition applies whatever the stack contains. Nothing can express — or enforce — "bundle A ≥ 2.0 must not run next to bundle B < 1.5". The failure modes all surface late:

- A missing Cordis service at boot, attributed to an `inject` edge but not to the actual cause (the installed companion bundle is too old).
- Undefined outcomes from the class of conflicts the [permission and ordering note](../../implemented/architecture/2026-08-05-plugin-permission-levels-and-transform-ordering.md) enumerates — two bundles rewriting the same `agent/request` field — where one bundle's author *knew* the combination was broken and had no way to say so.
- Silent misbehavior: both bundles load, no error exists to report, and the user bisects their layer stack by hand.

Fabric Loader's answer to the same problem is the reference point: a five-level dependency vocabulary (`depends` / `recommends` / `suggests` / `conflicts` / `breaks`) checked by `ModSolver` before launch, with `ResultAnalyzer` turning a violated constraint into a human-readable chain — which mod, which constraint, which installed version. The load *fails* with an explanation instead of proceeding into an undefined state.

One apparent obstacle is already settled in our favor. The [hot-plug plugin API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md) resolved its capability question as "service ids only, no version ranges", with the revisit trigger "the first real cross-plugin versioned-contract consumer". This note does not reopen that: capabilities stay unversioned. But *bundles* are npm packages — they already carry real, resolved versions that pnpm picked. Bundle-level constraints are a versioned consumer of data that already exists, not a new versioning regime.

## Proposal

Two manifest fields on the bundle declaration, checked at three enforcement points, with **validation only — never solving**.

### Manifest: `dsh.bundle.requires` / `dsh.bundle.breaks`

`DshBundleManifest` (`packages/ui/app-boot/src/profile.ts`) gains:

```jsonc
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml",
      "requires": { "@deepseek-ai/dsh-base": ">=0.4.0" },
      "breaks":   { "acme/old-memory-policy": "<2.0.0" }
    }
  }
}
```

- `requires`: every entry must resolve to a bundle in the composed layer stack whose installed version satisfies the range.
- `breaks`: no entry may resolve to a bundle in the stack whose installed version falls inside the range.
- The version checked is the installed package's `package.json` version — the same resolution anchor `reconcilePlugins` already uses, so git/tarball/path installs participate identically.
- Only the two hard levels. Fabric's softer `recommends`/`suggests`/`conflicts` (warn-and-continue) are deliberately absent: a warning nobody acts on is worse than no warning, and a soft level can be added later without changing the hard-level semantics.

### Enforcement points

1. **Install** — `dsh plugin add`/`update`: after `reconcilePlugins`, validate the full stack's constraints against installed versions. A violation prints the report (below) and exits non-zero *after* pnpm has run; the profile is left with the new package installed but the violation stated plainly, because pnpm owns the filesystem and the check owns the verdict. (`--force`-style override is a CLI flag, recorded in the output.)
2. **Composition** — profile boot and HMR: a violating stack fails composition with the same report; under HMR the last-good tree is retained and the failure rides the existing `hmr/config-update-failed` broadcast, exactly as a malformed patch layer does today.
3. **Dynamic install** — when the [hot-plug plugin API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md)'s manager installs at runtime, the same validator runs against the live registry before the generation activates.

### The report

Violations render as a constraint chain, not an error code — the part of Fabric's design (`ResultAnalyzer`) worth copying most closely:

```
dsh: incompatible profile layers for profile "web"
  acme/memory-doctor@1.2.0  breaks  acme/old-memory-policy@1.4.3
    constraint: acme/old-memory-policy "<2.0.0"  (declared by acme/memory-doctor)
  acme/memory-doctor@1.2.0  requires  @deepseek-ai/dsh-base >=0.4.0
    installed: @deepseek-ai/dsh-base@0.3.1
```

Every line names the declaring bundle, the constraint text, and the installed offender. The check is cheap enough to run on every compose; the report is where the design budget goes.

## Alternatives considered

**pnpm `peerDependencies`.** Rejected as the primary mechanism: peer ranges produce install-time warnings pnpm itself has trained users to ignore, they cannot express "these two top-level bundles conflict" (peers are declared against a package you *depend on*, not a sibling layer), and they say nothing at composition or HMR time. Bundles may still declare peers for genuine library edges; this note covers the plugin-semantic layer pnpm cannot see.

**Runtime `inject` failure (status quo).** Rejected: a missing-service error names the service, not the incompatible pairing that caused it, and it cannot express breaks at all — two successfully-loaded bundles with broken combined semantics produce no error.

**Port Fabric's `ModSolver`.** Rejected: the solver *selects* versions, which is a package manager's job, and harness already has pnpm for it. The proposal takes only the constraint vocabulary and the report, and deliberately constrains itself to checking the versions pnpm already picked. The moment the checker starts proposing alternative versions it has become a second, worse package manager.

**Version ranges on capabilities (`provides`/`requires` service ids).** Rejected here, per the settled question in the hot-plug note: no semantics consumes a capability version today, and bundle-level ranges cover the actual failure mode — the unit users install, update, and conflict over is the bundle.

## Acceptance criteria

- A profile composing two bundles where one `breaks` the other's installed version refuses to boot with the chain report naming both bundles, the constraint, and the installed versions; the same violation introduced by an HMR layer edit retains the last-good tree and broadcasts `hmr/config-update-failed`.
- `dsh plugin add` introducing a `requires`/`breaks` violation prints the same report and exits non-zero; the override flag is documented in the CLI contract.
- A `requires` entry naming a bundle absent from the stack reports the absence distinctly from a version mismatch.
- Constraints ride the existing bundle detection unchanged: a package gains or drops constraints across versions and `reconcilePlugins`' installed-state logic neither special-cases nor breaks on the new fields.
- `dump-config`-family output for a profile includes the effective constraint set per layer, so the check's inputs are inspectable without composing.

## Risks

- **Two declarative sources can disagree.** pnpm may validly install a set the dsh check rejects (that is the check working), but the reverse — pnpm refusing what dsh would accept — belongs to pnpm's own peer machinery and will read as contradictory tooling when both fire. The CLI report must state which layer of machinery produced which line.
- **Range authorship quality.** Fabric's experience is that `breaks` ranges are written at discovery time and rot: a bundle declaring `breaks: { "x": "<2.0" }` never learns that x 3.0 fixed the incompatibility. Versioned constraints are claims by the declaring author about *other* people's software; the report format mitigates by always naming the declarer, making the blame legible when a stale range blocks a valid set.
- **Composition failure is now a normal install outcome.** Profiles that previously booted into a degraded state will refuse to boot. That is the point, but it converts silent misbehavior into visible breakage for existing user profiles the day the check ships — the migration note must say so, and the first shipped version should validate-and-warn at composition for one release before refusing.
- **No transitive semantics.** `requires` is checked against the flat composed stack, not resolved transitively; a bundle must not rely on a constraint declared by a bundle it requires. Documenting the flat-check rule is part of the contract, since Fabric users routinely assume transitivity that its solver provides and this design deliberately does not.
