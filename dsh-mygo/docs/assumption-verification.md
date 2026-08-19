# 假设清单实验验证（A1–A11）

> 生成时间：2026-08-11 · 运行环境：test-r05En1cU-0811 checkout（lib 产物模式：
> @deepseek-ai/cordis / cordis-plugin-loader 均解析到 vendor/*/lib）。
> 运行命令：
> `node node_modules/vitest/vitest.mjs run --config packages/cordis/mygo/test/eb/vitest.config.ts`
> 结果：11 个文件 / 13 个用例全部通过。
> 实验代码：`packages/cordis/mygo/test/eb/`（未修改 vendored cordis / dsh 业务源码）。

## 判定矩阵

| 假设 | 判定 | 成立边界 | 主要证据索引 | 受影响 EB |
|---|---|---|---|---|
| A1 entry url ↔ name | CONFIRMED | name 即模块说明符（等价 paper 的 url），无 url 字段 | eb-a01；entry.ts:9-20、tree.ts:145-161 | — |
| A2 effect guard / 部分回滚 | PARTIAL | 异步迭代器：步边界 guard + 已累积逆 LIFO 恢复；同步迭代器无 guard；永不结束的异步生成器 dispose 会挂起 | eb-a02；fiber.ts:356-397（同步分支无 guard）、415-560 | EB-D9 前提（含边界） |
| A3 disabled 阻止反应式激活 | CONFIRMED | disabled 期间依赖上线不自动激活；enable 后反应式恢复（依赖下线/上线驱动启停） | eb-a03 | EB-D16、§6 矛盾 2（c）兑现依据 |
| A4 重装产生新 uid | CONFIRMED | remove+create 每次新 fiber/uid（3 轮）；config-only update 复用同一 fiber（非重装） | eb-a04；registry.ts:330 `new Fiber` | EB-D1、EB-D7 地基 |
| A5 导出快照 + 结构性比较 | CONFIRMED | 10k 符号冻结+Set 差比较亚毫秒级，可放进同步前置门 | eb-a05（实测耗时日志） | EB-D20 前提 |
| A6 细 notify 传感器方案 | CONFIRMED | 候选清单成立（实例替换/快照指纹/代理/混合），成本依据 A5/A11 | eb-a06 | EB-D20/传感器设计 |
| A7 冻结/代理拦截点 | PARTIAL | 桥接路径 mygo 经 importEntry 加载可包装；直连行交给原生 loader 不可包装 | eb-a07；panel importEntry；bundle-rail runDshPlugin | EB-D8 边界 |
| A8 P1-local 绑定控制层 | OBSOLETE | P1-local 已按矛盾 1 裁决删除，不再需要实验 | eb-a08（基线文档断言） | EB-D3（已作废） |
| A9 entry 暴露 epoch/inertia | PARTIAL | entry.fiber 可达、inertia 是公开字段；**原生 epoch 无公开入口**（lib 中仅存于私有 `_runner`，诊断用）——2026-08-12 零侵入裁决后，mygo 控制面细 epoch 由 FineEpochRegistry 自有记账维持，不再依赖原生 epoch | eb-a09；entry.ts:56、fiber.ts:200、lib 无 epoch 字段 | EB-D14 边界（自维护口径） |
| A10 notify 边界 | PARTIAL | 修正：notify 双源——reflect.provide/unprovide 即时通知 + fiber ACTIVE 翻转通知；曾 provide 的失败会通知；未 provide 的失败不产生插件服务名通知（loader 内部 `['loader']` 噪声除外） | eb-a10；reflect.ts:295,299、fiber.ts:588-596 | EB-N6 需补充（N13） |
| A11 运行时代理兜底 | CONFIRMED | Proxy 可记录动态缺失符号访问；1e6 次 get 数十毫秒级；盲区=先解构再代理 | eb-a11（实测耗时日志） | EB-D1/D5/D6/D12 前提（含盲区边界） |

## 统计

- CONFIRMED：6（A1, A3, A4, A5, A6, A11）
- PARTIAL：4（A2, A7, A9, A10）
- REFUTED：0
- OBSOLETE：1（A8）

## 关键修正与连锁影响

- **A10 修正了“notify 仅在 ACTIVE 翻转时发”的简化表述**：notify 有双源
  （provide/unprovide 即时 + 状态翻转），原 EB-N6 只覆盖了状态翻转源，需补 EB-N13。
- **A9 修正了“fiber.epoch 可内省”的可行性（最终口径，2026-08-12 零侵入裁决）**：
  inertia 公开可读；原生 epoch 无公开入口（仅私有 `_runner`）——曾落地的
  公开 getter（PATCHES #1）已移除并回滚（fiber.ts / lib/index.js /
  fiber.d.ts 零残留）；mygo 控制面细 epoch 改由 FineEpochRegistry +
  ProviderObservationRegistry + policyStatus 记账维持（自维护），与原生
  epoch 解耦。eb-a09 断言同步更新为「原生 epoch 无公开入口 + `get epoch()`
  零残留」。
- **A2 修正了“过渡内任意点可中断”的直觉**：guard 是步边界，不是中途取消；
  永挂生成器的 dispose 会等待在飞步（挂起风险）。
- 无 REFUTED 项，因此无“前提失效”连锁标记；PARTIAL 项均以边界形式标注，
  不影响其承重的 EB 条目成立，但第三轮核验须按边界引用。

## 修订记录

| 修订 | 日期 | 原因 |
|---|---|---|
| R1 | 2026-08-12 | 按当前代码修正 A9 口径（零侵入裁决）：取消对本体 fiber epoch 的依赖（原生 epoch 无公开入口），细 epoch 改为 mygo 自维护（FineEpochRegistry 记账）；PATCHES #1 已移除并回滚。判定矩阵与关键修正两处同步更新。 |
