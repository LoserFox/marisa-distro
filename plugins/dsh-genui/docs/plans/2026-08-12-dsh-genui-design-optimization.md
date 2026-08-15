# DSH GenUI 设计优化方案

> 状态：设计稿（未实现、未合并、未发布）
> 依据：`docs/plans/2026-08-11-dsh-genui-hardening-execution-plan.md` 的审计事实；代码基线为插件仓 `9b68c20`（v0.3.5）、宿主 `staging-20260811T152241Z`
> 一句话：**修掉审计发现的每一个根因，但把"硬性禁止 + 固定数字"的表述改成"安全边界 + 可调默认值 + 证据驱动的调整路径"，并且不删除、不回退任何已发布能力。**

---

## 1. 设计原则（取代原计划的"禁止方案"章节）

原计划把很多工程取舍写成了法律条文（"不得用 X""必须 ≤200""必须串行"）。本方案换一种写法：**三类边界，各按各的性质管理**。

| 边界类型 | 含义 | 管理方式 | 例子 |
|---|---|---|---|
| **安全边界** | 违反会泄露秘密、破坏用户文件、污染他人会话 | 不可配置，永远成立 | password 值不进 localStorage；安装器不跟随 symlink；面板发布不进 render 函数；E2E 不用 broad pkill |
| **规模/性能边界** | 防止病态输入卡死页面 | 集中在唯一一张默认值表，可调；调整要有证据 | 面板节点上限、partial 解析尝试上限、LRU 块数 |
| **语义边界** | 什么机制在什么场景下语义正确 | 写清楚适用场景与降级路径，不搞"一刀切禁用" | 内容指纹用于"同内容恢复状态"是正确语义，用于"消息身份"才是错误语义——按场景区分 |

三条总原则：

1. **修根因，但不搞技术洁癖**。某机制（如内容哈希）在 A 场景语义错误、在 B 场景语义正确，就按场景区分使用，而不是整体拉黑。原计划"任何阶段都不得用随机 ID、内容哈希、时间戳"是一刀切；本方案只禁止**语义错误的用法**：随机 ID/时间戳/`useId()` 不能当消息身份（不稳定），内容哈希不能当消息身份（两条相同内容的消息必须是两次独立操作）——但内容指纹作为 `stateKey` 的内容维度（判断"还是不是同一份内容"）恰恰是正确且已在生产验证的用法，保留。
2. **一切数量限制集中在一张默认值表**，默认值 = 当前已上线行为，改动需要证据（benchmark、真实样本、产品确认），而不是永远锁死，也不是随手放宽。
3. **不回退**。所有已发布、已演示、已有测试覆盖的能力全部保留：`scene3d`、全部 38 个组件、append 面板、本地判卷、durable 持久化、`/panel` 命令、v1/v2/v2.5/v2.6/v2.7 语义。安全边界上的行为改变（如 password 不持久化）必须是**不破坏渲染的降级**，不是删除功能。

---

## 2. 审计事实（沿用原计划，基线已前移）

| 项目 | 当前事实（v0.3.5 / 9b68c20） | 根因 |
|---|---|---|
| 面板追加 | `lastAppendSource` 记"最后一个追加来源" | A→B→A 重复追加；两条消息局部 key 都是 0 时第二条被吞 |
| 面板顺序 | 围栏以 `Infinity` 发布 | 一次围栏后所有有限 seq 的 `render_ui` 都无法再更新面板 |
| 面板上限 | 单条修复到 200 节点，合并后无总量限制 | 多轮 append 无限增长 |
| 表单 | `TabsNode` 未透传 `answers`（`renderNode` 的 tabs 分支漏参） | 标签页内 grouped radio / submit / 判卷断链 |
| 状态 | `fenceStateKey(sessionId, localFenceKey, fingerprint)`，localFenceKey 不是会话级身份 | 两条消息同位置同内容 → 串状态 |
| IME | Input Enter / Textarea Ctrl/Cmd+Enter 无组合态保护 | 中文选词 Enter 被误提交 |
| 敏感输入 | `password` 在公开 spec 中，带 id 字段一律明文进 localStorage | 模型界面可收集并持久化秘密 |
| partial | 对每个 `}` 重扫前缀 + 反复 `JSON.parse` | 24 KB 病态输入 O(n²)，约 1.68s |
| 3D | `scene3d-lazy.ts` 永久 `requestAnimationFrame` | 静止时持续占 GPU/电池 |
| 指针 | 面板拖拽、3D orbit 用 window 级 pointermove/up | 全局监听泄漏、卸载残留 |
| 安装器 | 对目标直接 `cp` | 可能覆盖 symlink 指向的用户文件 |
| E2E | 日志路径声明但子进程输出被丢；本地 chip 文字变化算"响应" | 失败无日志、假通过 |
| 构建 | CSS Modules classMap 键序漂移 | 同源码重复构建产物不一致 |
| 包体 | `files` 含 `src`、sourcemap、中间 JS | 发布包 4.82 MB / 25.16 MB，含源码逃生口 |
| 最低版本 | README 写 `47d230e`，实际清单契约需 `0545fdcb`，且尚未有 FenceSource 契约 | 按文档安装可能加载失败 |
| 远端 CI | 三次运行在 runner 分配前被 Billing 拦截 | 远端无真实门禁 |

原计划对这些事实的根因定位全部成立，本方案沿用，**只改"怎么修"的表述与弹性**。

---

## 3. 围栏来源契约（宿主侧）

### 3.1 契约形态（保留原方案核心）

```ts
export interface FenceSource {
  /** 稳定结构身份，如 ['assistant', finalMessageSeq, textBlockIndex, fenceIndex] */
  id: string
  /** 三段顺序：消息 seq、文本块序号、围栏序号 */
  order: readonly [messageSeq: number, textBlockIndex: number, fenceIndex: number]
}

export interface FenceRenderContext {
  /** 归属会话；非会话内渲染时缺省 */
  sessionId?: string
  source?: FenceSource
}

export type FenceRenderer = (raw: string, reactKey: Key, context?: FenceRenderContext) => ReactNode
```

- 宿主从 settled/interrupted 的 `finalNode.seq` 生成稳定 `source`；streaming 阶段 `source` 为空。
- `fenceIndex` 必须来自 settled 文档的稳定围栏顺序，不得用挂载次数、随机数、时间。
- 会话 ID 走 `context.sessionId`，不塞进 `source.id`。

### 3.2 柔性化改动（相对原方案）

1. **第三个参数可选**。`context?: FenceRenderContext`，不是必填。原因：契约升级期必然存在"新插件 + 老宿主"组合。老宿主不传 context 时，插件按明确的降级规则运行（见 3.3），而不是崩掉。这不是"兼容层掩盖根因"，而是**契约升级的标准平滑路径**——主仓和插件可以各自独立发布，不要求原子协同。
2. **source 身份允许"尽力而为"降级链**。优先 `['assistant', seq, block, fence]`；宿主在某条渲染路径上拿不到稳定 seq 时（如无状态历史日志重放），允许降级为消息自身稳定 key（如消息 id）+ block + fence。降级不影响正确性：身份只需要**同一来源重放时稳定、不同来源之间可区分**；seq 只是首选实现。原计划"任何阶段都不得用 X 绕过"的表述取消，改为：**身份必须满足"稳定 + 可区分"两条性质，用什么字段实现是宿主的事**。
3. **`source.id` 不搞"哈希一律禁止"**。若宿主有稳定的消息内容寻址（而非随机/时间），用它拼身份同样是合法的——性质正确即可。

### 3.3 插件侧降级规则（无 context 的老宿主）

| 情况 | 行为 |
|---|---|
| `panel:true` 且无 `context.sessionId` | 不写面板仓库、不持久化；渲染 `null`（面板本来就是"有宿主会话路由才存在"的表面） |
| 普通 inline 且无 context | 正常渲染 UI；`stateKey` 为 `undefined` → 不写 localStorage（与现 streaming 行为一致） |
| 有 `sessionId` 但无 `source`（streaming） | 渲染 inline UI；不发布面板、不持久化 |
| 有 `sessionId` + `source`（settled） | 完整行为：发布面板 / 用 `sessionId + source.id + fingerprint` 建 stateKey |

插件不再依赖 `active-session.ts` 的全局当前会话猜测（该模块退役，见第 5 节），彻底消除跨会话误投递。

### 3.4 宿主测试（保留原列表，语义不变）

两条 settled 消息局部 key 均为 0 → source.id 不同；text block / fence 维度区分；同一消息重放身份一致；两会话交错不串；streaming → settled 只出现一次稳定 source；老宿主无 context 不崩溃。

---

## 4. 面板操作模型（插件侧）

### 4.1 核心模型（保留原方案）

```ts
type PanelOrder = readonly [number, number, number]

interface PanelOperation {
  sourceId: string
  order: PanelOrder
  mode: 'replace' | 'append'
  spec: GenuiSpec
}
```

每个 session 保存：

- `Map<sourceId, PanelOperation>`（持久消息/工具操作）
- 至多一个 **overflow barrier**（首个因超限被拒的完整 append 的副本，供更早乱序 replace 到达时重算）
- 本地 `/panel` override（默认面板或 clear + 屏蔽到的最大 message seq）
- 只读折叠快照

发布规则：

- 围栏（settled + 有 context）：`sourceId = context.source.id`，`order = context.source.order`，`mode = append | replace`（按 spec.append）。发布走 keyed publisher 组件 + `useEffect`，**不在 render 函数里写 store**；StrictMode 双 effect 由 Map 按 sourceId 去重。
- 工具结果：`sourceId = ['render_ui', block.callId]`，`order = [block.seq, -1, 0]`，`mode = replace`。与围栏进同一个管道，删除第二套排序规则。

### 4.2 折叠算法（保留原方案核心，重写为"默认 + 可配"）

每次首次收到新来源，做一次事务式候选折叠：

1. 来源早于/等于本地 barrier → 拒绝旧重放。
2. `sourceId` 已在 Map 或正是 barrier → 幂等返回，不重复通知。
3. 已存在 barrier：不晚于 barrier 的 append 可进入候选重算，更晚的 append 拒绝；replace 一律进候选（"最新 replace 胜"）。
4. 用临时副本（不先改正式 Map），按三段 order 升序排序，从最新有效 replace 开始折叠，更早操作裁掉。
5. `replace` 直接替换；`append` 复用纯函数 `mergePanelSpecs`（同标签 tabs 合并、其余尾部追加），append spec 必须至少一个有效节点。
6. 每次 append 后用现有的 `validateGenuiSpec` 节点计数**复用同一遍历**；超过 `PANEL_LIMITS.maxNodes`（默认 200）→ 记为首个 overflow barrier，跳过它及更晚 append，保留此前合法快照。禁止第二套遍历，禁止把超限 spec 交给 React。
7. 最新 replace 之后最多保留 `PANEL_LIMITS.maxAppends`（默认 200）条 append；第 201 条即使节点没增长也按 barrier 规则要求下一次 replace。这是 operation Map 的内存上限——**拒绝而非 LRU 淘汰**，因为淘汰会破坏确定性折叠（结果依赖到达顺序），这是语义理由，不是"禁止 LRU"的教条。
8. 候选快照、裁剪后的 Map、barrier 全部计算成功才一次性提交；校验异常保持旧状态；快照真正变化才通知一次。
9. 更晚 replace 成功后清掉更早操作与旧 barrier；session 销毁时清空全部。

### 4.3 柔性化改动

1. **所有上限集中到一张表**：

```ts
export const PANEL_LIMITS = {
  maxNodes: 200,    // 与 GENUI_LIMITS.maxNodes 同值，但独立可调
  maxAppends: 200,  // 最新 replace 后允许的 append 条数
} as const
```

  原方案要求"直接复用 `GENUI_LIMITS.maxNodes`，不新增另一项配置"——这本身就是一种僵硬：面板总量与单条 spec 的节点预算未必永远同值（面板是合并结果，理论上可以给更高预算）。本方案允许两者解耦，默认同值。
2. **超限后的恢复路径明确**：任何 replace 都能清掉 barrier 重开 append（原方案已有）；系统提示/SKILL/诊断统一要求"面板达上限后发送 replace"。不引入虚拟列表（面板上限本来就该让模型换内容，而不是无限堆）。
3. **tie-break 规则写明**：三段 order 相同（同消息同位置重放）时按到达顺序后到者胜——这只在"同一条操作的重复提交"发生，Map 按 sourceId 去重后实际不产生歧义；写明是为了测试可断言，不新增隐藏排序。
4. **不要求所有到达严格有序**。乱序（B 先到 A 后到）由折叠算法天然处理，测试覆盖即可，不强制调用方保证顺序。

### 4.4 `/panel` 本地命令（保留）

`setLocalPanel / clearLocalPanel` 作为明确本地接口，记录 barrier；下一条更晚的真实操作可越过 barrier，旧历史重放不能复活面板。不伪造 `Infinity`/`MAX_SAFE_INTEGER` 消息。折叠时 local override 作 base，再处理 barrier 之后的操作。

### 4.5 inline 状态身份（保留核心 + 降级路径）

- streaming / 无 context：`stateKey = undefined`，不写 localStorage。
- settled + context：`fenceStateKey = sessionId + source.id + fingerprint(spec)`。fingerprint 只做**内容维度**（同内容恢复状态、新内容换新 key），来源身份做**位置维度**——两个维度语义不同，各司其职。
- 顶层 ErrorBoundary 的 React key 用 `source.id ?? reactKey`；删除 `GenuiBlock` 内部无效重复 key。
- 面板组件：`stateKey = panelStateKey(sessionId, JSON.stringify(spec))` 只计算一次，同时作 ErrorBoundary key 与 GenuiBlock stateKey，内容变化整树原子重建（不用 `useEffect([stateKey])` 分步清空）。

`active-session.ts` 退役：面板定位只来自 context.sessionId 与工具卡 props.sessionId。无 context 的宿主上面板功能自动不可用（降级），这是契约升级的代价，明确写入 README 兼容矩阵。

---

## 5. 表单、状态、IME 与敏感输入边界

### 5.1 tabs 透传块级答案状态（保留）

`renderNode` 的 tabs 分支补 `answers={answers}`，`TabsNode` 不新建仓库/Context。测试：tab 内 grouped radio + input(id) + submit、本地判卷锁定/重做、切 tab 状态保留、payload 同时含 answers 与 fields。

### 5.2 简化答案状态（保留）

删除未被读取的 `AnswerEntry.label`：内存答案改 `Record<string, string>`；`setAnswer` 只比字符串；题目显示唯一读 `QuestionMeta.label`；localStorage 本就是字符串表，不迁移不加兼容层；submit payload 不再二次转换；Radio 的 React key 加入 `round`，删除"监听 round 再 setSelected"的同步 effect。验收：v2.5/v2.6/v2.7 行为不变、代码净减少。

### 5.3 字段不变量（保留）

- `value.trim() === ''` → 从共享 `fields` 删除该 id；非空保存用户原字符串，payload 不擅自 trim。
- Input/Textarea 初挂时把非空 `node.value` 注册进 fields。
- Submit 的 `answered`/`ready`/payload 统一用同一个 `filledFields`，防御性过滤空白。
- 不把"任一字段非空即可提交"擅自改成"全部必填"。

### 5.4 IME 保护（复用宿主已验证的三层判定，保留）

Input 的 Enter 与 Textarea 的 Ctrl/Cmd+Enter 使用宿主主输入框同款三层保护：

1. `compositionstart` → 置 composing ref；
2. `compositionend` → 延迟 10ms 清 ref（覆盖 Safari closing keydown 顺序）；
3. keydown 同时查 ref、`nativeEvent.isComposing`、`nativeEvent.keyCode === 229`。

这是"复用已验证实现"，不是新发明。测试：isComposing:true 不提交、keyCode 229 不提交、compositionEnd 后紧跟 Enter 不提交、延迟结束后普通 Enter 只提交一次、Textarea Ctrl/Cmd+Enter 同路径。真实验收：隔离页面中文拼音"候选 → Enter 选词 → 再 Enter 提交"，第一次 Enter 不产生模型消息。

### 5.5 敏感输入：安全降级而非删除（本方案与原方案的关键分歧）

原方案：删除 `password` 能力（spec 去类型、guard 丢节点、全文档删教学）。
本方案：**保留渲染能力，封死数据出口**。理由：删除能力会让已生成的界面（历史消息、外部 demo）在升级后整块消失或变成明文文本框，是用户可见回退；而安全问题的本质是"秘密被收集 + 被持久化"，不是"输入框有密码类型"。

设计：

1. **渲染**：`inputType: 'password'` 保持合法，`<input type="password">` 本来就打码显示。guard 不再丢节点（原方案"不得静默去掉属性后渲染成可见文本框"的担忧不存在——它本来就 masked）。
2. **持久化**：`interaction-store` 对 password 字段**跳过写入**——`saveBlockState` 过滤 `fields` 中的 password 输入值；`loadBlockState` 也不恢复（每次刷新密码字段清空，与浏览器密码框语义一致）。
3. **提交**：password 字段值可随 action payload 发给模型（用户显式输入 = 授权使用），但**不进 localStorage**、不进 submit 的 `fields` 收集？——这里取折中：**不持久化 + 不进 submit fields 收集**（submit 的 fields 是"表单数据收集"，与持久化同源），但带 `action` 的 password 输入仍可即时发送。这样"模型界面收集密码"的成本从"静默落盘"变成"用户亲手提交一次"，是可控边界。
4. **教学**：系统提示、SKILL.md、README 删除 password 教学，增加明确规则：**GenUI 不得索取密码、API Key、访问令牌、恢复码或其他秘密**；示例中出现的密码一律用占位符说明。
5. **测试**：password spec 渲染为 masked input；刷新后值不恢复；`localStorage` 无该字段；submit payload 不含 password 字段；恶意 spec 不产生可见明文。

这是"能力保留 + 数据出口收紧"的安全降级，满足"不能有回退"同时堵住真实风险。

### 5.6 诚实点击反馈（保留）

按钮本地 chip 文案"已响应"→"已触发"（只证明本地事件触发，不暗示模型已收到）。不扩展 `GenuiActionHandler` 为 Promise；宿主提供统一发送失败反馈通道后再做异步成败状态。现有 catch 至少记录不含 action payload/秘密值的错误 + session 定位，不无声吞掉。

---

## 6. 解析、3D 与指针性能

### 6.1 partial 解析：单次前向扫描 + 有界尝试（保留核心，上限可配）

- 完整 `JSON.parse` 最多一次（常见路径）。
- 一个小型纯候选收集器从左到右只读原文一次：正确跳过字符串/转义，维护括号栈；在有效对象闭合且栈深 ≤ `GENUI_LIMITS.maxDepth` 时记录 `{ end, closingSuffix }`，环形缓冲保留最长方向的 `MAX_PARTIAL_REPAIR_ATTEMPTS`（默认 32）个候选。
- balanced prefix 与 unfinished candidate 在同一次扫描合并去重；扫描结束后从最长候选开始 parse。**禁止**在 `}` 循环里 `scanBrackets(text.slice(...))` 或对任一 prefix 二次扫描。
- 达到尝试上限返回 `null`，等待更多流式内容或 settled fallback——这是流式路径的固有节奏，不是失败。
- 不引入 tokenizer 依赖。理由写清楚：解析器库对"一次前向扫描 + 少量 parse"的场景是过重依赖；**只有当真实流式样本证明恢复率不足时**，才按证据切换到 tokenizing parser——这是明确的调整路径，不是"永远不许换"。
- 测试：病态 24 KB / 8000 闭合对象输入；收集器暴露 `scannedChars` 诊断值（不从包入口导出），断言 = 输入长度且候选 ≤ 上限；spy `JSON.parse` 断言总调用 ≤ 完整 1 次 + 上限 N 次；同机 20 次 benchmark P95 < 50ms 作为本地证据（不做易抖动 CI 断言）。

### 6.2 scene3d：保留产品能力，只修永久帧循环（不回退）

- **不删除 scene3d**（已公开、已演示、gallery/demo 在使用）。原方案"使用为 0 + 产品确认"的删除门保留为独立决策门，但本方案默认不启动该门——删除是产品决策，不是工程优化。
- 事件驱动渲染：初始化完成后 render 一次；orbit 更新相机后立即 render 一次；pointer move（拖拽中）与 wheel 触发 orbit + render；静止时 0 个持续动画帧。
- 保留 mesh/geometry/material/renderer 的正确 dispose。
- 测试：初始化后 renderer 只 render 一次；静置一秒不增加；一次 drag move 与一次 wheel 各增加一次；headless Chrome 中拖拽缩放仍有效；Performance 录制静止场景无持续 RAF。

### 6.3 Pointer Capture 取代全局监听（保留）

- 面板拖拽：`pointerdown` 在 handle 上 `setPointerCapture(pointerId)`，move/up/cancel 全绑 handle；删除 window pointermove/pointerup 注册/注销/清理 effect；保留 120–600px 夹取、折叠后高度记忆、可访问性 separator。
- 3D orbit：拖拽移到 canvas pointer capture（canvas 已独占 pointer 事件，`wheel` 的 `{passive:false}` 保留），删除 scene3d 的 window 监听。
- 测试：拖出元素边界仍连续、pointercancel 清 active、松手后不再变化、卸载无残留、源码不再出现 window pointer listener。

---

## 7. 构建、包体、安装器

### 7.1 确定性构建（保留）

CSS Modules classMap 构造前按本地类名做固定 UTF-16 排序（不用 `localeCompare`，避免 locale 差异；不改 hash 值，只固定键序；不新增测试专用生产导出）。验收：同一干净 worktree 连续构建 5 次 `shasum -a 256 lib/client.js` 一致；macOS 产物在 Ubuntu CI 重建无 diff。

### 7.2 从 src 直接构建，tsc 只产声明（保留，原子提交）

- `tsconfig.json`：`emitDeclarationOnly: true`；关 `declarationMap`，删无意义 `sourceMap`；单包无 project reference → `tsc -p tsconfig.json`，删 `composite`/`incremental`，不再生成 `.tsbuildinfo`。
- tsdown：client entry `src/client/index.tsx`；Node entries `src/plugin/index.ts`、`src/plugin/invariant.ts`；CSS 按源码 importer 解析，删除 `sourceAssetPath`/`existsSync`/`sep`/`lib/types` 回溯；生产浏览器包关 sourcemap；按当前 tsdown 类型把 `external`→`deps.neverBundle`、`noExternal`→`deps.alwaysBundle`、`inlineDynamicImports`→`codeSplitting:false`。
- 删除 `lib/types` 下中间 JS/JS map/d.ts map；保留 d.ts 与顶层三个运行 JS。
- 验收：`node --check` 三个 JS；`test -z "$(find lib/types -type f \( -name '*.js' -o -name '*.map' \) -print -quit)"`（失败时打印完整 find 结果帮助定位）；tsdown 无废弃配置警告。

### 7.3 依赖按真实运行边界归类（保留）

`mermaid`、`three` → devDependency（已内联，仅构建需要）；`react` → peer + dev；`react-dom` → dev only（源码零 import，删除 peer）；DSH 内部包 + cordis → peer。删除 EXTERNALS 中未实际 import 的 `react-dom`/`react-dom/client`；更新锁文件；修正文档"git/link 安装需下载 Mermaid/Three/React"的过期说法；验证生产 bundle 无 `require('mermaid')`/`require('three')`/`require('react-dom')`。**不虚报 bundle 收益**（9.02 MB 主包不会因依赖归类变小）。

### 7.4 工具链（柔性化）

```json
{
  "packageManager": "pnpm@11.7.0",
  "engines": { "node": "^22.19.0 || >=24.0.0", "pnpm": ">=11.7.0 <12" }
}
```

- `packageManager` 写当前锁定版本是 corepack 惯例（只约束 corepack 用户，`corepack use` 随时可改），不算刚性锁死；engines 用范围。
- 安装脚本**不自动改用户全局工具链**：pnpm 不满足时打印明确命令并失败（原方案），但**不执行** `corepack enable`。
- CI 与本地都走 `corepack pnpm`，不落回 PATH 裸 pnpm——这是可执行约定，不是设计教条。

### 7.5 发布包表面（保留核心，阈值可配）

- 删除 `exports['./src/*']`；保留 `exports['./package.json']`（安装器与 DSH 客户端模块发现都要解析包清单）。
- `files` 明确白名单：`lib/index.js`、`lib/invariant.js`、`lib/client.js`、`lib/types/plugin/index.d.ts`、`lib/types/plugin/invariant.d.ts`、`lib/types/client/index.d.ts`、`SKILL.md`、`README.md`、`CHANGELOG.md`、`demo-prompts.md`、`cordis.patch.yml`。`package.json`/`LICENSE` 由 npm 强制包含，列入 pack 校验允许清单。
- 新增 `scripts/verify-pack.mjs`：读 `npm pack --dry-run --json`，断言三个运行 exports 的 JS 与类型入口存在、`./package.json` export 可解析、无 `src/`/`.map`/`.tsbuildinfo`/`lib/types/**/*.js`、压缩包 < 3 MB、解包 < 10 MB。**阈值支持环境变量覆盖**（如 `GENUI_PACK_MAX_TARBALL`），默认值 = 本方案目标；发现未知文件或超限时列出实际条目，不静默放宽。

### 7.6 安装器文件安全边界（保留——安全边界不可配）

安装器先验证 profile 参数只含允许字符；Node 解析路径用环境变量，不把用户路径插进 `node -e` 字符串。Skill 同步分类：

| 目标状态 | 行为 |
|---|---|
| 不存在 | 同目录临时文件 + 原子 mv 创建 |
| 普通文件 | 同目录临时文件 + 原子 mv 替换 |
| symlink 解析后与来源同一文件 | 成功跳过，不改链接 |
| symlink 指向其他文件 | 安全失败，显示目标，不跟随写入 |
| 悬空 symlink | 安全失败 |
| 目录 | 安全失败 |

- 不再直接 `cp`；临时文件异常退出要清理；冲突与包内 Skill 缺失必须非零退出；pnpm 缺失不自动 `corepack enable`。
- 测试：临时 `DSH_HOME`、假 `dsh/pnpm/git`、真实 shell 驱动七类场景；最关键用例断言"不同目标 symlink 指向的哨兵文件字节不变"。

---

## 8. E2E、CI、文档与发布

### 8.1 E2E 预检（保留）

启动任何进程前：`--install` 仅限 `link|tarball|git`，tarball 必须给实际 `.tgz` 绝对路径 + 预期 SHA256；端口合法且空闲（未指定用 Node 标准库申请）；`--dsh-root`/`--dsh-bin` 绝对路径且 `realpath(dsh-bin)` 在 `realpath(dsh-root)` 内；默认不从 PATH 找 `dsh`；记录 `git rev-parse HEAD` 并与声明宿主 SHA 一致；日志开头打印宿主 SHA、插件 SHA、Node/pnpm 版本，不打印任何 Key；检查宿主含 fence source 契约；link 模式三入口存在、tarball 文件与 SHA 匹配、git 模式固定完整 ref；吸收现有 `scripts/e2e.mjs` WIP（filechooser 选择临时工作区、等待 composer 脱离 inert/disabled，超时保存截图与日志并失败，禁止 `.catch(() => {})` 假容错）；完整模型模式要 Key 但绝不打印，`--smoke` 不要求。

### 8.2 真实日志与窄清理（保留）

web stdout/stderr 真写 `webLog`；启动失败输出日志尾部；cleanup 放 `finally`（不依赖 `process.on('exit')`）；先精确 child/process group 正常终止、超时才强杀；禁止 broad `pkill`、不碰用户现有 3080 listener；失败保留/复制日志与截图到稳定 artifacts，成功才清临时目录。

### 8.3 杜绝 action 假通过（保留）

点击前记录最后一个 `[data-chat-flow-kind="assistant-step"]` 的 `data-chat-flow-key`；等当前助手完成（无 `[data-streaming]`）；点击；必须出现新 assistant-step key 且新节点结束 streaming，**或**出现由新 operation source 驱动的面板快照；仅按钮 chip / 同 DOM 文本变化不算响应；`pageerror`、client.js 404、新回复超时都失败。git 安装固定 `--ref <完整 SHA>`。

### 8.4 两层 E2E（保留）

`--smoke`（每 PR，不用模型额度：宿主二进制、安装、profile、首页 200、client.js 200、无页面异常、插件 boot）+ 完整 E2E（手动发布门禁，受保护 Key：模型 fence、UI、action 消息、真实新助手回复、面板更新）。完整 E2E 必测三条路径且同一宿主 SHA：link 候选、tarball + SHA256、git 固定插件 SHA。tarball 路径承担 7.2 之后延后的普通围栏、Mermaid、scene3d、真实 profile 加载验收。

### 8.5 CI 矩阵（柔性化）

- 统一 `DSH_ROOT`（CI 先算规范化绝对路径再克隆；checkout 后断言 rev-parse 等于目标 SHA；`DSH_BIN` 固定为构建出的绝对路径；vitest.config 真读 `process.env.DSH_ROOT`，默认才用本机路径；阶段 1 未合并时用 `/private/tmp` 生成仅当次的 paths 覆盖，绝不提交机器绝对路径；`test -f "$DSH_ROOT/packages/client/ui-primitives/src/index.ts"` 预检）。
- **默认矩阵**（不是"必须两个"）：Node 22.19.x + 最低宿主 SHA（最低支持线）+ Node 24.x + 当前 main（前向集成）。每矩阵跑冻结安装、类型检查、全量测试、构建、pack 校验、lib drift、no-key smoke。矩阵数量是发布负责人的默认选择，可按实际支持面增删。
- Billing 未恢复时如实报告"本地与 PR 完成，远端发布门禁阻塞"，不跳过后宣称完成。

### 8.6 文档事实修正（保留）

README：删"commit >= SHA"表达；写"需要包含阶段 1 宿主提交 `<SHA>` 的 DSH 版本"；历史说明指出 `0545fdcb` 是旧清单契约最低点但不满足 FenceSource 契约；删硬编码"135 测试"；"面板可无限长大"→"整面板默认最多 200 节点，达到上限后应发送 replace"；删 git/link 需下载 Mermaid/Three/React 的过期说法；删 password 教学、加秘密禁令；更新 E2E 命令与 smoke/固定 SHA 说明。CHANGELOG 保留历史数字不伪造；SKILL.md 与系统提示同步：stable panel 语义、节点/操作上限默认值、password 不持久化、append 达上限后 replace。

### 8.7 发布候选（保留兼容元组，数字不锁死）

`HOST_SHA`（含阶段 1 契约、已进入受支持分支）+ `PLUGIN_SHA`（含版本/changelog/锁文件/确定产物）。严格顺序：宿主契约先入受支持分支 → 插件全量完成 → 版本 0.4.0 定稿 → 从干净 SHA 重建重测 → 远端矩阵 → git 路径 E2E → **未获授权停在 PR/候选** → 合并后重读实际 `PLUGIN_SHA_FINAL` 重跑全部证据 → 冻结唯一发布元组 → 授权后建 tag/Release → 全新 `DSH_HOME` + 精确 `DSH_BIN` 安装验证后才转正式。0.3.x 不补造历史标签。版本号与数字阈值都是默认值，随发布事实对齐。

**发布渠道红线（2026-08-12 用户确认）**：宿主仍处测试期，**npm/Workshop 等任何公开分发渠道一律不可用**——`npm publish` 会把插件（及宿主生态的存在）公开化，明确禁止。`npm pack`/`verify-pack.mjs` 只做本地 tarball 验证，永不发布。分发只走**私有 Git URL**（`git+ssh` 或私有 registry 由发布负责人另行确认）。README 等随包公开文档不得出现宿主内部信息（宿主 SHA、快照名、契约实现细节）。

---

## 9. 与原方案差异对照表

| # | 原方案（刚性表述） | 本方案（柔性表述） | 理由 |
|---|---|---|---|
| 1 | "任何阶段都不得用随机 ID、内容哈希、时间戳、兼容层" | 按语义边界区分：身份必须"稳定 + 可区分"；哈希只能用于内容维度；兼容层只在契约升级期作为平滑路径 | 一刀切禁用会误伤正确用法（指纹本就是 stateKey 的内容维度） |
| 2 | `FenceRenderer` 三参数必填、一次性切换 | 第三参数可选，插件侧有明确降级链 | 新插件 + 老宿主组合不崩，主仓与插件可独立发布 |
| 3 | 面板"直接复用 maxNodes=200，不新增配置" | `PANEL_LIMITS` 独立表，默认 200，可解耦 | 合并后总量与单条预算语义不同，允许按证据调 |
| 4 | 第 201 条 append / 201 节点：永远拒绝 | 拒绝 + barrier + replace 恢复路径 + 上限可配 | 上限是性能边界不是法律；恢复路径本来就存在 |
| 5 | "不引入 LRU" | 拒绝而非 LRU 淘汰，写明语义理由（淘汰破坏确定性折叠） | 结论相同，但给的是理由不是禁令 |
| 6 | 删除 password 能力 | 保留 masked 渲染；值不持久化、不进 submit fields；教学层禁秘密 | 不删除能力 = 不回退；封数据出口 = 安全边界 |
| 7 | 固定 32 次 parse 上限 | `MAX_PARTIAL_REPAIR_ATTEMPTS` 默认 32，可配 | 性能边界可调 |
| 8 | scene3d 删除门（使用为 0 + 产品确认） | 保留 scene3d，删除门是独立产品决策门，默认不启动 | 不回退已发布能力 |
| 9 | pnpm@11.7.0 固定、失败即停 | packageManager 锁当前版本（corepack 惯例）+ engines 范围；失败给命令不自动改 | 工具链可升级，约定可执行 |
| 10 | pack 阈值 <3MB/<10MB 写死 | 默认同值 + 环境变量覆盖 | 规模边界可配 |
| 11 | CI 矩阵"设置两个阻塞矩阵" | 默认两矩阵，可按支持面调整 | 发布负责人的默认选择 |
| 12 | "必须按阶段 0→6 串行推进，不得跨阶段并行修改同一核心文件" | 依赖关系保留，物理顺序放开：文件不相交的改动可并行；核心文件冲突矩阵约束 | 串行是项目管理偏好，不是设计正确性要求 |

**保持不变的部分**（根因修复，原方案正确）：panel operation Map + 三段排序 + 事务折叠；发布不进 render 函数；StrictMode 去重；`/panel` barrier；tabs 透传 answers；AnswerEntry.label 删除；字段不变量；三层 IME 保护；单次前向扫描 partial；事件驱动 3D；pointer capture；CSS 固定排序；src 直构建 + 声明 only；依赖归类；安装器七类目标安全失败；E2E 预检/真实日志/防假通过；文档事实修正；发布兼容元组与授权门。

---

## 10. 交付顺序（按依赖，不强制物理串行）

依赖关系（DAG）：

```
宿主 FenceSource 契约 ──► 插件面板操作模型 ──► 表单/状态/IME/敏感输入 ──► 解析/3D/指针 ──► 构建/包体/安装器 ──► E2E/CI/文档/发布
```

执行规则（替代"串行推进"）：

1. **同文件冲突矩阵**：`GenuiBlock.tsx` 是表单阶段独占；`index.tsx`/`panel-store.ts`/`panel.tsx` 是面板阶段独占；`parse-partial.ts`/`scene3d-lazy.ts` 是性能阶段独占。任一时刻一个核心文件只有一个改动分支持有——这是防冲突的最小约束。
2. **依赖性任务必须等上游**：面板模型依赖宿主契约落地（或按 3.3 降级链先行实现 + 老宿主测试，宿主合并后补全量测试——两条路都合法，写明即可）。
3. 构建/包体/安装器与宿主无关，可与面板阶段并行。
4. 每个阶段交付 = 定向测试 + 全量测试 + typecheck 绿 + 阶段验收命令绿，验收标准见第 11 节。

---

## 11. 测试与验收（默认值 + 可配验证）

沿用原计划全部测试用例清单（面板 append/重放/顺序/上限/StrictMode、状态隔离、IME、partial、3D、安装器、E2E 防假通过），并新增/替换：

| 用例 | 断言 |
|---|---|
| password 渲染 | masked input DOM 存在、非明文 |
| password 持久化 | 刷新后值不恢复；localStorage 无该字段；submit payload 不含 password 字段 |
| 无 context 老宿主 | 插件渲染 inline 不崩、不写面板、不写 localStorage |
| 可配上限 | 注入 `PANEL_LIMITS` 测试值（如 maxNodes=5）后超限行为随配置变化 |
| 同 order tie-break | 后到者胜，Map 按 sourceId 去重后无歧义 |
| 事件驱动 3D | 初始化 render 一次、静置不增、drag/wheel 各一次 |
| parse 上限可配 | 注入小上限后 parse 调用数 ≤ 完整 1 次 + 注入值 |

阶段门禁命令与 7.x 验收命令沿用原方案（`vitest run`、`tsc -b`、`tsdown`、`verify-pack.mjs`、lib drift、连续 5 次构建 SHA 一致），其中"pnpm 版本精确等于 11.7.0"改为"corepack pnpm --version 满足 engines 范围"。

## 12. 不回退清单（验收时逐项勾选）

- [ ] `scene3d` 渲染、拖拽、缩放、dispose 全部保留，仅去掉永久 RAF
- [ ] 38 个组件类型、guard 白名单、gallery 统计一个不删
- [ ] append 面板（tabs 按标签合并、尾部追加）语义保留
- [ ] 本地判卷（submit 就地判分、锁定、重新作答）保留
- [ ] durable 持久化（同内容恢复、换内容清空）保留，password 除外
- [ ] `/panel`、`/panel clear`、`/panel <指令>` 保留
- [ ] v1/v2/v2.5/v2.6/v2.7 既有测试全部保留并保持绿
- [ ] 现有 208+ 测试一个不删（只增改断言错误的旧预期，如 Infinity 永远胜）
- [ ] 安装仍只走 bundle（`cordis.patch.yml` 只 insert 一次自己，profile patch 保持 `[]`）
- [ ] 不触碰活跃 3080 服务与用户浏览器（E2E 全部隔离环境）
- [ ] 发布未获授权前停在 PR/候选，不合并、不打 tag、不发布

---

## 13. 一句话总结

> 审计发现的根因一个不少地修；**安全边界不可配，规模/性能边界集中可配，语义边界按场景写明**；能力只降级不删除，行为只收紧不回退；阶段按依赖推进但不强制串行。原计划的"禁止方案"章节全部改写为"理由 + 默认值 + 调整路径"。
