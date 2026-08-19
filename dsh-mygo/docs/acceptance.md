# mygo 插件包管理体系验收报告

> 生成时间：2026-08-11 · 依据：dsh-mygo 源码 + test-r05En1cU-0810 checkout
> （vitest 47 文件 / 494 用例全绿，tsc -b 0 错误）。
> 状态：[OK] PASS / [warn] PARTIAL / [x] PENDING。

## 1. 系统不变量

| # | 不变量 | 状态 | 证据 |
|---|---|---|---|
| 1 | 安装时求解、加载时校验；加载不重解 | [OK] PASS（npm 轨） | `package-manager.ts` `resolveInstall`（安装时求解+写 lockfile）；`verifyAtBoot`/`loadEntry`（加载只校验版本+哈希，不查 registry）；测试 `package-manager.spec.ts` “lockfile immunity” |
| 2 | 同安装启动行为确定 | [OK] PASS | lockfile 为唯一权威；`verifyAtBoot` 纯磁盘校验；测试同上（registry 含 2.0.0 不影响 1.0.0 启动） |
| 3 | 挂载序 = 依赖图拓扑序，被依赖者先初始化 | [OK] PASS（npm 轨） | `mount-order.ts` Kahn 逆边；`lifecycle.ts` recover 按 `recoverOrder` 排序；测试 `mount-order.spec.ts`、`package-manager.spec.ts` full flow |
| 4 | 环依赖拒绝并显式报错 | [OK] PASS | `resolver.ts findDependsCycle` + `mount-order.ts`；service 启动对环硬抛 `ordering-cycle`；测试 `resolver.spec.ts` cycle、`package-manager.spec.ts`（load 侧） |
| 5 | 校验失败硬阻断 + 全量结构化报告 | [OK] PASS | `report.ts` 字段（plugin/constraint/chain/candidates/actions + cycles）；resolver 收集全部失败；service/verify 硬抛；测试 `resolver.spec.ts`（missing/range/breaks/cycle）、`package-manager.spec.ts`（missing depends 断言字段） |
| 6 | 持久化/配置目录统一分配，不依赖 dsh 安装位置 | [OK] PASS（npm 轨） | store/lockfile/config 全部在 `$DSH_HOME/mygo`（`paths.ts`）；面板桥接投影到 `$DSH_HOME/profiles/<p>/node_modules`（npm 原生落点），checkout 投影仅在源码模式执行（`panel/src/index.ts` `SOURCE_MODE` 守卫）；bundle rail 用 `dshInstallDir`/`dshBin` 解析；e2e 删 dsh 目录存活 |
| 7 | 不依赖 process.cwd/__dirname | [OK] PASS（npm 轨） | 新代码仅用 DSH_HOME/homedir；`service.ts resolveSourceCheckout` 与面板 `resolveCheckoutDir` 在 npm 布局返回 undefined，不再抛错/硬编码；`process.cwd()` 仅作 `env.exec` 默认 cwd |

## 2. npm 发版兼容约束

| 约束 | 状态 | 证据 |
|---|---|---|
| 动态加载在 lib/bundler 下工作，无 tsx | [OK] PASS | `entry-loader.ts` 经 `import(fileURL)` 支持 ESM/CJS；测试 `entry-loader.spec.ts`；e2e 全流程真实加载运行 |
| 全部运行时依赖在 dependencies | [OK] PASS | 源码整树改用 `@deepseek-ai/cordis`（31 个文件）；dev workspace 用 `vendor/cordis-alias` re-export 同一底层实例（`Context/Service` 单例验证通过）；运行时依赖全部声明在 dependencies（含 workspace:^ 由 pnpm publish 重写） |
| 保留 .d.ts 随包发布 | [OK] PASS | 三包 `files` 白名单含 `lib/types/**/*.d.ts`；新增 prepack 门禁（缺 lib/.d.ts 即失败）；`npm pack --dry-run` 三个包全部通过并列出 tarball |

## 3. 规范要求的测试场景

| 场景 | 状态 | 证据 |
|---|---|---|
| 干净目录 + 模拟 npx 环境完整流程（安装→加载→运行） | [OK] PASS | `package-manager.spec.ts` full flow（本地假 registry + 真实 tar + 临时 DSH_HOME） |
| 依赖缺失 / 区间不满足 / breaks / 环，各触发一次并检查报告格式 | [OK] PASS | `resolver.spec.ts` 四用例断言 code/plugin/constraint/chain/candidates/actions；`package-manager.spec.ts` missing depends 断言结构 |
| 钻石依赖裁决确定性（两次字节级一致） | [OK] PASS | `resolver.spec.ts` diamond：`JSON.stringify` 两次相等，且选最高版本 |
| lockfile 锁定后 registry 新版本不影响启动 | [OK] PASS | `package-manager.spec.ts` lockfile immunity（registry 预置 2.0.0，锁定 1.0.0） |
| 持久化数据在 dsh 本体目录被删除后存活 | [OK] PASS | `package-manager.spec.ts` persistence survives（删除 `$DSH_HOME/dsh-install` 后 verify/load 正常） |

## 4. 交付物核对

| 交付物 | 状态 | 位置 |
|---|---|---|
| docs/gap-analysis.md | [OK] | `dsh-mygo/docs/gap-analysis.md` |
| docs/design.md（含 manifest/求解/lockfile/错误报告/目录规范，逐条覆盖 MUST） | [OK] | `dsh-mygo/docs/design.md`（第 10 节追溯表） |
| 实现代码与测试 | [OK]（核心闭环）/ [warn]（P0-a 迁移） | `packages/cordis/mygo/src/package/` + `tests/package/` |
| docs/acceptance.md | [OK]（本文） | — |

## 5. PENDING / PARTIAL 明细（未闭环项）

1. **P0-a 路径布局迁移**：[OK] 已完成。`service.ts` 不再抛“无法定位 dsh checkout”；
   `bundle-rail` 的 `dshBin/dshInstallDir/checkout` 三选解析；面板 `CHECKOUT`
   变为可选，桥接投影默认走 profile node_modules。不变量 6/7 [OK]。
2. **cordis → @deepseek-ai/cordis 源码整树替换**：[OK] 已完成。31 个文件替换；
   dev workspace 经 `vendor/cordis-alias`（re-export 同一实例）保持单例；
   494 用例全绿，tsc 0 错误。
3. **发布流水线**：[OK] 已完成（骨架）。`scripts/publish-mygo.mjs`（构建 → 面板 →
   `npm pack --dry-run` prepack 门禁 → pnpm publish）；三包 `prepack` 门禁就位；
   `npm pack --dry-run` 实测通过（lib + .d.ts 随包）。
4. **包版本升级**：[OK] 已完成。mygo/mygo-api `0.0.1-rc.1`、panel `0.1.0-rc.1`；
   `self.ts` 版本事实回退改为读取包自身 package.json。

## 7. 剩余项

- **实际发布到私仓**：代码与流水线已就绪（`scripts/publish-mygo.mjs`），但发布
  动作需要你确认 npm 私仓发布权限/节奏后执行；`--dry-run` 已验证构建与产物门禁。

## 6. 结论

插件包管理体系核心闭环（manifest v2 → 确定性求解 → lockfile(哈希) → store 安装 →
加载校验 → 拓扑挂载 → 全量冲突报告）已实现并通过 494 用例 + tsc。验收按第 1/2 节
逐条核对：不变量 1–5 与 7（新代码部分）[OK]，6/7 与 npm 约束因存量 checkout 依赖与
发布流水线仍为 PARTIAL；按任务流程，未通过项应回到设计/实现继续修正，直至第 1/2
节全部 [OK] 后本报告才能标记为最终通过。
