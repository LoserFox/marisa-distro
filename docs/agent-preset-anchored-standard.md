# Anchored Standard 实验预设（agent preset）

状态：**Experimental，随包提供、默认不启用**。用户需在设置页为会话显式选择「锚定标准（实验）」。

实现位置：`harness/apps/cli/config/agent-presets/anchored-standard/`（shipped roster，目录列表即清单）。
上游来源：[`xiaobright/dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard)，钉 `95b98af`，不追 `main`；`tool-bootstrap.mjs` 与 `LICENSE`（MIT）随目录 vendored，`agent.cordis.yml` 是 Marisa 自己的 rc7 Standard 组合加锚定增量，**不是上游整目录照搬**（上游是 rc.5 快照）。

## 机制

1. **首轮工具面**：`tool-bootstrap.mjs`（`./tool-bootstrap.mjs`，必须保持在组合第一行）把首个请求的 API 可见工具收敛为精确双工具：
   - POSIX：持久 `bash`（Minimal 的 `persistent-shell` 组，字节级同 Minimal）+ `str_replace_editor`（`bootstrap-filesystem` 组，裸本地 fs）；
   - Windows：`pwsh` + `str_replace_editor`（rc7 终端后端无 win32 持久 PTY，见下）。
2. **首轮上下文抑制**：`agent/pre-step` 过滤 `skill-catalog` 与 `agent-instructions` 两类自动注入，用户主动的 skill 手势不受影响。
3. **persona**：固定 `You are a helpful software engineer assistant. The personal pronoun is us/we.`（`complete: true`、`includeRuntimeContext: false`），关闭 Harness 身份与运行时上下文。首句与 Minimal 一致；`us/we` 代词引导是 Marisa 变体——#65 复现中锚定条件最干净的信号就是 `we` 风格首轮推理（9/9 分离、`let me` ≈ 0），且用户 Pro 实测效果更好。
4. **晋升**：会话出现首个 durable `tool/call` 或 `assistant/message`（`promoteOn: either`）后恢复完整 Standard 工具与正常注入；晋升状态从 session events 推导，刷新/恢复不退化；缺 bootstrap 工具时退化为完整目录并记录一次警告（robustness 路径，不阻断）。

## 证据现状（2026-08-20 复核，不要倒退）

当初调研依据（[8-15 调研](RESEARCH-anchored-standard-and-productivity-plugins-20260815.md)、[8-19 选型](RESEARCH-awesome-plugins-selection-20260819.md)）是作者 modeltest 的 Standard 91 / Anchored 98/99（仅两跑）。此后上游仓库自身出现两条修正：

- **[Issue #60](https://github.com/xiaobright/dsh-anchored-standard/issues/60)（已 close）**：98/99 历史成绩实际由 `pwsh/read → 25 工具` 旧配置产出，不是当前 Minimal 双工具实现；README 事后把成绩追认给了新实现。成绩不等于当前实现的证据。
- **[Issue #65](https://github.com/xiaobright/dsh-anchored-standard/issues/65)（open，2026-08-17）**：独立 n=3 复现（9 跑随机完全区组）——**机制复现**（轨迹锚定 9/9 分离：首轮双工具 → `we` 风格推理，zero overlap），**能力差不复现**（standard 90.0 / anchored 93.3 / whale 90.7；ANOVA F(2,6)=1.05 不显著；anchored−standard = +3.3，95% CI [−2.6, +9.3]，含 0）。该复现未跑 ESP-IDF 构建，绝对分不可比，相对比较有效。
- 上游 README（2026-08-17 起）已转入**仅维护**模式。

结论：**卖点是「首轮行为锚定 / 工具面收敛」，不是「提分」**。此预设仅作为实验选项随包，默认关闭；任何宣传口径不得引用 98/99。

## 平台矩阵

| 平台 | 首轮工具对 | 依据 |
|---|---|---|
| Linux / macOS | 持久 `bash` + `str_replace_editor`（Minimal 实测对） | #65 复现的 9/9 轨迹分离即此对 |
| Windows | `pwsh` + `str_replace_editor` | rc7 `subprocess-local` 的 `createProcessInspector` 在 win32 仍抛 `unsupported on platform win32`（`process-inspector.spec.ts:246` 固定），持久 PTY bash 不可用；`persistent-shell` 组已按平台禁用，避免目录里出现一调用就炸的 `bash`。pwsh 对是历史高分跑的 schema 家族（#60），但**无轨迹锚定复现证据**，Windows 用户应按「精简首轮实验」看待 |

Windows 上需要真正的持久 bash 锚定：等上游 rc 提供 win32 终端后端，或评估 WSL/MSYS2 前置（8-15 调研的 dsh-win32 路线）后再放开。

## 验收与测试

已在本仓库完成的验证：

- `scripts/verify-cordis-config.ts`：123 个 config 文件全过（含新 preset 的 plane-separation 与 entry 元数据校验）；
- `dsh-agent-presets` 真实 `scanRoot`：`anchored-standard` 被发现、无 `broken`、元数据正确；
- 上游 `tool-bootstrap.test.mjs` 26 项测试对 vendored `tool-bootstrap.mjs` 全过（与上游 `95b98af` 字节一致，SHA-256 `84CF3D58…`）。

真实窗口验收（发布前必须做，沿用 8-15 验收门）：

1. 设置页选择「锚定标准（实验）」开新会话；首轮 `request/header` 工具名必须恰为 `bash`、`str_replace_editor`（Windows 为 `pwsh`、`str_replace_editor`），且无 skill-catalog / AGENTS.md 注入；
2. 第二次请求验收完整 Standard 目录与正常注入；
3. 新会话 / 刷新 / 恢复 / 异常退出 / 多标签页不退化（晋升状态从 durable events 推导）；
4. 缺 bootstrap 工具的组合漂移只告警不退化为空目录；
5. 已以 Full/Standard 开始的会话不允许中途切到此预设（预设只在新会话选择）。

## 同步与维护

- 上游 rc 升级时：重新核对 `tool-bootstrap.mjs` 相对上游钉住提交的字节一致性（升级需重移植）；`persistent-shell` 与 `bootstrap-filesystem` 两组必须与同版本 `minimal` preset 字节级一致；三个事件名（`system-prompt/assemble`、`agent/pre-step`、`agent/request`）与 payload 契约随 rc 复核。
- 改动 `harness/` 内文件必须同步更新 [upstream-diff.md](upstream-diff.md) 与 `maintenance/upstreams.json`（本仓库约定）。
