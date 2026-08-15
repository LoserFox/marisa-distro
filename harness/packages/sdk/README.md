# SDK packages

English | [中文](README.zh.md)

This group contains developer tooling for Harness projects and the client stack for driving a Harness runtime from another process.

| Package | Role |
|---|---|
| [`helper/`](helper/README.md) | Provides the shared project-editing domain |
| [`scripts/`](scripts/README.md) | Provides the `dsh-sdk` project commands |
| [`create-sdk/`](create-sdk/README.md) | Creates new SDK projects |
| [`sdk-protocol/`](sdk-protocol/README.md) | Defines the SDK runtime wire protocol |
| [`sdk-client/`](sdk-client/README.md) | Drives a Harness runtime through the TypeScript client API |
| [`telemetry/`](telemetry/README.md) | Provides launcher telemetry, consent, and redaction primitives |

`@deepseek-ai/create-sdk` follows npm's scoped initializer naming convention; the other packages follow the repository's `@deepseek-ai/dsh-*` convention. See the [developer-project workflow](../../.agents/notes/proposed/feature/2026-07-14-sdk-developer-projects.md), [project-editing architecture](../../.agents/notes/proposed/architecture/2026-07-15-sdk-project-editing-architecture.md), and [TypeScript SDK design](../../.agents/notes/implemented/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md).
