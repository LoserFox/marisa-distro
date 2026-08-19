# mygo 端到端真实验证轮（E2E，T21+）

> 生成时间：2026-08-12 · 输入：design-r3（含 Rev-I1）/ expected-behavior.md /
> community-census.md（M3/M7）/ two-tier-contract.md。本轮只验证不设计；
> design-r3 / expected-behavior 正文零改动。

## 0. P-0 预备：npm registry 注入桩（离线确定）

- `PluginManagerServiceConfig` 增加可选 `registry` 基址（透传 `PluginPackageManager`，
  缺省官方 registry）；real-composition 全部 npm 请求改打本地桩。
- 桩响应数据来自真实 registry 快照：`missing-pkg` 的 404
  `{"error":"Not found"}`（2026-08-12T00:52:48Z 实采），固化于
  `test-r05En1cU-0811/packages/cordis/mygo/tests/fixtures/registry/missing-pkg.json`；
  无手写版本号。
- 离线验证：以 fetch 拦截 preload（放行 127.0.0.1/localhost，其余拒绝）跑全量，
  58 文件 / 582 用例全绿、零 unhandled。preload 仅验证工具（可复现）：

```js
const originalFetch = globalThis.fetch
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : String(input)
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
    return originalFetch.call(this, input, init)
  }
  throw new Error(`NETWORK-BLOCKED: ${url}`)
}
```

## 1. 夹具语料库（F1-F6，真实来源）

| 类别 | 样本 | 入口 | 信任 | 审阅/说明 |
|---|---|---|---|---|
| F1 | 朋友的 fabric（`dsh-cordis-fabric`） | `lib/index.js` | trusted | 真实 mixin 插件（含 node_modules）；打包只带 lib（src 会触发 bundle-scan 的 @deepseek-ai 未声明告警） |
| F2 | dsh-tool-time / zotero-wave-rag / dsh-vision / dsh-live-stats / dsh-gh-bridge | `src/index.ts` | reviewed | 入口已人工审阅；覆盖 ctx.<prop> 主流（tools/systemPrompt/sessionProjections）+ module-level import（defineTool 等）；无 install 脚本执行 |
| F2(元数据) | dsh-cc-tui | — | reviewed | S8 双存在样本（dependencies 嵌套 @deepseek-ai/dsh-working-activity） |
| F3 | 官方 plugin-template（2da8230） | `src/index.ts` | trusted | npm 强兼容形态；B16 对齐实测 aligned |
| F4 | dsh-vibe-mode（改写后 dsh.mygo） | `lib/index.js` | trusted | requires voice-chat 载体 |
| F4(占位) | dsh-voice-chat fixture | `src/index.ts` | trusted | 真实仓库不在本地 90 快照；按服务契约构造占位提供者（fixture 缺口，如实记录） |
| F5 | dsh-pty-windows | `index.mjs` | reviewed | 真实 legacy dsh.plugin.json；POSIX 上 apply 为 no-op |
| F6 | dsh-tool-time（bundle+入口）/ dsh-101（纯 patch） | `src/index.ts` / — | reviewed | 33/80 主流 profile bundle 形态；dsh-101 无构建产物仅做展开断言 |

语料解析：`dsh-external-src` 下建了 `node_modules` 符号链接农场（指向工作区真实包
lib 产物 + zod/yaml），不改任何仓库内容；E2E 打包为真实 tarball（真实 sha512
integrity），体系外包注入 mygo manifest overlay 于打包期（不改仓库源文件）。

## 2. 场景矩阵（全部自动化断言，T21-T31）

| # | 场景 | 结果 | 证据/断言要点 |
|---|---|---|---|
| T21/S1 | 六类混装：安装→求解→挂载全通 | [OK] | 桥接安装 F1/F3/F4（真实 tarball+integrity）lockfile 覆盖全部桥接 id；entry 相对、sha512/fileSize 落账；桥接引擎挂载 F3/F4 全 active；直连 loader 挂载 F2/F5/F6，tools 注册齐（time/zotero_status/view_image/gh_bridge），无 ERROR |
| T22/S2 | 真实依赖图确定性复验 | [OK] | 同一 profile 两次全新安装，lockfile 逐字节相等（generated.at 归一为安装时间戳，非求解产物）；实测 52.4ms/次 |
| T23/S3 | 符号缺失前置门 | [OK] | 真实消费者动态访问缺失符号 → pre-gate symbol-missing + INACTIVE + policy-rejected 报告；实测 0.0059ms（5.9μs）< 1ms 预算 |
| T24/S4 | requires 三态（F4 载体） | [OK] | 缺失→service-missing（候选集来自 B19 观测）；出现→自动激活；版本不符→mismatch + requires 报告 |
| T25/S5 | 提供者消失 | [OK] | replace 到不提供服务版本 → 快照/观测清理 + 消费者 INACTIVE（细 epoch 记账路径） |
| T26/S6 | dispose 悬挂 | [OK] | 永不结束 disposal → 实测 5002.6ms 超时 → dispose-abandoned 日志 + replace 完成（generation 2，回滚不阻塞） |
| T27/S7 | exports 逃逸 | [OK] | 桥接 set 抛 TypeError + exports-frozen 日志 + 原始对象不触碰；直连原生插件 set/delete 无约束 |
| T28/S8 | 双存在 | [OK] | dsh-cc-tui 真实 dependencies 嵌套 + vibe 服务需求 → 告警输出、不抛错 |
| T29/S9 | 社区零阻断 | [OK] | F2 真实元数据收割（engines.dsh/cordis peer/dsh-tools peer）归一或 EXT-1 告警、绝不抛错；F2 全部直接挂载成功 |
| T30 | F3 模板对齐 / F5 legacy 映射 / F6 bundle 展开 | [OK] | 模板 aligned；pty-windows dsh.plugin.json → id/entry 映射 + 迁移警告；dsh-101 真实 patch 展开为 entry 行 |
| T31 | F1 mixin 真实路径 | [OK] | 真实 fabric 补丁经真实 `validatePatchStatic` 校验 + mygo mixin 引擎应用，目标行为改变（hello fabric:world）、trace 含补丁 id |

## 3. 性能实测（不许「很快」）

| 项 | 实测 | 预算/期望 |
|---|---:|---|
| S2 真实图求解（4 包桥接图，含 install+lockfile） | 52.4 ms/次 | — |
| S3 pre-gate 同步拦截（真实快照大小） | 0.0059 ms（5.9 μs） | 微秒~亚毫秒（EB-D20）[OK] |
| S6 dispose 超时（默认 5000ms） | 5002.6 ms | 5000ms 超时后放弃等待、释放队列 [OK] |
| P-0 后 real-composition 全文件 | ~2.3s（16 用例） | 不再触网；无隐藏 dispose 超时 |

### real-composition ~10s 复核（实现轮遗留审计项）

插桩分解：loadComposition 31-33ms / install 10-11ms / replace 4-5ms /
updateConfig 3ms / plan+失败路径 539-849ms。后段大头是两次真实
`registry.npmjs.org/missing-pkg` 请求（直连实测 ~480ms/次）；早前 ~10s 是
沙箱网络/DNS 抖动，非 dispose（replace 仅 5ms，放弃路径探针零触发，warns 空）。
P-0 桩化后该用例离线确定（本套件在 fetch 拦截下全绿）。

## 4. 故障统计（三选一分类）

### impl-bug：1

1. **manifestSha256 不可复现（S2 捕获）**：`.mygo-package.json` 含
   `installedAt` 时间戳并被整文件哈希，导致同输入两次安装的 lockfile 字节不等。
   修复：`manifestSha256` 改为稳定载荷哈希（format/id/version/entry/manifest/
   integrity，确定性键序）；`installedAt` 仅作来源信息保留；`verifyLockfile` 与
   `readInstalledPackage` 按同一口径重算。回归：S2 字节级断言（T22）。

### fixture-issue：3

1. **B8 单测假绿**（实现轮遗留）：直接注入 `settingsOwnerDisposal` 会被
   `disposeGeneration` 覆盖，超时从未真正触发。改为注入 `settingsOwner.fiber`
   （dispose 永不结束），E2E T26 与单元测试现均实测 ~60ms/5000ms 超时路径。
2. **dsh-cc-tui 包名**：corpus 记录为 `@dsh-external/dsh-cc-tui`，真实
   package.json 为 `@deepseek-ai/dsh-cc-tui`；已修正。
3. **dsh-voice-chat 语料缺口**：真实仓库不在本地 90 快照；按 F4 服务契约构造
   占位提供者 fixture（打包期注入，不改仓库），T24/S1 使用并如实记录。
4. **T22 真实图单候选（闸口轮 M1 假绿）**：破坏求解器排序确定性（Math.random
   参与比较）后 T19 变红但 T22 仍绿——真实图每 id 仅单一候选版本，
   sortCandidates 未被调用。修复：voice-chat fixture 增补 0.1.0 历史版本
   （registry 多候选）+ T22 增补「真实依赖图整体 resolve() 两次字节级断言」；
   破坏复验变红、回滚后恢复绿。

### design-gap：0（无冲突上报）

### known-friction（登记待裁决，本轮不修复）

- **KF-1 bundle-scan 扫描范围**：F1 打包时 src/ 目录触发
  「@deepseek-ai 未声明」告警（E2E 以只打包 lib 绕开）。
  问题：src 非运行时加载产物，bundle-scan 扫描范围是否应限于
  entry 可达 + bundles 声明的产物？两类候选裁决：
  (a) design-gap：扫描范围定义过宽，应收窄；
  (b) 行为正确：防夹带有意为之，但告警文案需指引作者
  「src 无需声明」。
  状态：待 design-r4 或独立小轮裁决。
  代码定位（只读，未修改）：`packages/cordis/mygo/src/package/
  bundle-scan.ts:100`（`sourceCallsDshCore`）与 `:154-155`
  （`detectUndeclaredBundles` 内逐文件扫描 `@deepseek-ai/*` import 并
  产出「未声明 dsh 核心调用」问题）；F1 触发路径为
  `package-manager.ts` 安装后对整包目录执行 `detectUndeclaredBundles`，
  打包期只带 lib 属 fixture 绕开（见 §1 F1 行）。

> 更新（2026-08-12，design-r4 落地）：KF-1 已在 design-r4 §9 裁决并实现
> （B26/T43）——保持整包扫描，分类规则修正为按 npm 元数据声明分类（含插件
> 自身包名与子路径归一）；F1 语料已恢复含 src 全量打包，本条目从「待裁决」
> 转「已裁决」，代码定位行号随实现演进（bundle-scan.ts 现含
> `dshCoreSpecifiers` / `packageNameOfSpecifier`）。

## 5. 验收口径

- S1-S9（T21-T31）全绿：17/17。
- 全量回归（含 T1-T20）：58 文件 / 582 用例全绿（无网 fetch 拦截下）。
- EB 假设套件：11 文件 / 13 用例全绿。
- typecheck：`tsc -b packages/cordis/mygo` 通过。
- 冻结文档正文零改动；本轮仅新增本文件与测试代码。
