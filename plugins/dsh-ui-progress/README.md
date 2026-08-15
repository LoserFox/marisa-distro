# @dsh-external/dsh-ui-progress

**简体中文** | [English](./README.en.md)

DSH Web UI 会话进度插件：为 DeepSeek Harness 的 Web GUI 的输入框停靠区提供常驻会话进度条，**零核心改动**（纯 client 插件，不触碰 agent-loop）。

## 版本对应 / Version compatibility

构建产物随 DSH 快照版本更新，安装时按快照选择对应版本：

| 插件版本 | DSH 快照 | 说明 |
| --- | --- | --- |
| `v0.1.0` | `snapshots/20260805T134133Z`（snapshot0805） | 旧构建，按旧安装方式（`~/.dsh/config.yaml` + `pnpm add -w link:`） |
| `v0.2.0` | `snapshots/20260806T160212Z`（snapshot0806） | 同快照早期构建（无耗时/ETA/失败态/阶段时间线） |
| `v0.3.0` | `snapshots/20260806T160212Z`（snapshot0806） | 同快照上一构建（卡片耗时/ETA 文案插值缺失） |
| `v0.3.1` | `snapshots/20260806T160212Z`（snapshot0806） | 同快照上一构建（ETA 为线性外推） |
| `v0.4.0` | `snapshots/20260806T160212Z`（snapshot0806） | 同快照上一构建（ETA 仅来自模型上报） |
| `v0.5.0` | `snapshots/20260807T130646Z`（snapshot0807） | 同快照上一构建：自带工具 + 上报引导 |
| `v0.5.1` | `snapshots/20260807T130646Z`（snapshot0807） | 同快照上一构建：会话完成进度条浅绿色 |
| `v0.6.0` | `snapshots/20260807T130646Z`（snapshot0807） | 新构建：已耗时 0.1s 步进（满分钟折叠）+ subagent 待办琥珀提示 |
| `v0.7.0` | `snapshots/20260808T121140Z`（snapshot0808） | 新构建：适配 0808 的 slot 迁移（`conversation.chat.toolview` → `tool.call.toolview`，注册经 `slots.inject` 等待声明） |
| `v0.8.0` | `snapshots/20260808T121140Z`（snapshot0808） | 新构建：移除自带 `report_progress` 工具与上报引导（宿主 half 置空）、移除工具卡片；填充改为 todos 真实比例（无 todos 默认 100%）；新增中断橘红态（手动打断/API 错误等意外停止） |
| `v0.9.0` | `snapshots/20260809T140917Z`（snapshot0809） | 新构建（原生 0809）：运行中新增**实时 token 生成速率**（自校准估算 + 1s 滑动窗口平滑，首 token 到达起算，贴近真实 provider usage） |
| `v0.9.1`（默认） | `snapshots/20260810T155924Z`（snapshot0810） | 兼容性构建：客户端插件元数据从顶层 `dshClient` 迁移为嵌套 `dsh.client`（0810 的 ClientModuleHostService 只读该字段；顶层 `dshClient` 被静默忽略），inject/platform 原样保留 |

> **兼容性说明**：`v0.8.0` 构建基于 snapshot0808 开发，同时兼容 snapshot0809（`snapshots/20260809T140917Z`），实机验证通过；`v0.9.0` 为原生 snapshot0809 构建；`v0.9.1` 面向 snapshot0810（`snapshots/20260810T155924Z`，默认版本），同时兼容 snapshot0811（`snapshots/20260811T152241Z`）与最终快照 snapshot0812（`snapshots/20260812T172954Z-final`）——0811 与 0812 实机 boot 验证通过（见下）。

> **npm 发版兼容**：兼容 DSH npm 发版 `@deepseek-ai/dsh@0.0.1-rc.5`（dist-tag `next`，即最终快照 snapshot0812 的 npm 发版；`npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` 可访问指定版本并启动，lib 生产模式），同时保持兼容 `@deepseek-ai/dsh@0.0.1-rc.2`（snapshot0811 的 npm 发版）。实测（npm rc.5 基线）：`dsh web` 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-ui-progress`（inject: `dsh-client-locale`/`dsh-client-runtime`/`dsh-client-ui-conversation`），`/plugins/@dsh-external/dsh-ui-progress/client.js` 返回 200；src 对 rc.5 基线构建产物 typecheck 全绿（本插件已把 cordis 类型导入与 peer 迁移至 `@deepseek-ai/cordis`，见下）。注意：0811 起 vendored cordis 更名为 `@deepseek-ai/cordis`（npm 发版不再发布 `cordis` 名义的 vendored 包），本插件已迁移（peer 声明 `@deepseek-ai/cordis: ^4.0.1-rc.1`，npm rc.5 基线上为 `4.0.1-rc.4`），纯 `npm install` 不再报 ERESOLVE。

> git 依赖方式固定 tag：`pnpm add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.9.1'`（0809 用户用 `#v0.9.0`，0808 用户用 `#v0.8.0`，0807 用户用 `#v0.6.0`，0805 用户用 `#v0.1.0`）。

## 0809 兼容要点（snapshot0809，实机验证）

- 0809 运行中的 `dsh web` 的 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-ui-progress`，`conversation.input.dock` 进度条正常渲染——运行中加载圈旋转、todos 真实比例填充、完成浅绿、中断橘红、待办琥珀各态实测正常。
- **加载机制变化**：0809 重构了客户端插件机制——旧的 `dsh.plugin.json` 清单 + `resolveClientPath`（`packages/plugin/plugin`）已删除，改为 **package.json 的 `dshClient` 声明**（`platform: 'web'`，可选 `inject`/`immediately`）+ `exports["./client"]` 指向构建产物；宿主扫描 loader 条目组成 boot 图，Web 端从 `/plugins/<id>/client.js` 拉取。本插件 package.json 已满足该声明，无需改动。
- 本插件使用的槽位 `conversation.input.dock`（list/session）与 keyed `tool.call.toolview` 在 0809 上仍由官方客户端声明（`tool.call.toolview` 的 owner 类型与 0808 一致）；`useSession` 快照与 todos 投影契约未变。
- **构建要求**：0809 宿主在激活时校验 `dshClient` 包的构建产物，缺失会抛 `ClientPackageCompositionError` 并**拒绝启动 `dsh web`**——升级快照或改源码后必须重新 `pnpm run build` 再启动，否则浏览器拉到的是旧 `lib/client.js`。

## 0810 兼容要点（snapshot0810，实机验证）

- **元数据发现变化**：0810 的 ClientModuleHostService 在启动时扫描已加载插件的 package.json，但只读**嵌套 `dsh.client`**（`packages/client/modules/src/index.ts` 的 `resolveMeta`，`pkg.dsh.client`）；顶层 `dshClient` 字段读不到会静默丢出 boot 图——无日志、无报错，"启动顺利但插件全没"。本插件已从顶层 `dshClient` 迁移为嵌套 `dsh.client`（inject/platform 原样保留），0810 实机验证 `window.__DSH_BOOT__` 清单包含本插件、进度条各态正常。
- **无需重构建**：`lib/client.js` 构建产物不变，package.json 不参与编译；symlink 安装改源仓库即生效，无需重装。

## 0811 兼容要点（snapshot0811，实机验证）

- **cordis 更名（本快照唯一影响本插件的官方变化）**：0811 将 vendored cordis 由 `cordis@4.0.0-rc.7` 更名为 **`@deepseek-ai/cordis@4.0.1-rc.1`**（官方 client 包随之全部改从 `@deepseek-ai/cordis` 导入）。本插件对 cordis 只有 type-only 导入（`src/invariant.ts` 的 `import type { Context } from 'cordis'`），**构建产物（lib/*.js）零 cordis 运行时导入**——更名不影响已构建 bundle 的运行时加载；但源码对 npm rc.2 基线 typecheck 时 `cordis` 裸导入报 TS2307（仅此一处），**将类型导入迁移为 `from '@deepseek-ai/cordis'` 后全绿**。建议同步把 `peerDependencies.cordis` 迁移为 `@deepseek-ai/cordis: ^4.0.1-rc.1`。
- **实机 boot 验证**：snapshot0811（`snapshots/20260811T152241Z`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-ui-progress`（inject: `dsh-client-locale`/`dsh-client-runtime`/`dsh-client-ui-conversation`），`/plugins/@dsh-external/dsh-ui-progress/client.js` 返回 200。本插件使用的槽位 `conversation.input.dock`（list/session）、`useSession` 快照与 todos 投影契约在 0811 上均保持声明。
- **测试 fixture 漂移**：typecheck 的 src 全绿；`tests/session-progress-bar.spec.tsx` 有两处 fixture 未跟上 0811 新增字段——`ConversationSnapshot.views`（0811 新增视图快照存储）与 `InputState.imageIds`（0811 新增草稿图片附件）——源码与构建产物不受影响（fixture 已在 v0.9.1 最终快照适配中补齐，见下）。

### 0812/最终快照 兼容要点（snapshots/20260812T172954Z-final，实机验证）

- **cordis 更名落地**：本插件已把 type-only 导入（`src/invariant.ts` 的 `import type { Context } from '@deepseek-ai/cordis'`）与 `peerDependencies`/`devDependencies` 迁移至 `@deepseek-ai/cordis`（`^4.0.1-rc.1`；npm rc.5 基线上为 `@deepseek-ai/cordis@4.0.1-rc.4`）——构建产物（lib/*.js）零 cordis 运行时导入，npm rc.5 消费者 typecheck 全绿，`npm install` 无需 `--legacy-peer-deps`。
- **invariants 源码包迁移（仅影响本地 typecheck）**：最终快照将 `@deepseek-ai/dsh-invariants` 源码包由 `packages/support/invariants` 移至 `packages/runtime-diagnostics/invariants`，devDependencies 路径已同步更新；服务名 `invariants` 与注册协议未变，运行不受影响。
- **测试 fixture 补齐**：`tests/session-progress-bar.spec.tsx` 的 fixture 已补齐 0811 起新增的 `ConversationSnapshot.views`（空视图快照 `{ get: () => undefined }`）与 `InputState.imageIds`（空数组）字段——typecheck（含 tests）与 27 个单测对最终快照基线通过。
- **实机 boot 验证**：最终快照（`snapshots/20260812T172954Z-final`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-ui-progress`，`/plugins/@dsh-external/dsh-ui-progress/client.js` 返回 200；npm rc.5 consumer `dsh web` 启动后 boot 清单同样包含本插件。本插件使用的槽位 `conversation.input.dock`（list/session）、`useSession` 快照与 todos 投影契约在最终快照与 rc.5 上均保持声明。typecheck、build 与 27 个单测对最终快照基线通过。

## 功能

- **常驻会话进度条**（`conversation.input.dock`，输入框停靠区）：读取框架 `useSession` 快照渲染真实执行状态——运行中/空闲、当前在飞的工具名、当前窗口已结算的工具结果数、当前轮次。运行中左侧加载圈**旋转**，进度条 shimmer 扫光 + 品牌色光环脉冲，填充宽度缓动。**填充宽度**：有 `todos` 投影时按真实完成比例（(已完成+进行中)/总数，进行中任务计入进度）；无 todos 时固定默认 **100%**——会话整体进度没有专门投影，不展示伪百分比（v0.8.0 起移除旧的"每个已结算工具结果进一格、窗口上限 10"分段填充）。运行中额外显示**实时已耗时**（自当前回合开始，0.1s 步进跳动，满一分钟折叠为 `XmYs` 后按秒递增）与 **ETA 预计剩余时间**（仅当模型在最近的 `report_progress` 上报里给出 `eta` 估计——不做线性外推，模型没报就不显示）；空闲时显示上一回合耗时。**会话完成（跑过至少一轮后空闲）进度条切换为浅绿色**，从未运行过的会话保持中性蓝灰。
- **中断橘红态**（v0.8.0 新增）：本会话**最近一个已结束回合被中断/停止**——手动打断、API 故障或其他意外原因——进度条切换为**橘红色**（浅橘背景 + 橘红填充/图标/百分比 + 慢速脉冲），标签显示"已中断"，优先于运行中/完成态的常规配色。只按**最近一个**回合判定：中断后继续发送并正常完成的新回合会让进度条恢复正常配色（中断遗留标记仍保留在窗口内但不再触发）。注意态（琥珀，见下）仍优先于中断态。
- **实时 token 生成速率**（v0.9.0 新增）：运行中**模型正在生成**时（有流式 partial 内容、且无待处理的人机交互），进度条在已耗时旁显示实时速率（如 `12.3 tok/s`，斜体品牌色，固定最小宽度保持进度条右侧稳定）。流式 chunk 不携带 token 计数（核心端只有回合结束后的 provider usage），因此该值是**自校准估算值**：初始按 CJK 感知字符密度折算当前 partial 的 token 数（中日韩宽字符 1 字符 ≈ 1 token，其余按核心 token-meter 同款 4 字符 ≈ 1 token）；一旦窗口内任何已结算 step 上报了真实 output tokens，就用其「真实 tokens ÷ 加权字符数」密度缩放当前流式估算——数字会贴近所用模型 tokenizer 的真实密度，而非固定字符启发式。速率按**滑动窗口平均**（默认 1s 窗口）计算：每 ~1s 刷新一次、只统计最近窗口内新增的 token，消除逐 chunk 闪动；空窗口保持上次读数不归零。速率除以窗口时长（排除 TTFT）——与核心端回合结束后显示的结算 tokens/s（outputTokens/decodeMs）口径一致，运行中数值可直接与结算值对比。每个新 step 重新起算；工具执行/等待人机交互/回合结束时不显示（结算后的精确速率由核心 StatsLine 呈现，避免重复展示同一事实）。
- **待办提醒（attention）**：本会话或其后代 subagent 会话存在**等待人处理的交互**（沙箱命令审批 / 选项选择 / 计划审阅）时，进度条切换为**琥珀色警告态**（浅琥珀背景 + 琥珀填充/图标 + 慢速脉冲），文字提示来源与类型——`等待审批` / `需要选择`（本会话）、`子代理等待审批` / `子代理需要选择`（subagent）、`等待审批 · 子代理 2 项待处理`（并存时）。subagent 会话被官方侧边栏隐藏，其 pending 状态从全局会话列表（`origin: 'subagent'` 行的 `pendingInteraction`）读取——这是主 agent 感知子代理等待的主要出口。优先级：pending(琥珀) > running(蓝) > interrupted(橘红) > done(绿) > idle(中性)。

## Model Experience

v0.8.0 起本插件**不再注入任何模型可见输入**：`report_progress` 工具与上报引导段落已移除（宿主 half 为空），插件只做浏览器端呈现。若其他宿主插件注册 `report_progress` 工具，会话进度条的 ETA 行仍会读取其上报的 `eta` 字段（见上文）。

不注入任何用户消息内容；会话文本与上下文注入不受影响。

## 安装

见 [INSTALL.md](INSTALL.md)。

## 配置

无配置键。安装后只需在配置树里插入一行：

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## Export shape

浏览器半 `./client`（`apply`/`inject` 命名空间插件）、空 Node half `./index`、标准 invariant companion `./invariant`。

## Known Limitations and Deferred Work

- 会话整体进度无专门投影：无 todos 时填充固定 100%，不展示伪百分比；todos 比例只反映当前 todos 列表，不代表会话全程进度。
- 中断检测按当前窗口 + 最新回合判定：中断回合**既无 partial 内容又无在飞工具调用**时不留痕迹，无法检出；分页/压缩后旧标记被截断，中断态随之消退。处于重试路径（model-retry）的回合不显示中断态。
- ETA 完全依赖模型在 `report_progress` 的 `eta` 字段上报：模型不报或报错（非字符串/非正数）就不显示；进度条取窗口内**最近一次**上报的 eta，若最近一次未带 eta 则隐藏（即使更早的上报带过）。
- 浏览器 half 刷新页面即生效（宿主 half 为空，升级安装无需重启 `dsh web`）。
- CSS 动效常量（时长/缓动）为本地字面量（当前样式体系尚无 motion token 族）；中断橘红色为 warn/error token 的 `color-mix`（样式体系无独立橘色 token）。
- 实时 token 速率为**估算值**（流式 chunk 无 token 计数）：先按 CJK 感知字符密度起算，一旦有已结算 step 的真实 provider usage 即按密度**自校准**（首个校准 step 之前的首个回合仍为字符启发式）；推理/正文/工具参数一并计入；显示为 1s 滑动窗口平均（本地字面量 `TOKEN_RATE_WINDOW_MS`），非 provider 报告值，回合结束后以核心 StatsLine 的结算 tokens/s 为准。
