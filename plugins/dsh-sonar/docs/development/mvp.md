# View 插件最小实现切片

> 状态：可运行开发实现，不是最终 mnemond 协议规范
> 日期：2026-08-13

## 目标

当前切片只验证一件事：用户能否通过自然语言配置 View，由 LLM 选择同一组操作，并让 Memory、Skill、Teamwork 与 Self-evolution 自然形成且仍可被观察和控制。

它不实现新的 Agent Loop，也不复制外部产品的 Memory 或任务系统。

## 统一原语

读取只有三种模式：

- `direct`：View 构建时直接进入系统上下文；
- `expand`：只进入目录，模型再按条目读取；
- `query`：不预载目录，由模型按任务搜索。

写入来源也只有三种模式：

- `record`：用户或模型在运行中明确要求保存；
- `target`：任务已经声明结果的写入目的地；
- `background`：系统后台整理出可能有价值的候选。

每种写入模式最终都产生相同的候选操作：

- `add`：增加内容；
- `replace`：撤销目标版本并增加新版本；
- `remove`：撤销目标版本。

每次写入都先进入 `pending`。只有用户可以在 UI 中 `accept` 或 `reject`。模型工具可以读取 View 和提出候选，不能接受自己的输出。

## 当前代际边界

每个 View 代际仍是不可变快照，但 Active View 指针可以实时切换。候选被接受或来源被切换后，Host 立即构建新代际并原子切换；同一次已经开始的模型输出不被反向修改，下一次模型行动、查询和 UI 刷新直接读取新 View，不需要 Runtime 重启。

这是开发实现的刻意边界。mnemond 接入后，代际边界应从 Runtime 启动细化为每个 Session 的 View 构建，但以下 API 不变：

```text
build -> status/query/read -> propose -> accept/reject -> next build
```

当前一个 Runtime 对应一个通过 `workspace` 配置确定的项目。多个对话或多个 DSH Runtime 指向同一项目时共享候选和已确认内容；每次读取前刷新共享状态，因此确认后的新 Active View 可以被其他实例立即读取。

## 内容类型

| 类型 | 默认读取 | 表达的内容 | 不负责什么 |
|---|---|---|---|
| Memory | direct | 已接受的项目连续性 | 自动相信模型总结 |
| Skill | expand | 可复用能力入口 | 实现另一套 Skill Runtime |
| Teamwork | query | 跨对话共享的责任、状态和进度信号 | 让远端结果自动成为本地结论 |

Teamwork 条目只投影用户能够自然理解的负责人、状态和进度，并通过相同的候选、确认、来源开关和 View 构建路径流转。用户不需要提供或看到对话标识；系统通过既有 View 条目在内部关联更新。状态推进必须读取旧条目、提出替换并再次确认，不能只在界面中模拟。三种内容类型在 UI 中只作为能力组合、标签和过滤器，不再是一级目录。看板不会为它们硬编码固定路径，而是从 Active View 和待确认候选中实际存在的 `readMode` 与 `writeMode` 计算当前组合。

Self-evolution 不是第四种内容类型。它由 `query/read → propose(add/replace) → accept/reject → Active View 新代际` 表达，更新的实际对象仍是 Memory 或 Skill。

## 自然语言入口

Host 注册 `/view <描述>` 原生命令。命令不在前端或 Host 中解释语义，而是把用户原话作为普通用户消息交给当前 Agent。System Prompt 要求 LLM：

1. 必要时先查询或读取当前 View；
2. 自行选择最小操作路径；
3. 通过 `view` 工具提出一个或多个候选；
4. 用自然语言解释路径和当前生效状态；
5. 不把“已经提出”表述成“已经接受”。

`view(action=propose)` 可以根据内容类型自动选择已启用来源，减少 LLM 不必要的基础设施参数。

## Provider 边界

当前 `local-preview` provider 把来源注册、候选日志和已接受投影保存在 `~/.dsh/dsh-sonar/<workspace-hash>/state.json`。它只用于开发和端到端验证，UI 会明确显示 `LOCAL PREVIEW`，不宣称自己是 mnemond 权威。

后续 `mnemond` provider 应负责：

- 接受身份、版本和 fence；
- 持久化接受或拒绝的 Receipt；
- 为每个 Session 构建有界 View；
- 把远端 Teamwork 结果保持为候选，直到本地接受。

dsh-sonar 继续只负责 Cordis 生命周期、模型读写入口和 DSH 展示。

## Cordis 接入边界

View 状态、持久化、RPC 与跨 Session 共用的来源注册位于 Host composition。它们是 Runtime 级服务，不进入某个 Agent preset 的 isolate。

同一个包提供两个 Host 条目：

- `dsh-sonar` 是浏览器模块的 roster face，负责让 DSH 发现 `./client`；
- `dsh-sonar/host` 提供 `sonarView` 服务，并向 Host 的 `tools`、`systemPrompt` 和 `connection` 注册能力。

浏览器端只向 `conversation.view` 注册一个 `◇ View` 页签。页签展示自然语言输入、当前内容、待确认变化、View 描述和能力配置；六原语只在解释区、配置映射和候选路径中出现。配置页从 View 状态实时计算 Memory、Skill、Teamwork 与 Self-evolution 的来源、读写组合和生效状态，不保存第二份能力配置。Agent preset 可以决定某类会话是否消费 `view` 工具或 Prompt，但不拥有 View 的权威状态。

浏览器端还向 DSH 的插件配置页注册一张 View 配置卡。Cordis 配置是部署基线，用户对语言、刷新、动画和后台整理的覆盖写入 `$DSH_HOME/settings.yaml`，经 Host 校验后实时生效。项目 workspace 与状态文件位置不允许由该卡切换。

后台整理属于 Host 行为。模型工具和显式写入表单只能产生主动记录或指定目标候选；Host 可以手动派生候选，也可以按配置定时从已完成的协作条目派生 Memory 候选。派生结果按来源条目去重，始终保持 `pending`，不会自动接受。

## 参考研究如何影响实现

- Memory 研究：采用稳定项目约定、按需能力目录、候选确认和去重意识；没有复制外部实现的多套 Memory 文件或后台反思流水线。
- mnemond：采用 `View -> candidate/intent -> accepted/rejected -> 新 View 代际`，并保持 transport、observation、acceptance 分离。
- 协作监控研究：采用紧凑的状态监控和活动流形态；Teamwork 数据仍是 View 内容，不形成第二控制平面。
- DSH/Cordis：Host 提供状态、RPC、Prompt 和模型工具，Client 只注册一个 `conversation.view` 插槽。

## 首轮验收

1. Memory、Skill、Teamwork 都能提出候选并由用户确认；
2. 未确认候选不会进入 Active View；
3. 接受内容后立即生成新 Active View 代际，不依赖超时或 Runtime 重启；
4. 禁用来源不会破坏其他来源，并立即从新的 Active View 代际中移除其内容；
5. DSH 内只有一个 View 入口，能查看代际、来源、候选、活动和 Teamwork 状态；
6. DSH 插件配置页能保存、实时应用并恢复 View 用户配置；
7. 单元测试和真实浏览器操作同时通过。
