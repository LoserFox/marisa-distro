# Decision: v2 第二轮审查修复批次（sprite 回归 / pet_status render / levelFor 挂起 / 健壮性）

Status: implemented

## Problem

对稳定后的 v2 代码做第二轮独立审查（Node half + client half 两个 subagent）发现：**H1 sprite 白屏回归**（replaceChildren 修复在并行会话「代码不预改」提交 87d3db0 中被一并回退，`stage.textContent=''` 又把 sprite 摘出 DOM——浏览器冒烟脚本当场抓到，exit 1）；**F2 pet_status 工具 render 崩溃**（schema 扁平化后 execute 返回扁平对象，render 仍喂给期望 state 形状的 describe → TypeError，工具调用即错）；F3 levelFor 线性 while 在巨量 xp 下可挂起宿主（1e300 即死锁）；F7 known 收缩只在列表为空时触发（残留终态任务即线性增长）；F9 浮点 xp 违 integer schema；F10 stats 未走 INITIAL_STATE 合并（未来字段静默丢失）、称号未去重；F16 mergeBurst 死代码；M3 位置恢复不 clamp（窗口变小后宠物永久离屏）；L5 lostpointercapture 缺失（拖拽可卡死）；M1 welcome 截断 error/disappointed 尾段；M2 wake 抢占 burst。

## Decision

- **H1**：`showSprite` 重应用 `stage.replaceChildren(sprite)` + 尺寸零值兜底（未声明尺寸 SVG → emoji）。**冒烟脚本强化**（M4）：断言 `pet-status`/`pet-lv`（apply 走完渲染管道）、双错误串（`Failed to load plugins` + `plugin tree failed to load`）、舞台内含 `.pet-sprite` 元素（非仅 class 字符串）——本次回归即被该工具抓住。
- **F2**：pet_status render 改为按扁平字段拼文本（`Lv.${value.level}（${value.xp} XP）…`）。
- **F3**：levelFor 改三角数列反函数闭式解 O(1) + 内部 `XP_SAFE_MAX=1e15`（防 `4*xp` 溢出成 Infinity）；normalizeState 加 `XP_CAP=1e12` 封顶 + `Math.floor` 取整。
- **F7**：deriveActivity 每轮把 known 收缩到当前任务 id 集合（残留终态任务不再线性增长）。
- **F10**：stats 走 `{...INITIAL_STATE.stats, ...}` 合并；titles Set 去重。
- **F16**：删除死代码 mergeBurst 与其测试。
- **M3**：localStorage 位置恢复时立即 clamp 进视口。
- **L5**：补 `lostpointercapture` 复位 dragging/moved。
- **M1**：welcome 只在无 error/disappointed 窗口时生效（失败失落不被新会话欢迎打断）。
- **M2**：wake 只在醒来原因非 burst/working 时触发（睡醒撞庆祝直接播庆祝）。

## Alternatives considered

**F2 用嵌套 `{ pet, ...flat }` 返回。** 多余字段违 output schema 的 `additionalProperties: false`——不用。

**F3 保留线性 while。** 手改 state.json 即可冻结整个 web——闭式解 + 上限双保险。

**M1/M2 保留原优先级。** welcome 盖失落、wake 抢庆祝是叙事违和——小守卫修正。

## Consequences

- 冒烟工具从"能查渲染"升级为"能抓 H1 类回归"（本轮实证：抓到并行会话回退引入的白屏）；pet_status 工具可用（模型决策前置）；levelFor 恒 O(1)；持久化容错更强。
- 新增 4 条单测（levelFor 巨量往返、xp 封顶/取整、称号去重、known 收缩）；删除 1 条死代码测试。
- **F1（记账依赖轮询）已随后续批次修复**：账本记账迁入 `ctx.tasks.onTaskDone` 事件驱动（页面关闭/轮询缺席不漏记；killed 中性，不计 XP 不写回忆）；activity() 只保留展示与活跃时长。实况：session-start→回忆/XP 入账链路验证通过。
- 已知未覆盖（留待后续）：F5 activeMs 观察窗口语义（GUI 关闭期间不累计——"陪伴时长"语义需产品定夺）、F12 会话计数语义（续接同计）——均为产品决策。
