# packages/cordis — Cordis 运行时集成

[English](README.md) | 中文

把 Harness 所有的格式与 Cordis 运行时集成的插件：自指的面向模型工具集，以及受限的 repository Plugin 运行时。

| 包 | 职责 | ctx key |
|---|---|---|
| [`tool-cordis/`](tool-cordis/README.md) | 面向模型的运行时检查和临时插件工具 | 注册到 `ctx.tools` |
| [`repository-plugin/`](repository-plugin/README.md) | repository skill 与 MCP 组合 | 注册一个 Loader builtin |
