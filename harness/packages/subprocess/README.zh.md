# subprocess/：子进程能力家族

[English](README.md) | 中文

本家族通过显式的进程生命周期服务运行宿主子进程。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`subprocess/`](subprocess/README.md) | 定义子进程启动、流、终止和 dispose（资源释放）契约 | `ctx.subprocess` |
| [`subprocess-local/`](subprocess-local/README.md) | 实现本地进程树执行 | 注册到 `ctx.subprocess` |

服务负责进程生命周期；每个消费方负责进程执行的工作以及所应用的默认值。
