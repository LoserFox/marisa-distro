# acp/ — Agent Client Protocol automation

English | [中文](README.zh.md)

The ACP group exposes harness agents to programmatic clients. It is an interoperability transport, not a presentation or human-interaction layer.

| Package | Role |
|---|---|
| [`acp/`](acp/README.md) | Automation-only ACP server. |

The matching out-of-process subagent client remains in [`subagent/subagent-acp`](../subagent/subagent-acp/README.md) because it implements the subagent provider interface; arbitrary ACP clients may drive the same server contract.
