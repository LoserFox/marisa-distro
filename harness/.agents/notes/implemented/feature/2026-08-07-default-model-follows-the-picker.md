# Agent Note: the default model follows the picker

Status: implemented

English | [中文](2026-08-07-default-model-follows-the-picker.zh.md)

## Problem

The route a new session started from was frozen into the gateway's composition entry (`api-gateway` in the web-app bundle patch). Switching models in a conversation reached that conversation only: the next session went back to the shipped default, and the only way to change it was to hand-edit a `cordis.yml` row and restart. There was no user-settings tier between the composition and the per-session choice.

## Decision

`ApiProxyService` registers its `{provider, model, reasoningEffort?}` slice as the `api-gateway` settings section: the composition entry is the `base` layer and `settings.yaml` layers the user's choice over it. `workspaceRoot` stays outside the section — a launcher fact, not a preference. `reasoningEffort` is the mirror case: it lives in the section but NOT in the plugin config, because the seam merges the user layer over the composition entry per field and an absent key cannot override a present one. A composition-set effort would therefore survive every later switch to a model without one — precisely the stranding the wholesale `replace` exists to prevent. Effort is a per-model fact anyway; a deployment default for it belongs on the adapter profile, which resolves per model.

`session.selectModel` records an accepted switch as the new default. There is no separate gesture: switching models in the composer IS how the default is chosen. The write is `replace`, not `update` — switching to a model with no reasoning effort has to clear a stored one, and a merged patch would strand it for the next session to fail on. A storage failure is logged without undoing the switch, which already applies to its own session, and a deployment with no settings provider keeps the entry with the switch staying process-local.

`ApiProxyDefaults` carries `defaultTarget()` and `persistDefaultTarget()` closures instead of flat `provider`/`model` fields, so `createApiProxy` needs no knowledge of the settings seam.

`targetFor` resolves its tiers on **every** read rather than seeding a ref once: an explicit selection in this process, else the session's own latest logged `request/header`, else the live default. Both directions depend on the re-read. A session that has run a turn derives from its log forever after, so changing the default never retargets it. A session still blank starts from a default saved after it was created — which matters because New Session reuses a blank session rather than minting another, so a creation-time seed would show the superseded model in exactly the flow the feature exists for.

The stored route is not validated against the registry. A default naming a route the Models page has since removed still reaches `session.models` as `current`, matching no advertised group — which is what makes the composer seat's existing fallback prompt for a selection instead of naming a model the deployment cannot reach.

## Consequences

`ApiProxyDefaults` changed shape, updating ~40 test construction sites. `host.describe` now reports the live default rather than a captured one, which is what it always meant. `settings.yaml` gains an `api-gateway:` section the moment a user switches models; the `api-gateway` namespace is deliberately NOT added to the gateway's exposed-namespace allowlist, so the Settings page neither reads nor writes it — the model picker is its editor.

## Follow-up: blocking a session that cannot send

A default naming a route the Models page has since removed leaves the composer saying "Select model" while the input still accepts a message, which then fails inside the adapter mid-turn. Two changes close it.

The Host refuses. `session.prompt` checks whether an adapter serves the session's route and answers `model-unavailable` before opening a turn. This is the enforcement boundary: a client that disables its composer is an affordance, and the method stays callable regardless.

The composer goes inert. `session.models` reports `routable`, and ui-model pushes a block through the new `ctx.conversation.blocks` registry; the bar renders the same disabled textarea it already renders without a workspace, with the blocker's own localized reason as the placeholder — except the model seat, which a block deliberately leaves live, because choosing a model is how the user clears it. The push direction is forced — ui-model already depends on ui-conversation, so ui-conversation cannot read it back.

The gate is `routable`, NOT "the current target matches no advertised group". Catalog membership is advisory by design: a route serving a model it stopped advertising is absent from the groups yet perfectly usable, and blocking there would break a supported configuration (a narrowed `models` list over a live route). `routable` is also three-valued on the client — `null` before the first load or after a failed one never blocks, so a slow or unreachable Host cannot lock a working composer.

## Alternatives considered

- **Falling back to the composition entry when the stored route is unregistered.** Rejected: the composer would then name the shipped DeepSeek model instead of prompting, which is both a silent switch to a provider the user did not pick and the opposite of the requested behavior.
- **Validating and clearing a stale default.** Rejected: catalog membership is advisory by design (`buildModelCatalog` documents it), so an adapter may serve a model its own catalog stopped advertising; self-healing would break that deliberate case.
- **A `settings.update` merge patch.** Rejected: it cannot clear `reasoningEffort`, so a switch from a reasoning model to a plain one leaves an effort the next session fails on.
- **Persisting only from blank sessions.** Rejected: the most informative switch is the one made mid-conversation after seeing a model underperform, and that one would never be saved.
- **A separate "set as default" affordance.** Rejected for now: it adds a second gesture for what every comparable product infers from the switch itself. The cost is that a temporary switch in an old session also moves the default.
