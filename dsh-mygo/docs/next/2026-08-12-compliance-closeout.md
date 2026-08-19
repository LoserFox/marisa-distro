# 守则合规收尾报告（PATCHES #1 零侵入侵撤离 + 框架例外条款 + emoji 清理）

> 生成时间：2026-08-12 · 依据：dsh-mygo 仓库 + test-r05En1cU-0811 checkout
> （无网 fetch 拦截下全量回归 + EB + typecheck 全绿）。

## Part C：PATCHES #1 零侵入侵撤离

### 消费点普查清单

原生 `fiber.epoch` getter（补丁产物）的全部消费点：

| 消费点 | 位置 | 类型 | 处置 |
|---|---|---|---|
| EB-A9 运行期断言 | `packages/cordis/mygo/test/eb/eb-a09-loader-entries.spec.ts:41`（原 `typeof fiber.epoch === 'string'`） | 测试/诊断 | 改为断言原生 epoch 无公开入口 + mygo 细 epoch 走 FineEpochRegistry（T14/T15 覆盖） |
| EB-A9 源码断言 | 同文件:32 | 测试/诊断 | 新增 `fiberSrc` 不含 `get epoch()`（防补丁回归） |
| 生产源码（mygo / mygo-api / mygo-cli） | `rg ".epoch" src/` 零命中 | — | 无消费 |
| 治理链路（requires-gate / preGate / 生命周期决策 / lockfile 校验） | `src/package/requires-gate.ts`、`src/package/fine-epoch.ts`、`src/lifecycle.ts`、`src/bom.ts` | — | 零消费，全部基于 FineEpochRegistry 自有记账 |

### 闸门判定：通过（不停工）

无任何消费点位于治理链路；唯一消费点为 EB-A9 诊断断言，按「改为细 epoch
自有数据源或移除」处理。MUST NOT 读私有 `_runner` 约束遵守（未新增任何
私有读取）。

### vendor 零残留核验

- `test-r05En1cU-0811/vendor/cordis/src/fiber.ts`：`git restore --source=HEAD`
  回滚，`git status --short -- vendor/cordis/` 为空。
- `vendor/cordis/lib/index.js`、`vendor/cordis/lib/types/fiber.d.ts`：移除
  getter 块（lib 为 gitignored 构建产物，逐文件核验）。
- 三文件 `rg "get epoch()"` 零命中；`git diff --stat -- vendor/` 为空。
- PATCHES.md #1 标记已移除（vendor/PATCHES.md:8，保留历史记录、不删条目）。

### 回归状态

| 套件 | 结果 |
|---|---|
| EB 假设套件 | 11 文件 / 13 用例全绿（eb-a09 更新后） |
| 全量（无网拦截） | 64 文件 / 624 用例全绿（Part C 后） |
| typecheck | `tsc -b packages/core/mygo-api packages/cordis/mygo packages/cordis/mygo-cli` 通过 |

### 上游 API 请求草稿（供转交 cordis 官方团队）

> 请求：在 `Fiber` 类提供公开只读的 epoch 入口（如 `get epoch(): string`）。
> 背景：epoch（依赖满足度指纹）当前仅存于私有 `_runner`（EffectRunner.epoch），
> 无公开只读入口。
>
> 动机：
> 1. loader entry 已公开暴露 fiber 引用（Entry.fiber），但治理层无法只读
>    观察依赖满足度 epoch，只能重复记账或访问私有字段。
> 2. mygo 曾临时新增公开 getter（PATCHES #1），因「禁止修改 DSH 源码」守则
>    已移除；官方提供等价只读入口可消除本地补丁需求。
> 3. 只读 getter 完全向后兼容：epoch 仍由内部 _refresh/_setEpoch 维护，
>    不改变任何加载/卸载/惯性语义。

## Part A：AGENTS.md 核心框架仓库例外条款

位置：`/home/rosen/workspace/dsh_dev/AGENTS.md:53-80`（dsh_dev 根，非 git
仓库，无法提交；如需入某具体仓库请用户指定）。五条最终措辞：

1. install.sh 对 checkout 的写入（复制包 + tsconfig 接线，install.sh:55-126）
   属框架安装行为，豁免「DSH 源码零写入」。
2. `workspace:^` 为发布前过渡态；收口条件 = mygo-cli 纳入 publish-mygo.mjs
   且各包发布后转 registry 区间。
3. 目录名 dsh- 前缀对框架仓库（packages/cordis/mygo、mygo-cli、
   packages/core/mygo-api）豁免；mygo-rdb 维持用户既有 ignore 裁决。
4. vendor 补丁条款：PATCHES #1 已移除（守则合规 + 零侵入裁决），当前
   vendor 零补丁；此后 vendor 修改仍须先登记 PATCHES.md。
5. tsconfig 相对路径 references（安装形态变体）随第 2 条一并收口。

## Part B：emoji 清理

- `render.ts` 警告前缀 U+26A0 → `[warn]`（packages/cordis/mygo-cli/src/render.ts:81）；
  同 commit 新增 T48 字节级快照断言（tests/render.spec.ts:90-95,147-155），
  CLI 套件 19/19 全绿，未拆开提交。
- 16 个 docs 文件完成替换：U+2705 → [OK]、U+26D4/U+274C → [x]、
  U+26A0+FE0F → [warn]（纯格式化）；expected-behavior.md 追加冻结修订 R2
  （docs/expected-behavior.md:196）。
- 豁免登记：AGENTS.md:37-40（tests/fixtures/ 整体豁免；扫描口径限定
  Emoji_Presentation=Yes），自查 6 正则同步收窄（AGENTS.md:105）。
- 复扫：收窄正则全仓零命中（fixtures 除外；fixtures 内唯一命中
  status.ts U+1F525 按豁免保留）。
- 提交信息全程无 emoji。

## git 提交（本地，未 push）

| hash | 内容 |
|---|---|
| 9573718 | Part C：PATCHES #1 零侵入侵撤离（EB-A9 断言 + PATCHES.md 标记已移除 + 冻结修订 R1） |
| de6f340 | Part B：emoji 清理轮（16 docs + render.ts + T48 快照 + 冻结修订 R2） |
| 本报告 | 当前 HEAD（git log 查看完整 hash） |

## 冲突上报 / 待裁决

- 无闸门级冲突（Part C 闸门判定通过）。
- 以下为非冻结文档的过期引用，本任务范围外未改动，建议后续轮追加修订：
  - docs/design-r3.md:20（「vendor 改动登记 PATCHES.md（当前仅 #1 epoch
    getter）」）与 docs/design-r3.md:424（「epoch getter：既有 vendor 补丁
    #1，保持登记」）；
  - docs/assumption-verification.md:22、37-38（「需公开 getter 或最小改动面」）。
- AGENTS.md 位于 dsh_dev 根（非 git 仓库），Part A/B 对它的修改无法随仓库
  提交；如用户希望纳入版本管理，请指定目标仓库。
