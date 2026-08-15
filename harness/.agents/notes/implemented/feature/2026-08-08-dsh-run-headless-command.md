# Agent Note: `dsh run` owns one-shot headless execution

Status: implemented

English | [中文](2026-08-08-dsh-run-headless-command.zh.md)

## Problem

The product launcher attached optional task text to its generic profile boot: `dsh --profile headless "task"`. That made one argv shape mean either a long-lived profile or a one-shot run according to a row discovered only after composition. The parser's `ProfileInvocation` carried optional task state, help presented a profile implementation detail as the user command, and a custom profile could accept a task only through the same overloaded root.

The former `dsh -p` spelling was already absent from the parser, so restoring it or detecting it specially would add compatibility machinery to a pre-release interface. A separate application-file proposal also used the `run` verb, leaving two incompatible owners for one top-level command.

## Decision

One-shot execution owns an explicit grammar:

```text
dsh run [--profile <name>] [--patch <path>...] <task...>
```

`--profile` defaults to `headless` and remains available for custom one-shot compositions. `--patch` is repeatable and occupies the existing overlay layer. Commander joins the variadic task arguments with spaces and rejects a missing or blank task before boot.

The [profile plugin bundle decision](../architecture/2026-08-05-profile-plugin-bundles.md) owns the composition selected by this grammar.

`RunInvocation` is a separate `DshInvocation` member. The generic profile invocation no longer carries task text, and its root command accepts no positional arguments. Both dispatch paths call the existing deep `runProfile` module: `profile` omits `task`, while `run` supplies it. There is no shallow `run.ts` forwarding module and no alias, warning, or custom detector for former spellings; they fail through the ordinary Commander grammar. A one-shot profile without `headless-runner` still fails through the existing composed-row check, while booting a profile that contains that row without a task points to `dsh run --profile <name> "<task>"`.

The `run` verb belongs to one-shot task execution. Launching an application file must choose another command name; two top-level meanings selected by positional shape would recreate the ambiguity this command removes.

The runner's user-visible contract stays the same: a fresh persisted session, browser observation URL on stderr, final assistant text on stdout, completed/non-completed exit mapping, and bounded signal shutdown. The product-level keyless acceptance exposed that the in-process mux consumer could lag the same-process `agent/status: idle` notification and derive output before reading the final frames. The idle notification now captures the authoritative final session sequence, and the runner waits until the ordered mux reaches that boundary (or the stream ends) before deriving text and exit reason. This enforces the existing idle-to-idle contract without adding a wire field or a timing delay.

## Alternatives considered

- **Keep task text on `dsh --profile`.** Rejected because profile boot and one-shot execution remain one grammar whose meaning depends on a late composition check.
- **Preserve `dsh -p` or the positional profile form as aliases.** Rejected under the pre-release stance: compatibility branches would outlive the interface they were meant to retire.
- **Make `--profile headless` mandatory under `run`.** Rejected because the shipped one-shot surface should have the shortest canonical spelling, while optional `--profile` preserves plugin-defined one-shot compositions.
- **Give `dsh run` to application-file launch and choose another headless verb.** Rejected because `run` describes executing a task through the harness; application-file ownership would make the product's primary one-shot command less direct and collide with custom one-shot profiles.
- **Add `apps/cli/src/run.ts`.** Rejected because it would only forward to `runProfile`, splitting command ownership without hiding any complexity.

## Consequences

This is an intentional breaking CLI change. Documentation, help, parser tests, built-bin acceptance, PTY shutdown coverage, and the assembled keyless snapshot use `dsh run`. Existing custom one-shot profiles keep working through `--profile`; long-lived profiles and config dumps retain their existing root grammar. The competing application-file command must be renamed and rebased separately rather than sharing or overloading `run`.
