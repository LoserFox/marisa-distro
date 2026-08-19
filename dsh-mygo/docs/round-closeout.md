# 本轮收尾报告（基线冻结 + 双 tier 契约 + 工程小项）

> 生成时间：2026-08-11 · 对应收尾任务 1–17 逐条完成情况。

## 一、基线文档收尾（expected-behavior.md）

1. **EB-D21 新增** [OK]：dispose/unload 超时与强制终止政策——超时后强制 fiber 置
   FAILED、释放过渡队列、产出结构化报告；MUST NOT 无限等待；超时值与强制终止
   语义由 design-r3 定义。依据 A2 实验（永不结束生成器 dispose 挂起）。
2. **EB-D22 新增** [OK]：代码/exports 变更必须走 remove+create（新 fiber）；
   config-only 路径只能改配置、物理上不能替换模块。依据 A4 + loader update
   `Omit<'name'>` + entry diff（§17 核查）。
3. **EB-D8 修订** [OK]：分路径——桥接强制 exports 冻结/Proxy；直连为契约外行为
   （后果自负）；定期快照比对传感器仅记录为后续可选增强，本轮不实现。
4. **EB-D20 升级** [OK]：同步廉价升级为生死线——触发频率 MUST 按 notify 双源复核，
   每次触发成本 MUST 保持微秒~亚毫秒级（A5 实测支持）。
5. **证据框架升级** [OK]：新增第五档 [已证-含边界]（A2/A7/A9/A10 + EB-D8/D9/D14
   迁入）；EB-D16 升级 [推导-基于已证]（A3 CONFIRMED）；剩余 [假设] 全部二分标注
   [设计决策]（EB-D10/D13/D15/D17/D19/D20/D21）；头部警告解除（无经验假设残留，
   设计决策 7/44 = 15.9% < 20%）。
6. **FROZEN** [OK]：文档末尾新增 §8 冻结声明与修订记录；冻结后仅允许追加修订，
   禁止原地改写。

## 二、双 tier 契约（docs/two-tier-contract.md）

7. 分层定义 [OK]（体系内 = 桥接 + mygo manifest；社区 = 直连 + npm 元数据）。
8. 担保矩阵 [OK]（六行担保逐行标明两 tier；社区仅“运行期反应式启停”与
   “状态观察/报告可见”为 [OK]）。
9. npm 元数据收割 [OK]（只读 / 告警级 / 永不阻断；version 入 BOM；peer core 区间
   复读比对告警；dependencies 仅报告展示）。
10. 双存在检测 [OK]（告警级，不阻断）。
11. 直连路径永久支持承诺 [OK]。
12. mixin 免责条款 [OK]（社区侧 AST 改写不受 mygo 编排担保）。
13. 迁移路径叙事 [OK]（增量补词汇不重写声明；mygo init 仅记录为候选，本轮不实现）。

## 三、工程小项

14. **vendor/PATCHES.md** [OK]：创建于 test-r05En1cU-0811/vendor/PATCHES.md，
    登记表含文件/改动/原因/上游同步注意事项。
15. **Fiber epoch getter** [OK]：`vendor/cordis/src/fiber.ts` + `lib/index.js`
    增加公开 `get epoch()`（读取 `_runner.epoch`），PATCHES.md #1 登记；
    eb-a09 复测通过（13/13）。
16. **Proxy 包装规则落地检查** [warn] 结论：需改造，列入 design-r3。证据：
    mygo 服务绑定路径三处裸值发布——`provideTable` 存原始 value
    （lifecycle.ts:762, 2908）、`ctx.get` 直接返回原始值（1851）、
    `syncProvideState` 经 seam 发布原始值（2937-2940）；当前无 Proxy 包装，
    A11“先解构再代理”盲区在 provide/ctx.get 边界依然存在。design-r3 任务：
    在 provide/ctx.get 处强制 Proxy 包装且原始对象不逃逸。
17. **config-only 路径限制核查** [OK] 无需修复：`loader.update` 签名
    `Omit<EntryOptions,'id'|'name'>` 物理上禁止改 name；entry diff 仅
    config → `_patchContext` → `fiber.update`（同 fiber）；name/inject/group
    变化 → replace → 新 fiber。无“换模块不换 fiber”路径，EB-D22 由 loader
    契约天然满足。

## 回归与验证

- EB 假设验证套件：11 文件 / 13 用例全绿（lib 产物模式）。
- mygo 全量套件（0811）：497/497 用例通过；4 个测试文件（author-guide /
  ecosystem-compat / real-composition / mygo-api invariant）因 import 上游
  `@cordisjs/*` 包名在 0811 不存在而 suite 级失败——该命名差异为 0811 迁移
  既有现象（早前全量绿跑在 0810 checkout，其 vendor 保留 `@cordisjs/*` 命名），
  与本次 getter 改动无关；未在本轮改动这四个文件。
- 交付物：expected-behavior.md（FROZEN）、docs/two-tier-contract.md、
  test-r05En1cU-0811/vendor/PATCHES.md + epoch getter、docs/round-closeout.md。

## 声明

**基线已冻结，第三轮可启动。**
