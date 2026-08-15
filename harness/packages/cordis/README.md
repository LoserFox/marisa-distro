# packages/cordis — Cordis runtime integration

English | [中文](README.zh.md)

Plugins that integrate Harness-owned formats with the Cordis runtime: the self-referential model toolset and the restricted repository Plugin runtime.

| Package | Role | ctx key |
|---|---|---|
| [`tool-cordis/`](tool-cordis/README.md) | Model-facing runtime inspection and temporary-plugin tools | registers on `ctx.tools` |
| [`repository-plugin/`](repository-plugin/README.md) | Repository skill and MCP composition | registers a Loader builtin |
