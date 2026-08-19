# 批次 2 验收裁决记录（requires 门执行面）

> 日期：2026-08-13 ｜ 状态：已验收 ｜ 收工 HEAD：`250a598`
> 范围：交付报告回议节 5 条裁决 + 簿记更正 1 条 + Known Limitation 落档去向。
> 本文为工作备忘录（docs/next 惯例），不入冻结文档。

## 1. 簿记更正

- 批次 2 交付报告 §1 任务 2.1 判定锚更正：「review#1 A1」→「**review#2 A1**」
  （DG-1 旗舰验证在 review#2 合并批 item 0 定案；review#1 无 A1 条目）。

## 2. 回议裁决（5 条，用户裁定）

| # | 事项 | 裁决 | 登记去向 |
|---|---|---|---|
| 1 | verifyConsumerSymbolsAfterReplace 与 reconcile 双检冗余 | **保留**（go-live 前置门 + 收敛双保险，成本近零）；A2-adopt 用例不改挂 | — |
| 2 | effect/设置不随政策停用撤销 | **维持最小执行面**（术语强定义不含 effect；设置属配置面） | 设计注记待后续文档轮 |
| 3 | policyStop 不发事件 | **维持**（面板经 handleOf 信息面可观察，无具名消费者，不加词汇面） | — |
| 4 | wrapProvidedValue 签名变更（移除 recordAccess 参数） | **接受**（rc 线、仓库内零调用方，grep 证实仅 index.ts 导出） | release notes 待办 |
| 5 | A14 撤下后配额槽位不回收 | **接受保守方向**（不放开注册上限） | backlog 登记（消费者不明，暂缓） |

## 3. Known Limitation（批次 2 报告 §7，维持有效）

1. 重启后门状态还原待批次 3（A3）：lockfile 零改动约束下 requires/symbolAliases
   不落盘，重启后政策闸无输入（全 active）。
2. 政策停用不撤销 effect 与设置命名空间（= 裁决 2，最小执行面）。
3. 停用即摘除（非 disable 式「保持注册 + dispatch 拦截」）：工具/监听器真实撤销，
   调用表现为未注册（无 tombstone）。
4. 消费方访问包装为 get 时按 (消费者, capability) 缓存、提供者换代自愈；
   消费者旧引用保持旧提供对象（与换代前行为一致）。

## 4. 待办登记汇总（供后续批次领取）

- **文档轮**：裁决 2 设计注记；本表 Known Limitation 并入正式文档；§1 锚更正入档。
- **release notes**：裁决 4（wrapProvidedValue 签名变更）。
- **backlog**：裁决 5（配额槽位回收；消费者不明，暂缓）。
- **批次 3（A3）**：重启后 requires/symbolAliases 还原（lockfile 语义载荷增补，
  S2/T22 字节级断言同步演进）。
