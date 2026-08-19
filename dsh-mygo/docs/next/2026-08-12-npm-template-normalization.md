# 官方 plugin-template 对齐的 npm SDK 规范化记录

> 生成时间：2026-08-12 · 依据：github.com/dsh-external/plugin-template
> （当前 main 87acac8；项目对齐基线 2da8230）与 dsh-mygo 各包现状实测。

## 1. 基准核验

- dsh-mygo 内置 CLI 资产 `packages/cordis/mygo-cli/assets/plugin-template/`
  与官方模板 `2da8230`（「refactor: make plugin template fully self-contained」）
  逐字节一致（`diff -rq` 空）。
- 官方 main 相对 2da8230 仅演进 7 个文件（`patches/` 契约拆分为「依赖补丁 +
  DSH host 补丁」及 4 个 skill/README/contracts 的措辞同步）。dsh-mygo
  内置副本有意保留「无 DSH host 补丁」的适配措辞，与 dsh-dev 守则
  （禁止修改 DSH 源码）一致，本轮不同步。

## 2. 差距清单与处置（B16 checkTemplateAlignment 口径）

### 已补齐（四包一致）

| 维度 | 之前 | 之后 |
|---|---|---|
| scripts.build | 缺失 | `tsc -b && tsdown`（panel：`node build.mjs`） |
| scripts.typecheck | 缺失 | `tsc -b --pretty false`（panel：`tsc -p tsconfig.json --noEmit`） |
| scripts.test | 缺失 | `vitest run` + 包级 vitest.config.ts（panel 无测试，按 UI 形态 N/A） |
| scripts.verify:self-contained | 缺失 | `node scripts/verify-self-contained.mjs`（框架适配版） |
| scripts.prepare | 缺失 | `node scripts/prepare.mjs`（panel：`node build.mjs`） |
| packageManager / engines | 缺失 | `pnpm@11.7.0` / node `^22.19.0 || >=24.0.0` |
| files 白名单 | 缺 `src` | 补 `src`（`./src/*` 导出在 tarball 中可用） |
| devDependencies 工具链 | 部分缺失 | 补 `typescript/tsdown/vitest/@types/node`（registry 区间，与 checkout 根同版本） |
| tsconfig.vitest.json | 缺失 | 新增（extends 包 tsconfig；rootDir 覆盖为 "."） |
| vitest.config.ts | 仅 CLI | 新增 mygo / mygo-api（@deepseek-ai/* 显式映射或复用 checkout paths） |
| prepare 三件套 | 缺失 | tsconfig.prepare.json / tsconfig.prepare.dts.json / tsdown.prepare.config.ts + scripts/prepare.mjs |
| src/README.md | 缺失 | 新增（mygo-api / mygo / mygo-cli / panel） |
| tests/README.md + tests/snapshots/README.md | 缺失 | 新增（panel 无 tests，N/A） |
| 包级 peer | mygo 缺 cordis | mygo 补 `@deepseek-ai/cordis` peer（内部 SDK 名） |

### 有意保留的适配（非缺口）

| 项 | 处置与理由 |
|---|---|
| peerDependencies.cordis | 框架包用内部 SDK `@deepseek-ai/cordis`（npm 强兼容迁移后的官方名），不引公共 `cordis`，避免双实例；B16 的 `cordis` 检查面向 init 生成的社区插件 |
| peerDependencies.schemastery（cli/panel） | 两包不依赖 schemastery，不添加假 peer |
| dsh.bundle.patch | 框架包非 bundle-patch 插件（经 profile 行 / mygo manifest 装载），强行声明会误导 |
| panel exports `./invariant` / `./src/*` | UI 客户端包无 invariant 模块、无 src 子路径（已有 ./client），按形态 N/A |
| typecheck 不含 `tsc -p tsconfig.vitest.json` | 过渡态下 vitest 项目会把 vendor/schemastery 源码纳入严格检查并报错（workspace 解析与引用项目松散配置不一致）；src 门与 checkout 根一致。tsconfig.vitest.json 保留作编辑器/测试类型上下文 |
| verify:self-contained 豁免 | workspace:^ 仅允许 @deepseek-ai/*（AGENTS.md #2）；tsconfig references 不查越界（#5）；tests/test/fixtures 不查绝对路径；绝对路径识别限定已知系统根（防正则字面量误报） |
| extension-mygo-rdb.spec.ts | 包级测试排除（cwd 依赖 + 用户裁决不修改本地修正文件）；全量套件从 checkout 根运行仍覆盖 |

## 3. 验证结果（test-r05En1cU-0811 安装形态）

| 包 | verify | typecheck | test | build | prepare |
|---|---|---|---|---|---|
| mygo-api | 26 文件通过 | tsc -b 通过 | 6 文件 / 39 用例 | 通过 | 通过（lib 可加载） |
| mygo | 153 文件通过 | tsc -b 通过 | 53 文件 / 565 用例 | 通过 | 通过（lib 可加载） |
| mygo-cli | 25 文件通过 | tsc -b 通过 | 4 文件 / 19 用例 | 通过 | 通过（lib 可加载） |
| panel | 10 文件通过 | tsc -p --noEmit 通过 | N/A | 通过（index/client/types 齐） | 同 build |

全量回归（无网拦截）：64 文件 / 625 用例全绿；EB 11 文件 / 13 用例全绿；
根 typecheck 三包通过。build.mjs 的 checkout 默认路径由绝对工作站路径改为
安装形态相对推导（`../../`），同时消除 verify 违规。

## 4. 待决策（不属本轮实现）

1. ~~官方 main 的「DSH host 补丁」契约是否与 dsh-dev 守则并存~~ ——
   **已裁决（2026-08-12，用户选 (b)）：采纳官方语义**。落地动作：
   AGENTS.md 措辞精确化为「零写入 / 禁 apply，允许 host 补丁提案」；
   patches/README 转为官方双契约 + dsh-dev 执行约束；模板资产同步
   87acac8（7 文件逐字节一致）；vendor/PATCHES.md 明确只登记已落地修改。
2. 框架包完全 standalone 转换（根 pnpm workspace、去掉 checkout 相对
   references、verify 恢复到官方严格口径）——即 AGENTS.md 例外 #2/#5 的
   收口轮。
3. `checkTemplateAlignment` 是否新增「框架包身份」参数（peer 名 /
   dsh.bundle.patch 按角色豁免），避免将来误把适配项当缺口。
4. 各包新增 devDeps 后 checkout pnpm-lock.yaml 的同步（发布/收口时执行
   pnpm install 一并解决）。
