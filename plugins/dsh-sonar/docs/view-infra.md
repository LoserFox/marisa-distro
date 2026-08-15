# View Infra：以 View 为核心的项目上下文基础设施

> **状态：** 内部架构候选，不是当前实现规范
>
> **日期：** 2026-08-13
>
> **适用项目：** mnemond、dsh-sonar 及其 Runtime 集成
>
> **目的：** 说明 View Infra 要解决的问题、系统边界、核心模型、Cordis 集成方式与验证标准

## 1. 一句话定义

> **View Infra 是一套以 View 为核心的项目上下文基础设施。**

mnemond 根据用户为项目启用并接受的内容，为每次 Session 构建当前 View；dsh-sonar 将这套能力接入 DSH 的 Cordis 生命周期，使 LLM 能以一致、可控的方式读取项目环境并提出新的项目内容。

```text
项目内容与来源配置
        |
        v
mnemond 构建不可变 View
        |
        v
dsh-sonar 接入 DSH/Cordis Runtime
        |
        v
LLM 读取、理解和行动
        |
        v
产生候选内容
        |
        v
经过确认后成为项目内容
        |
        v
立即成为新的 Active View generation
```

View Infra 不规定模型应当如何思考、循环、协作或选择下一步。它负责的是：

1. 模型实际看到了什么；
2. 内容来自哪里；
3. 哪些内容能够跨 Session 和 Runtime 保留；
4. 哪些新内容已经被项目接受；
5. 内容如何被确认、替换、撤销、禁用或删除；
6. 在外部状态变化后，系统能否重新构建语义正确的项目环境。

## 2. View Infra 要解决的问题

普通 Prompt 注入、静态 Markdown、Skill 目录和一般检索可以向模型提供上下文，但它们通常不能共同回答以下问题：

- 当前内容是否仍然有效？
- 内容是谁提供的，何时提供的，是否经过项目确认？
- 模型刚刚生成的结论是否已经成为项目事实？
- 旧 Session 持有的内容是否能覆盖后来更新的内容？
- 某个来源被禁用后，它是否仍会通过检索索引或缓存泄漏？
- 删除旧对话、重启 daemon 或换用 Runtime 后，项目环境能否准确恢复？
- 用户能否只撤销一项内容，而不破坏其他上下文能力？

View Infra 的核心假设是：这些问题不应分别由 Memory、Skill、Teamwork、Evolution 等系统重复解决，而应由统一的 View 读写与内容治理基础设施解决。

## 3. 核心概念

### 3.1 项目内容（Project Content）

项目内容是可能参与 View 构建的信息，包括但不限于：

- 项目说明、规范、约束和决策；
- 可复用的操作方法与 Skill；
- 已确认的经验、事实和 Memory；
- 团队责任、共享状态和工作产物；
- 用户启用的文件、服务或远端来源；
- 系统提出并经确认的更新内容。

项目内容不等于 Prompt 文本。它可以通过直接加载、按需展开或主动查询等不同方式暴露给模型。

### 3.2 内容来源（Source）

来源说明内容从哪里进入项目，例如本地文件、用户输入、插件、数据库、远端服务或后台整理器。

来源至少需要具备可识别的身份、启用状态和版本信息。禁用来源会立即生成新的 Active View 代际，其内容不得再通过直接注入、展开入口、查询结果、派生索引或缓存出现。

### 3.3 候选内容（Candidate Content）

候选内容是尚未被项目接受的新信息。模型输出、远端结果和后台提取默认都是候选内容，不因生成或写入成功就自动成为可信项目内容。

### 3.4 已接受内容（Accepted Content）

已接受内容是经过用户或明确授权规则确认、可以参与 Active View 构建的项目内容。

“已持久化”与“已接受”是两个不同概念：候选内容可以被持久化以等待确认，但仍不能作为已接受事实进入 View。

### 3.5 View

View 是 mnemond 根据以下输入构建的、供某次 Session 使用的项目环境快照：

- 项目标识；
- 当前启用的内容来源；
- 各来源的有效版本；
- 已接受内容及其状态；
- 当前 Runtime 支持的读取能力；
- 必要的 Session 或任务作用域。

View 不是项目内容数据库，也不只是拼接后的 System Prompt。它是一个可重现的构建结果，可以包含直接内容、简要入口、查询句柄和来源元数据。

### 3.6 Session 与 Runtime

- **Session** 是一次模型工作的上下文边界。
- **Runtime** 是实际承载 Session 的模型运行环境，例如 DSH 或未来的其他 Harness。

View Infra 要求项目内容的语义不依赖某一个 Session、模型进程或 Runtime。不同 Runtime 可以使用不同的呈现方式，但应基于一致的内容选择和接受状态构建等价 View。

## 4. 设计原则

### 4.1 View 是核心抽象

系统围绕“怎样为当前 Session 构建正确 View”设计，而不是围绕“怎样实现某一种 Memory 或 Skill 产品”设计。

### 4.2 View 代际不可变，Active 指针实时切换

一个已经构建的 View generation 应被视为不可变快照。Session 中产生的新内容首先进入候选区；用户确认后系统立即构建新的 generation，并原子切换 Active View。旧 generation 不被就地修改，同一次已经开始的模型输出也不会被反向改变。

下一次模型行动、查询和 UI 刷新读取新的 Active View，不依赖超时、Session 重建或 Runtime 重启。

### 4.3 生成不等于接受

以下事件都不能隐式完成项目确认：

- 模型生成了一段结论；
- 工具成功返回远端结果；
- 后台整理器提取出一条摘要；
- 内容已经写入磁盘或数据库；
- 多个模型对同一结论达成一致。

确认必须是可识别、可审计的状态变化。

### 4.4 来源与版本可追溯

进入 View 的内容应能追溯到来源、版本和接受记录。给定相同的有效输入，系统应能重建相同语义的 View，并能解释差异来自哪里。

### 4.5 用户控制是完整链路控制

禁用、撤销或删除不能只影响 Prompt 渲染层，还必须影响：

- 直接加载内容；
- 展开入口；
- 主动查询结果；
- 搜索与向量索引；
- 派生摘要；
- 缓存和预计算结果。

### 4.6 Runtime 无关，呈现方式可适配

mnemond 负责内容与 View 的语义，Runtime 插件负责将 View 映射为该 Runtime 能消费的形式。不能让某个 Runtime 的 Prompt 格式反向成为 View Infra 的核心数据模型。

## 5. View 的读取模型

View Infra 定义三种基本读取方式。

### 5.1 直接加载（Direct Load）

在 Session 开始或 View 挂载时直接进入模型上下文。

适合：

- 很短但必须始终遵守的项目约束；
- 当前任务不可缺少的身份、目标和安全边界；
- 读取成本低且相关性稳定的内容。

在 DSH 中，这类内容可以映射到 System Prompt section 或等价的 Session 初始化机制。

### 5.2 按需展开（Progressive Disclosure）

View 先向模型提供有限的标题、摘要或入口，模型需要时再读取完整内容。

适合：

- Skill 说明；
- 大型规范和参考材料；
- 低频但必须可发现的项目知识；
- 不应全部占用初始上下文窗口的内容。

### 5.3 主动查询（Active Query）

模型根据当前任务，通过搜索、过滤、读取或结构化查询获取相关内容。

适合：

- 数量较大或不断更新的内容；
- 需要按关键词、类型、时间、责任人或来源筛选的内容；
- 只在具体问题出现时才相关的历史信息。

主动查询返回的结果仍属于当前 View 的权限与来源边界。查询工具不能绕过 View 直接读取已禁用或未接受内容。

## 6. View 的写入模型

View Infra 定义三种基本写入方式。

### 6.1 主动记录（Explicit Capture）

用户或模型在运行中明确提出“记录这项内容”。系统应保存内容、来源、目标和产生它的 View 版本，并将其置为待确认或进入明确授权的确认流程。

### 6.2 指定目标（Designated Target）

任务开始前已经说明结果应写到哪里，例如更新某份设计记录、责任列表或项目知识条目。

指定目标解决“写到哪里”，不自动解决“是否接受”。任务结果仍需遵守目标对应的确认策略和并发更新规则。

### 6.3 后台整理（Background Curation）

系统监听 Session 或项目事件，在后台提取可能长期有价值的内容，例如决策、重复错误、稳定偏好或新的操作方法。

后台整理只能产生候选内容。提取器不得自动把自身判断升级为项目事实。

### 6.4 自然语言是使用层，不是新的原语

用户可以用 `/view` 描述希望项目上下文怎样工作，由 LLM 根据当前 View 选择上述读取和写入操作。自然语言降低了使用门槛，但不会改变底层控制边界：

- 描述必须落实为真实查询、读取或结构化候选，不能只拼接进 Prompt；
- LLM 负责选择路径，不负责接受自己的输出；
- 同一句描述可以产生多个候选，例如一条直接加载的约束和一条按需展开的方法；
- Memory、Skill 和 Teamwork 是内容流转后的产品能力；Self-evolution 是读取证据后提出增加或替换的跨代过程。

因此，用户面对的是语言配置的 View，系统内部仍保持有限、可验证的六种操作。

## 7. 内容状态与更新语义

候选状态机的基本方向如下：

```text
模型、用户、任务目标或后台整理产生内容
                    |
                    v
               Candidate
             /     |      \
            v      v       v
        Accepted Rejected Discarded
            |
      +-----+-----------+
      |                 |
      v                 v
 Superseded          Revoked
      |
      v
 可按保留策略归档或删除
```

状态语义：

- **Candidate：** 已记录但尚未接受；
- **Accepted：** 可参与 Active View 构建；
- **Rejected：** 明确不接受，应保留必要的审计信息但不能进入 View；
- **Discarded：** 无需继续处理的候选；
- **Superseded：** 已被新版本替代，Active View 应使用替代内容；
- **Revoked：** 曾被接受，后来被撤销，Active View 不再使用；
- **Deleted：** 按用户意图和保留策略移除内容及其派生数据。

来源的启用状态与内容接受状态相互独立：一条内容可以仍是 Accepted，但由于其来源被禁用而不进入 View。重新启用来源后是否恢复，应由来源策略和现存版本共同决定。

### 7.1 防止旧 View 覆盖新内容

任何修改、替换或确认请求都应携带产生它的基础 View 或内容版本。提交时如果目标已经更新，系统不能静默覆盖，而应拒绝、重新合并或再次确认。

### 7.2 删除与禁用的区别

- **禁用来源：** 保留来源及必要数据，但立即从 Active View 和所有读取路径中排除；
- **撤销内容：** 保留历史记录，但取消其项目有效性；
- **删除内容：** 按策略移除原始内容、派生结果和索引引用；
- **替换内容：** 建立新旧版本关系，并确保新的 Active View 不再选择旧版本。

## 8. Memory、Skill、Teamwork 和 Evolution 的位置

Memory、Skill、Teamwork 和 Evolution 不是四套平行的底层系统，而是 View Infra 读写原语、内容类型和产品策略的组合。

| 能力名称 | 常见读取方式 | 常见写入方式 | View Infra 中的本质 |
| --- | --- | --- | --- |
| Memory | 按需展开、主动查询，少量直接加载 | 主动记录、后台整理 | 可持续更新且经过确认的项目内容 |
| Skill | 直接加载规则、按需展开正文、主动查询参考 | 指定目标、主动维护 | 操作性内容的一种组织与呈现方式 |
| Teamwork | 直接加载责任、查询共享状态与产物 | 指定目标、主动记录 | 多参与者共享的项目状态和内容流 |
| Evolution | 查询历史版本与证据 | 后台提出候选、确认后替换 | 对现有内容进行有来源的受控更新 |

这张表描述常见组合，不限制未来产品形态。某种能力可以同时使用多种读取和写入方式。

## 9. 系统职责划分

### 9.1 mnemond

mnemond 是项目内容状态和 View 构建语义的权威层，候选职责包括：

- 管理项目、来源、内容、版本和接受状态；
- 构建可识别、可重现的 View；
- 执行确认、替换、撤销、禁用和删除语义；
- 提供查询、读取和候选写入接口；
- 防止基于旧 View 的写入覆盖新状态；
- 管理索引与派生内容的一致失效。

### 9.2 dsh-sonar

dsh-sonar 是 View Infra 在 DSH 中的 Cordis Runtime 适配层，候选职责包括：

- 在 Cordis 生命周期中连接和释放 mnemond 能力；
- 在 Session 或 Agent 建立时获取并挂载 View；
- 将直接加载内容注册到 DSH 的 Prompt 组装机制；
- 将展开入口和查询能力注册为模型可用工具；
- 暴露主动记录、指定目标和后台整理的写入通道；
- 监听必要的 Session、Agent 和工具事件；
- 在插件禁用或 dispose 时清理注册项、缓存与监听器；
- 保持 DSH 表现层与 mnemond 内容语义之间的边界。

### 9.3 DSH 与 Cordis

DSH 提供模型循环、Session、工具、System Prompt、事件与作用域等运行环境。Cordis 提供插件的依赖注入、挂载、作用域和释放生命周期。

View Infra 使用这些机制，但不要求 DSH 核心分别实现 Memory、Skill、Teamwork 或 Evolution。

### 9.4 LLM

LLM 消费 View、查询内容、完成任务并提出候选写入。LLM 不拥有项目事实，也不能仅凭输出将内容升级为 Accepted。

### 9.5 用户

用户控制项目内容来源和接受边界，包括：

- 启用或禁用来源；
- 确认或拒绝候选内容；
- 替换、撤销或删除已接受内容；
- 选择允许的后台整理与确认策略；
- 检查某个 View 为什么包含或不包含某项内容。

## 10. dsh-sonar 的候选插件结构

对 DSH 而言，View Infra 可以作为一个 View 插件产品出现；实现上更适合由一个核心服务和多个可组合的 Cordis 插件组成，而不是单个巨型插件。

```text
dsh-sonar
  |
  +-- View Core Service
  |     +-- mnemond client
  |     +-- View snapshot/session binding
  |     +-- provenance and version checks
  |
  +-- Read adapters
  |     +-- direct-load adapter
  |     +-- progressive-disclosure adapter
  |     +-- query adapter
  |
  +-- Write adapters
  |     +-- explicit-capture adapter
  |     +-- designated-target adapter
  |     +-- background-curation adapter
  |
  +-- Runtime adapters
        +-- system prompt integration
        +-- tool integration
        +-- agent/session event integration
        +-- confirmation UI or command integration
```

具体的 Cordis service 名称、插件拆分粒度和配置格式尚未确定。无论如何拆分，都应满足以下要求：

- 插件通过 `inject` 明确声明所需的 DSH 服务；
- View 只在依赖服务就绪后挂载；
- Session/Agent 作用域内容不能泄漏到其他作用域；
- 注册的 Prompt section、工具和事件监听器必须可释放；
- 禁用或替换某一适配器不应破坏其他读取和写入方式；
- 插件装配顺序有语义时必须显式声明并测试。

## 11. View 的概念数据形态

以下结构只用于说明信息边界，不是当前 API 规范：

```ts
interface ViewSnapshot {
  id: string
  projectId: string
  generation: number
  builtAt: string
  contentHash: string
  inputs: ViewInputRevision[]
  directSections: ViewSection[]
  expandableEntries: ViewEntry[]
  queryCapabilities: QueryCapability[]
}

interface CandidateWrite {
  id: string
  projectId: string
  baseViewId: string
  source: WriteProvenance
  target?: ContentTarget
  payload: unknown
  status: 'candidate' | 'accepted' | 'rejected' | 'discarded'
}
```

View 至少需要可识别的 ID、项目、generation、输入版本和内容摘要；候选写入至少需要项目、基础 View、来源、目标和状态。具体字段应由实际查询、确认和跨 Runtime 测试反推。

## 12. 必须保持的系统不变量

1. **代际不可变：** 写入和确认不会就地改变既有 View generation；确认会创建并激活新 generation；
2. **接受边界明确：** Candidate 未确认前不能进入 Active View；
3. **来源可追溯：** View 中的内容能够解释其来源与有效版本；
4. **构建可重现：** 相同有效输入应得到语义相同的 View；
5. **旧状态不能覆盖新状态：** 基于旧 View 的写入需要冲突检测；
6. **禁用必须完整：** 被禁用来源不能通过任何读取方式、索引或缓存进入新的 Active View；
7. **删除必须清理派生引用：** 删除后不能从派生摘要或索引中恢复已删除内容；
8. **作用域隔离：** 项目、Session、Agent 和 Runtime 作用域不能意外串联；
9. **Runtime 语义一致：** 更换 Runtime 不应改变内容的接受状态与来源边界；
10. **失败不能伪装成功：** View 构建、查询、写入或确认失败必须被明确暴露。

## 13. View Infra 怎样进入测试

View Infra 测试的重点不是“模型是否按照规定流程工作”，而是：

> **当 Session、模型进程、Runtime 和项目内容发生变化后，mnemond 是否仍能构建出正确的项目环境，并由 dsh-sonar 正确暴露给模型。**

基本测试过程：

```text
准备项目内容与来源
        |
        v
构建并记录 View A
        |
        v
模型完成任务并产生候选内容
        |
        v
只确认应当长期保留的部分
        |
        v
删除旧 Session、重启 Runtime、修改或禁用来源
        |
        v
构建并记录 View B
        |
        v
模型继续项目工作
        |
        v
检查 View 差异和真实外部结果
```

### 13.1 五项核心验证

1. **准确：** View 中实际出现的内容准确、有限且可以重现；
2. **连续：** 删除旧对话和模型进程后，新 Session 仍能继续工作；
3. **可控：** 模型输出、远端结果和后台整理不会自动成为可信项目内容；
4. **可更新：** 确认、替换和撤销能正确影响后续 View；
5. **可移除：** 禁用或删除来源后，它立即离开 Active View，也不破坏其他能力。

### 13.2 必需测试场景

#### View 构建

- 相同项目状态重复构建，View 内容与来源清单一致；
- 多种内容来源共同构建时，选择、排序、去重和大小限制符合规则；
- 直接加载、展开入口和查询结果属于同一个 View 边界；
- View 构建失败时不会退化成无提示的空上下文或不受控的全量注入。

#### 确认边界

- 模型输出只生成 Candidate；
- 远端工具成功结果只生成 Candidate 或普通 Session 内容；
- 后台整理只生成 Candidate；
- 只确认候选集合的一部分时，其他候选不能进入 View；
- Reject、Discard 和确认失败不会改变 Active View。

#### 更新与并发

- 接受新内容后，旧 View 保持不变，新 View 包含更新；
- 替换内容后，新 View 不再选择旧版本；
- 撤销已接受内容后，新 View 不再包含该内容；
- 基于旧 View 的写入不能覆盖已经更新的内容；
- 两个 Runtime 同时写同一目标时能检测冲突并保留来源。

#### 禁用与删除

- 禁用一个来源后，直接加载内容立即从 Active View 消失；
- 该来源的展开入口和查询结果同时消失；
- 已建立的搜索索引、向量索引和缓存不能继续返回该来源内容；
- 删除内容后，其派生摘要和索引引用得到清理；
- 禁用或删除一个来源不影响无依赖的其他来源和能力。

#### 连续性与 Runtime 迁移

- 删除 Session 和客户端状态后仍可继续项目任务；
- 重启 mnemond 和 DSH Runtime 后能重建同一项目 View；
- 换用不同模型进程后不依赖旧进程的隐式记忆；
- 换用另一种 Runtime 后，内容选择、接受状态和来源边界保持一致；
- Runtime 呈现差异不会把未接受内容意外升级为已接受内容。

#### 真实结果

- 模型可以自由选择解决路径，不把 View Infra 测试变成固定 Agent 流程测试；
- 最终通过文件、程序行为、外部系统状态或其他真实结果判断任务是否完成；
- 对照实验记录静态 Markdown、普通 Skill、一般检索与 View 的实际差异。

## 14. 与当前 mnemond 测试基础的关系

现有 Agency View 测试已经为 View Infra 提供以下基础方向：

- 责任和内容能够跨模型进程、客户端状态和 daemon 重启继续存在；
- 旧 View 不能覆盖已经更新的内容；
- 远端结果不会自动成为本地已经接受的结论；
- 模型可以自由选择解决路径，最终由真实外部结果判断任务是否完成。

View Infra 需要在这些测试上继续扩展：

- 多种项目内容共同构建一个 View；
- 三种读取方式与三种写入方式边界清晰；
- 禁用、替换、撤销和删除能覆盖全部读取路径；
- 不同 Runtime 构建语义一致的项目上下文；
- 相比静态方案，确实减少新 Session 的解释成本、重复错误和返工。

## 15. 成功标准

如果 View Infra 只是把不同内容统一注入 Prompt，它没有独特价值。

View Infra 成立需要同时满足两类标准。

### 15.1 系统正确性

- View 准确、有限、可重现；
- 项目内容跨 Session、进程和 Runtime 连续存在；
- 候选与已接受内容严格分离；
- 更新、撤销、禁用和删除结果可验证；
- 用户能够解释和控制 View 的组成。

### 15.2 项目效果

与静态 Markdown、Skill 或普通检索相比：

- 新 Session 需要重复解释的项目背景更少；
- 已被修正的错误更少重复发生；
- 因上下文丢失或过期导致的返工减少；
- 初始上下文保持有限，不因项目增长而无界膨胀；
- 不同 Runtime 接手项目时的行为差异缩小。

这些指标需要通过可重复的对照任务验证，而不能只依赖主观印象。

## 16. 非目标

View Infra 当前不试图规定：

- 模型的思维链、规划算法或内部推理方式；
- Agent 必须使用的循环、状态机或任务分解流程；
- 多 Agent 必须采用的组织结构；
- 模型应当如何自主选择下一步；
- 所有项目内容必须使用同一种存储格式；
- 所有 Runtime 必须生成完全相同的 Prompt 文本；
- 任何模型输出可以绕过确认直接成为项目事实。

## 17. 待决问题

以下问题需要通过原型和测试确定，而不应在 View Infra 阶段过早固化：

1. 项目标识如何跨本地目录、Git 仓库和远端工作区稳定映射；
2. View 的最小标准数据结构与 Runtime 扩展字段如何分层；
3. View 是按 Session、Agent、任务还是多级作用域构建；
4. Session 内显式刷新 View 时，旧 generation 如何继续隔离；
5. 确认操作由 CLI、Web UI、模型工具还是多种入口共同承担；
6. 哪些写入可以由预先授权的策略自动接受，授权边界怎样表达；
7. 内容替换、合并和并发冲突的最小语义；
8. 禁用与删除时，缓存和索引失效如何提供可验证证明；
9. 不同 Runtime 之间怎样定义“语义等价的 View”；
10. 如何量化解释成本、重复错误和返工，并建立稳定对照基线；
11. dsh-sonar 内部 Cordis service 和子插件的最终命名与拆分；
12. mnemond 不可用时，Runtime 应失败关闭、使用已验证快照还是进入显式降级模式。

## 18. 最终判断

> 如果 View Infra 能让项目内容在不同 Session 和 Runtime 之间被准确构建、持续更新、明确确认并由用户完整控制，它才是 View Infra。

dsh-sonar 的任务不是在 DSH 内复制 Memory、Skill、Teamwork 和 Evolution，而是利用 Cordis 的全生命周期插件能力，把 mnemond 的 View 语义可靠地接入 DSH，并为这些上层能力提供共同、可验证的读写基础。
