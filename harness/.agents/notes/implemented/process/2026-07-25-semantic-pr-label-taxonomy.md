# Agent Note: Semantic pull request label taxonomy

Status: implemented

English | [中文](2026-07-25-semantic-pr-label-taxonomy.zh.md)

## Problem

Pull requests need two different signals: what kind of change they make and which repository domains they affect. A flat or broadly named label set conflates those questions, hides work in distinct areas such as `session` and `llm`, and gives reviewers and automation weak inputs.

The repository also gains new domains over time. Treating today's area labels as a closed set would force future work into inaccurate labels or a generic catch-all.

## Decision

Every open or merged pull request carries exactly one kind and every materially affected area. Closed pull requests that were never merged are outside the maintained historical corpus. Other operational labels may coexist, but they do not satisfy either dimension.

### Kinds

| Kind | Meaning |
|---|---|
| `feature` | Adds or intentionally changes behavior. |
| `bug-fix` | Corrects incorrect behavior. |
| `doc` | Makes documentation the dominant intent. |
| `testing` | Changes tests or testing infrastructure without changing product behavior. |
| `cleanup` | Preserves behavior while maintaining or simplifying the implementation or repository process. |

The kind records the change's dominant intent: accompanying tests and documentation do not turn a feature or bug fix into a testing or documentation change.

Areas record semantic repository domains rather than temporary initiatives, ownership, or every path touched incidentally. Area labels are not a hierarchy: a pull request may carry several when it changes distinct contracts, but an umbrella and a narrower label do not both describe the same work.

### Current areas

The 46 current areas are listed below. The group names organize the list for readability; they are not labels or another taxonomy level.

| Group | Areas |
|---|---|
| Agent and model | `agent`, `agent-loop`, `session`, `llm`, `model-context`, `compaction`, `tools`, `persistence` |
| Orchestration | `subagent`, `workflow`, `planning`, `tasks`, `schedule`, `telemetry`, `storage`, `workspace` |
| Capabilities | `bash`, `subprocess`, `pty`, `filesystem`, `lsp`, `skills`, `web-search`, `code-mode`, `artifact`, `attachment`, `sandbox`, `mcp`, `hooks`, `cordis` |
| Interfaces | `ui`, `gui`, `tui`, `acp`, `json-rpc`, `cli`, `python-sdk`, `vscode`, `website` |
| Repository and release | `dev-infra`, `ci`, `build`, `dependencies`, `platform`, `i18n`, `release` |

`gui` covers browser and Electron graphical applications, including standalone graphical developer tools; `vscode` remains the editor extension integration. `ui` covers shared cross-interface commands, approval interaction, presentation, and app boot; it coexists with `gui`, `tui`, or a protocol area only when the pull request also changes that shared contract.

`tasks` owns background work tied to a running process, while `schedule` owns durable time-triggered jobs. `tools` owns generic registry, schema, and execution contracts; a concrete capability receives `tools` only when it changes one of those contracts. `attachment` owns durable media references and multimodal input delivery, while `artifact` owns model-declared deliverable identity and preview lifecycle; neither borrows `tools` or `ui` for its implementation parts.

Names follow semantic ownership rather than lexical resemblance. `hooks` means the Claude Code and Codex agent bridges, not local Git hooks; `platform` means product portability, not CI runner selection; and `build` means compilation, bundling, and built package artifacts, not documentation generators.

### Extensibility

The area set is intentionally extensible. Add an area when a recurring, meaningful repository domain is missing; do not add a label for one pull request, a temporary project, a status, or a person or team. Rename, split, or retire an area when the domain model changes, and update this list and the affected open and merged pull requests together.

The kind set stays narrow because kinds are mutually exclusive. A new kind requires a distinct change intent that cannot be represented by the current five; it is not a substitute for an area.

## Alternatives considered

- **One undifferentiated label set.** Rejected because kind and area answer different questions; mixing them makes the presence of one label say nothing about whether the other dimension was considered.
- **A fixed, closed area set.** Rejected because repository domains evolve. A closed set would preserve spelling at the cost of semantic accuracy.
- **One broad `core` area or package-derived labels.** Rejected because domains such as `session`, `llm`, and `agent` remain independently meaningful across package boundaries, while incidental file paths are not the scope reviewers or automation need.
- **Separate browser and desktop areas.** Rejected because browser delivery and Electron packaging expose one graphical client domain; splitting them classifies the delivery shell rather than the semantic work.
- **Broad implementation areas in place of a domain.** Rejected because a durable scheduled job is not a background task, an attachment is not merely its source interface or filesystem implementation, and an artifact is not merely its declaring tool or preview interface.
- **Umbrella and leaf areas for the same contract.** Rejected because duplicate labels inflate scope without adding information. Multiple areas remain correct when a pull request changes genuinely distinct contracts.
- **Exactly one area per pull request.** Rejected because coherent changes can legitimately span several domains, and dropping secondary areas hides affected contracts.

## Consequences

- Reviewers and automation receive one stable intent signal plus a complete semantic scope.
- `gui` queries cover browser and desktop delivery together, while `ui` queries retain only shared cross-interface contracts.
- `schedule`, `attachment`, and `artifact` queries identify those domains directly instead of approximating them through implementation dependencies.
- Selecting labels remains a judgment call: paths and title prefixes can suggest areas, but they cannot replace reading the change.
- Taxonomy changes carry maintenance work. Area additions, renames, splits, and removals update this decision record and backfill open and merged pull requests so historical queries keep their meaning.
