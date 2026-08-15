# Agent Note: Oxlint as the repository linter

Status: implemented

English | [中文](2026-07-29-oxlint-linter.zh.md)

## Problem

The repository needs type-aware TypeScript correctness rules, consistent formatting, and file-local duplicate-logic checks across its owned source. ESLint supplied those checks through a JavaScript parser, a project service, and multiple plugins, but a clean lint run spent about one minute on the local migration baseline and required an 8 GiB Node heap, CI result caches, and separately tuned ESLint concurrency.

A faster runner cannot justify losing rules. The migration must preserve the strict type-checked preset, repository overrides, inline suppressions, @stylistic fixes, SonarJS checks, host/client TypeScript separation, and the vendor exclusion.

## Decision

The root [`.oxlintrc.json`](../../../../.oxlintrc.json) is the authoritative type-aware repository lint configuration. The project-free [`.oxlintrc.staged.json`](../../../../.oxlintrc.staged.json) profile inherits its source rules but disables type analysis for the bounded pre-commit path. The `lint` package script, gate scheduler, CI, and lefthook invoke Oxlint through [`scripts/run-oxlint.ts`](../../../../scripts/run-oxlint.ts); `lint:fix` and lefthook first invoke the formatting-only [`eslint.format.config.mjs`](../../../../eslint.format.config.mjs). The direct `eslint` and `@typescript-eslint/parser` development dependencies exist only for this parser-without-project formatting pass; their exact versions pin the tested parser/fixer pairing, and that config contains no correctness or type-aware rules.

`options.typeAware` enables `oxlint-tsgolint`. Its backend performs per-file TypeScript-project discovery: package sources use their package projects, host tests/examples/website use `tsconfig.host.json`, and client tests plus `scripts/client-bundle-purity.spec.ts` use `tsconfig.client.json`. The program-less root solution is never flattened. Oxlint's `--tsconfig` override affects import resolution but is ignored by type-aware linting, so this repository does not set it. The configuration explicitly carries the migrated strict-type-checked rules and repository overrides instead of enabling broad Oxlint categories whose contents may change. `typescript/no-unnecessary-condition` remains enabled from Oxlint's nursery set because it was an enforced repository rule before migration.

Oxlint's JavaScript-plugin compatibility layer runs `@stylistic/eslint-plugin` and `eslint-plugin-sonarjs` so the existing formatting and file-local duplicate-logic rules remain enforced. The compatibility layer reports `@stylistic` violations but does not execute their fixers, so the formatting-only ESLint pass owns only the corresponding auto-fixes; an executable parity check keeps those fixable rule definitions aligned while `max-len` remains validation-only. Owned-source suppressions use `oxlint-*` directives and the `typescript/*` namespace, and unused directives remain warnings; vendored sources keep their upstream directives because Oxlint excludes `vendor/**`.

CI does not restore or save a lint-result cache. `DSH_OXLINT_THREADS` makes the shared runner pass the same bound to Oxlint's `--threads` option and the type-aware backend's `GOMAXPROCS` environment variable; ordinary local runs use both defaults. Pre-commit applies the formatting-only ESLint fixes, runs project-free Oxlint validation and native safe fixes, accepts selections containing only ignored files, and re-stages the result through lefthook. Public `lint` and CI retain the complete type-aware rules after preparing generated declarations.

## Verification

The migrated configuration reports the same clean owned-source baseline after resolving two analyzer differences: one redundant test assertion was removed, while one structural cast required by `tsc` carries a narrow Oxlint suppression. A one-time audit against the exact deleted ESLint configuration blob established source 88-to-88, examples 87-to-87, and tests 83-to-83 after the rule-name translations. The committed fingerprint pins those audited Oxlint profiles and the complete override shape; it neither executes the deleted configuration nor propagates later upstream preset changes. Evaluating `typescript-eslint@8.61.0` also confirms that `strictTypeChecked` did not enable `@typescript-eslint/no-empty-function`; the deleted tests-only `off` entry was inert.

Executable contract tests require type-aware diagnostics from the package, host, and client projects; assert the client-only script's project; reject unmatched fallback analysis; and exercise the Stylistic, SonarJS, and nursery compatibility paths. They also pin the staged profile's project-free inheritance, unused-suppression reporting, ignored-only staged selections, formatter/validator rule parity, and final formatted bytes. Runner tests pin both worker controls, and typecheck confirms that migration-driven source edits preserve the TypeScript programs.

## Alternatives considered

**Run both linters repository-wide.** Every correctness rule is available through Oxlint's native rules, nursery rule, or JavaScript-plugin compatibility layer. A repository-wide ESLint fallback would preserve the slower project-service setup and two correctness configurations without adding a check; the retained ESLint pass is deliberately limited to project-free staged formatting.

**Rely on compatibility-layer fixes.** The layer reports the established `@stylistic` rules but does not apply their fixes under either Oxlint fix mode. Keeping the narrow staged formatter preserves the contributor contract without broadening ESLint back into a repository linter.

**Drop @stylistic or SonarJS rules that are not native.** This would remove dependencies but weaken the mechanical quality contract. The compatibility layer preserves those rules until native replacements can be evaluated as a separate decision.

**Replace @stylistic with Oxfmt during the migration.** A formatter migration would change output beyond the lint-engine boundary and create a repository-wide formatting diff. Keeping the established rules makes this change reviewable and leaves formatter selection independent.

## Consequences

Local migration measurements reduced a clean type-aware lint run from about 61 seconds to about 8 seconds without a result cache. The exact ratio is host-dependent and is not a performance guarantee.

Type-aware diagnostics now come from the TypeScript Go analyzer bundled through `oxlint-tsgolint`, so edge-case inference can differ from typescript-eslint even when `tsc` accepts the same program. Lint and typecheck remain separate required evidence.

The JavaScript-plugin compatibility API, staged profile, and staged formatter are additional boundaries to maintain. Commits defer type-aware diagnostics to public lint and CI, pay one project-free ESLint startup before Oxlint, and avoid depending on generated declarations. The root development graph retains ESLint plus the TypeScript parser. Repository-wide validation, type-aware analysis, cache policy, worker control, and inline directives remain Oxlint-owned.
