# rc7 插件兼容评估清单

> 验证基线：DSH `0.1.0-rc.7`，upstream commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，评估日期 `2026-08-18`。
>
> “boot 已验证”只表示插件随 profile 生成、安装并启动时没有阻断；不等于每项业务功能已完成验收。

| 插件 | 来源/版本 | rc7 状态 | 默认组合 | 证据/现状 | 下一步 |
|---|---|---|---|---|---|
| `interpreters` | npm `0.1.0` | keyed 修复后已插入 | 启用 | profile/build/boot；Web UI 无错误 | 完成解释器功能冒烟 |
| `ya-workspace-sidebar` | npm `0.1.0` | 已插入 | 启用 | profile/build/boot | 检查与官方 workspace 行为的交互 |
| `mineru` | npm `0.2.1` | 已插入 | 启用 | profile/build/boot | 使用自备 MinerU 服务完成真实功能验收 |
| `aigc-canvas` | npm `0.1.0` | client module id 修复后已插入 | 启用 | build/boot | 完成真实 provider 验收 |
| `yet-another-subagent` | npm `0.1.2` | 与官方 `tool-subagent` 撞名 | 未挂载 | patch 已准备，需禁用官方项后再测 | 单独禁官方 subagent 后 profile/boot 验证 |
| `dsh-llm-fallbacks` | npm `0.1.0-alpha.1` | rc7 待重测 | 停用 | 当前生成 profile 仍按不兼容策略过滤 | 验证 `conversationEvents`/`remote` 事件契约 |
| `dsh-sonar` | git | rc7 待重测 | 停用 | 未完成 rc7 功能验证 | 验证 Cordis 服务与 conversation view slot |
| `dsh-track` | git | rc7 待重测 | 停用 | 未完成 rc7 功能验证 | 验证 session-query、Context 与客户端契约 |
| `dsh-diff-viewer` | git | rc7 待重测 | 停用 | 未完成 rc7 功能验证 | 验证 keyed toolview 与 edit/write 注册 |
| `dsh-multimedia-webui-input` | git | rc7 待重测 | 停用 | 未完成 rc7 功能验证 | 验证 attachment admission 与客户端包 |
| `dsh-suggested-replies` | git | rc7 待重测 | 停用 | 沿用历史停用策略，尚无 rc7 证据 | 验证客户端 API 与组合时序 |

## 判定规则

- `组合启用`：已默认挂载并通过启动链路验证。
- `安装未挂载`：依赖存在，但默认 profile 未挂载；这不是兼容通过。
- `rc7 待重测`：仅能沿用历史停用策略，不能把 rc6 结论当作 rc7 结论。
- YAS 的挂载必须同时禁用官方 `tool-subagent`，避免两个插件注册同一能力。

完整插件目录、上游基线与 fork/mirror 关系见 [`plugins.md`](plugins.md)。
