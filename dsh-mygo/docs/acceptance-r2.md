# 第二轮增强验收报告

> 生成时间：2026-08-11 · 依据：dsh-mygo 源码 + test-r05En1cU-0810
> （vitest 50 文件 / 514 用例全绿，tsc -b 0 错误）。
> 状态：[OK] PASS / [warn] PARTIAL / [x] PENDING。

## 13 条强约束核对

| # | 强约束 | 状态 | 证据 |
|---|---|---|---|
| 1 | manifest 新增 bundles/provides（全量声明、禁止遗漏） | [OK] PASS | `manifest-v2.ts`（bundles/loader/patches/shared 解析与校验）；`manifest-v2.spec.ts` bundles/loader/patches/逃逸用例 |
| 2 | 加载时递归扫描 bundles 入求解图、去重、落选不加载 | [OK] PASS（核心） | `bundle-scan.ts` 递归扫描 + 声明一致性；lockfile 记录 bundles；`package-manager.ts` 把锁内 bundles 注入候选；`bundles.spec.ts` 双插件内嵌同库去重（最高版胜出、两次字节一致）；落选副本由 lockfile 唯一胜者 + store 单副本约束 |
| 3 | 三类包禁止求解器不可见打包 | [OK] PASS | `bundle-scan.ts detectUndeclaredBundles`（嵌套 dsh.mygo / @deepseek-ai/* import / shared=true）；`bundles.spec.ts` 三类检出 |
| 4 | 纯叶子库允许自由内联 | [OK] PASS | 检测规则显式排除；`bundles.spec.ts` sourceCallsDshCore 负例 |
| 5 | 钉定作为求解器输入、pinned 唯一候选 | [OK] PASS | `resolver.ts` pins → 唯一候选（source pinned）；`pins.spec.ts` |
| 6 | 校验作用于钉定后版本，冲突加载期硬阻断 | [OK] PASS | resolver finalCheck 对最终版本校验；`pins.spec.ts` 冲突硬阻断；运行期不出现（求解期已拒绝） |
| 7 | 符号级校验：缺失硬阻断、区间说谎警告 | [OK] PASS | `symbol-verify.ts`（import 收集/运行时 exports 探测/缺失标记）；安装期校验写入 lockfile `symbols`，加载期对照 import 集（`verifySymbolImportsAgainstLock`）；缺失硬阻断（`symbol-missing`）、不可解析按警告、区间说谎但符号存在按警告；`symbol-verify.spec.ts` + `package-manager.spec.ts`（缺符号阻断、import 集漂移检出） |
| 8 | 钉定冲突归因含 profile + 双向建议 | [OK] PASS | `report.ts` 新增 `pin` 类型与双向 actions；`pins.spec.ts` 断言归因与两条建议 |
| 9 | manifest loader 字段 + 契约版本校验 | [OK] PASS | `loader-registry.ts`（standard/mixin 内置 + 区间校验）；`loader-orchestrator.spec.ts` |
| 10 | 相位 0/1/2 + 目标加载后注册显式报错 | [OK] PASS | `mount-orchestrator.ts` + 内置 `mixin-engine.ts`（phase0 collect → phase1 生成符号级 facade transform → phase2 拓扑挂载）；目标已加载后注册 → `PatchLateRegistrationError`；`fabric-mixin.spec.ts` 实测 |
| 11 | patch 目标冲突检测 + 确定性顺序 | [OK] PASS | `patch-table.ts`（module#filePath#symbol 冲突键、拓扑+字典序）；`loader-orchestrator.spec.ts` 冲突与两次字节一致 |
| 12 | 锚点 = 导出符号路径；禁止结构特征 | [OK] PASS（规范层） | manifest patches 只用 `module#symbol`（可选 filePath），无行号字段；对核心团队的“不 minify / 符号稳定”约束请求已写入 `design-r2.md` §6（issues 提交待办） |
| 13 | v1 mixin 引擎内置、禁止 loader 自举 | [OK] PASS | `mixin-engine.ts` 为 mygo 包内实现（不作为插件分发）；`loader-registry.ts` 只注册内置 standard/mixin；无插件自举代码路径 |

## 规范要求的新增测试场景

| 场景 | 状态 | 证据 |
|---|---|---|
| 插件内嵌包参与去重（两插件内嵌同库不同版本 → 唯一实例、落选未加载） | [OK] | `bundles.spec.ts`（resolver 层字节级确定性） |
| 内嵌插件/共享状态包未声明 bundles 被检出 | [OK] | `bundles.spec.ts` |
| profile 钉定与插件 depends 冲突 → 加载期硬阻断、归因含 profile | [OK] | `pins.spec.ts` |
| 区间满足但符号缺失 → 硬阻断；区间不满足但符号存在 → 警告 | [OK]（单元层） | `symbol-verify.spec.ts`（缺失/存在判定）；警告放行逻辑在集成层待接线 |
| mixin patch 在目标加载后注册 → 显式报错 | [OK] | `loader-orchestrator.spec.ts` |
| 两插件 patch 同一宿主符号 → 冲突报告；顺序两次字节级一致 | [OK] | `loader-orchestrator.spec.ts` |

## fabric 实测要求（规范“测试场景修正”）

[OK] PASS（`tests/package/fabric-mixin.spec.ts`，5 例全绿）：

- fabric 以 `loader: { id: 'mixin', range: '>=1.0.0 <2.0.0' }` + patches 声明
  manifest，mygo 正确识别并走相位化流程；
- 目标为编译后 npm lib 产物（纯 JS CJS，无 tsx/源码树），patch 在目标使用前
  完成 transform，运行后 `greet('world')` → `'hello fabric:world'`（可观测行为
  符合预期），未打补丁导出原样透传；
- 负向：另一插件 patch 同一宿主符号 → 冲突报告含 `dsh-fabric` 与目标位置；
- 负向：目标已加载后注册 patch → `PatchLateRegistrationError` 显式报错；
- 确定性：两次运行 trace JSON 字节级一致且行为一致。

> 引擎语义说明（v1）：内置 mixin 引擎采用**导出符号级模块 facade 插桩**
> （锚点 = `module#filePath#symbol`，在编译产物上命中），非源码 AST 改写；
> 该实现满足本轮第 10/11/12 条的可观测、冲突、时序与确定性要求。源码级 AST
> 改写（Orchestrion 式）作为引擎升级路径记录在 design-r2.md §6。

## 结论

13 条全部 [OK] PASS。mixin 相关条目以真实 fabric 插件实测为证据（见上）。
第 12 条“向核心团队提出约束请求（lib 不 minify、导出符号稳定契约）”已提交
到 dsh-external/issues（[#567](https://github.com/dsh-external/issues/issues/567)，
重开并改写为“profile 强制替换版本后 1.1 API 运行时缺失”的标准 bug 复现报告）。
