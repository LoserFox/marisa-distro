# Agent Note: Session model selection in the Web composer

Status: implemented

English | [中文](2026-07-24-web-session-model-selector.zh.md)

## Problem

The Web conversation displayed and sent through the Host's fixed provider/model route without exposing that route or letting a user change it. The TUI already had a session-local route target, but copying its presentation or hardcoding DeepSeek models in the browser would split model discovery and step-boundary semantics across front doors. A switch made while a response is running also needs one atomic boundary: prompt variables and request routing cannot observe different targets.

## Decision

The Web Host reuses `installAgentLlmTarget` for every created or resumed agent. The provider/model/reasoning target starts from the latest `request/header` when the session has used a model, otherwise from the Host default route. `session.selectModel` changes the session-local mutable target, and prompt assembly captures it with request routing; a switch during a running step therefore applies to the next assembled step. The next consumed target persists through the existing full `request/header` snapshot, while a choice that has not reached a request remains process-local.

The session RPC domain exposes a `session.models` directory and `session.selectModel`. The directory is built dynamically from the LLM registry and grouped by provider; each listed model's exact metadata adds adapter-owned reasoning effort ids, names, descriptions, and optional default. Provider catalogs and exact metadata load concurrently by provider and fail independently, so successful groups remain usable alongside retryable failure records. Catalog membership stays advisory: `session.models.current` is returned independently and can remain routable when absent from every group, but the Host does not synthesize an unlisted row after its provider stops advertising it. The two surfaces answer that state differently on purpose: the TUI still renders the unlisted current model as its own row and marks it current, while Web shows the unset trigger label and asks for a replacement. Web is the surface where a catalog is edited, so a target the user just deleted should read as a decision to make rather than a selection to keep; the TUI, which only picks from what exists, has no such edit to reconcile. The cost is real and accepted — a Web composer showing the unset label can still send to the routed target — and the divergence is deliberate, not a missed migration. Exact resolution decides whether a route and explicit effort are available. Selection uses `resolveCallConfig` to reject unsupported effort ids and materialize an adapter-configured default before updating the target.

The browser `ModelService` owns one `ModelDirectory` per live session. Its snapshot contains the current complete target, grouped catalog, provider failures, operation error, and `idle`/`loading`/`ready`/`selecting`/`error` state. Mounting primes the trigger label and each menu open refreshes the directory. Directory and selection calls share an operation generation so older responses cannot replace a newer result; connection reset discards the process-local projection before restoring the Host target. Failures retain the previous current target and usable groups.

`@deepseek-ai/dsh-client-ui-conversation` declares the session-scoped single slot `conversation.input.model` as a child of its composer-bar entry. InputBar renders the seat in its trailing controls immediately before the pending indicator and primary button; the seat receives the bar's `locked` owner prop and session scope. `@deepseek-ai/dsh-client-ui-model` occupies that seat and also contributes `/model` over the same directory. Its compact trigger displays the exact catalog model name and effective reasoning label. When the current target is absent from the groups, the trigger instead displays `Select model`, the model list marks no row active, and the Effort row stays absent; choosing a listed model replaces the complete target through the existing selection path. The upward menu otherwise first offers Model and Effort; Model drills into provider groups, while Effort drills into the adapter-ordered levels. The provider-default row appears only when the adapter does not configure a model default.

The production browser roster is assembled from `apps/cli/config/base.cordis.yml` plus `apps/cli/config/web.cordis.yml`; the model feature is one `dshClient` row rather than a package hardcoded in Web boot code. Its package manifest orders it after the runtime and command feature, while Cordis service injection waits for the conversation slot before registering the composer occupant.

## Alternatives considered

**Use separate provider and model dropdowns.** The model list depends on the provider and repeats a two-stage interaction for every change. One grouped menu keeps the provider visible as organization without lengthening the trigger or each row.

**Hardcode the current DeepSeek catalog in the Web client.** This would drift from registered adapters and exclude deployment-owned providers. The LLM registry remains the source of provider and model metadata, including partial lookup failures.

**Keep `High`/`Max` as client-local UI state.** Static DeepSeek labels cannot represent `off`, pi-ai provider vocabularies, adapter defaults, validation, resume, or the next provider request. Exact-model metadata owns the selectable vocabulary, and the session target owns the selected id.

**Make the selection a global default.** A global mutation would unexpectedly redirect other open conversations. The target belongs to one live session, while Host configuration remains the default for sessions without a logged request.

**Reject changes while an agent is running.** The shared atomic target already separates the assembled step from the next selection. Keeping the selector available lets the user prepare the following step without altering the in-flight request.

**Persist every click as a new session event.** A choice is not model-visible until prompt assembly consumes it. Persisting unused UI intent would add a durable event that does not reconstruct a model request; the existing `request/header` records the first request that actually uses the route.

## Consequences

Any Host-backed Web conversation, including a blank session, can switch among dynamically discovered provider groups and adapter-owned reasoning levels without displaying duplicated `provider/model` labels. The current consumed target survives resume and reconnect; catalog names remain presentation-only, while selection and persistence use provider/model/effort ids. A provider catalog or exact-metadata outage degrades only that group. Route changes can reduce provider-side cache reuse, but the selector adds no prompt content and does not disturb the in-flight step. A model without reasoning metadata has no Effort row.

## Testing

Host tests pin grouped discovery, catalog and exact-metadata failure isolation, logged effort restoration without stale-row injection, advisory unlisted selection, unsupported effort rejection, default materialization, and next-assembly switching. Client tests pin the shared directory, reconnect restoration, and complete-target submission. Component tests pin dynamic effort labels, descriptions, provider-default exposure, effort submission, and the `Select model` fallback for a removed row. The keyless built-app fixture loads the production model plugin, selects OpenAI's GPT-5 and its Max effort, sends a turn, and verifies that the next generated response reports both ids; the DeepSeek configuration fixture removes the active catalog row and pins the fallback before choosing a replacement.
