# `@deepseek-ai/dsh-headless`

[English](README.md) | 中文

dsh 一次性任务组合包。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-base`](../base/README.md) + [`dsh-web-app`](../web-app/README.md) 之上：把 webserver 移到 OS 分配的端口（并行运行绝不冲突），关闭 URL 行输出，并插入本包的 `headless-runner` 插件（配置为 `{task}`）。runner 通过进程内 API 载体（架在 `toFetchHandler(ctx.apiProxy)` 之上的 `InProcessApiClient`，因此序列化、zod、SSE（Server-Sent Events）帧封装这整条 wire 链路都会真实运行）驱动一个任务轮次，在 idle 时等待该 mux 消费完会话的最终事件序号，再聚合该轮次最终的 assistant 文本，写到 stdout，并经启动器提供的 `ctx.headlessIo` seam 请求退出（完成 → 0，否则 1）。Web 组合保持挂载，因此运行中的会话可在浏览器中通过 stderr 公告的 URL 观察。启动器把任务文本 patch 进来（`dsh run "task"`）；若所选 profile 缺少该行，则显式报错。

## 模型体验

无。runner 把任务作为普通用户消息经共享组合提交；提示词与工具归 base／web 组合包所有。

#### KV Cache 影响

无；runner 不向请求前缀添加任何内容。

## 已知限制与延期工作

- **只运行一个轮次**：runner 锚定第一个由消息触发的轮次，并在其结束时退出；排队的后续消息与多轮任务不在范围内。
- **`ctx.headlessIo` 由启动器持有**：在 `dsh` 启动器之外启动 headless profile 会在激活时大声失败，直到宿主提供该 seam。
