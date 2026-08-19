# dsh-mygo 自查报告（按 dsh-dev Agent 守则）

> 生成时间：2026-08-12 · 依据：dsh_dev/AGENTS.md（仓库规则 + 自查清单）。
> 范围：开发规范与命名规范为重点。本报告自身遵守禁 emoji 规则（不使用 emoji
> 字符；状态用 [合规]/[不合规]/[待裁决] 表示）。

## 1. 命名规范

| 包 | npm 名 | npm 名合规 | 目录 | 目录合规 |
|---|---|---|---|---|
| 核心实现 | `@deepseek-ai/dsh-mygo` | 合规 | `packages/cordis/mygo` | 不合规（无 dsh- 前缀） |
| 契约层 | `@deepseek-ai/dsh-mygo-api` | 合规 | `packages/core/mygo-api` | 不合规 |
| CLI 扩展 | `@dsh-external/dsh-mygo-cli` | 合规 | `packages/cordis/mygo-cli` | 不合规 |
| Web 面板 | `@dsh-external/dsh-mygo-panel` | 合规 | `vendor/dsh-mygo-panel` | 合规 |
| 外部存储 | `@dsh-external/mygo-rdb` | 不合规（无 dsh-） | `extension/mygo-rdb` | 不合规 |

判定：npm 包名 4/5 合规；目录名 1/5 合规。守则称「既有包已全部更名对齐」，
对 dsh-mygo 不成立（mygo/mygo-api/mygo-cli/mygo-rdb 目录均未更名）。
注意：dsh-mygo 是插件治理框架仓库而非守则语境下的插件仓库，目录前缀是否
适用需用户裁决（改名成本涉及 install.sh / 文档 / 测试 / 包路径全链路）。

## 2. 开发规范

### 2.1 DSH 源码零写入 —— 待裁决（框架层冲突）

- `install.sh` 对 `$CHECKOUT` 有写入：复制包（install.sh:55-63）+ 修改
  checkout 的 `tsconfig.base.json` / `tsconfig.host.json`（install.sh:67-126，
  `writeFileSync`）。写入物为 mygo 包目录与 tsconfig 接线，非修改 DSH 源码逻辑，
  但字面违反「对官方源码 checkout 零写入」。
- `vendor/PATCHES.md` #1：直接修改 vendored `cordis/src/fiber.ts` +
  `cordis/lib/index.js`（epoch getter）。已按旧纪律登记，但严格违反守则
  「禁止修改 DSH 源码」。需裁决：框架层例外（登记保留）或另寻上游替代方案。

### 2.2 官方 NPM SDK —— 部分合规，待裁决

- 正式依赖已按 npm 强兼容迁移：`@deepseek-ai/cordis ^4.0.1-rc.1` 等 registry
  区间（packages/cordis/mygo/package.json）。
- 仍存在 `workspace:^` 依赖（内部包间 + devDeps，如
  packages/cordis/mygo/package.json:44-60）：守则禁止 workspace 指向 DSH
  checkout；mygo 在 checkout workspace 内开发，安装形态下 `workspace:^`
  解析到 checkout 包。需裁决：框架层例外，或待各包发布后全部转 registry
  区间（publish-mygo.mjs 覆盖 mygo-api/mygo/panel，CLI 待纳入）。

### 2.3 tsconfig 引用 —— 合规（显式），安装形态需说明

- 扫描结果：无 `test-r05` / `deepseek-harness` / `.dsh/source` 显式引用
  （tsconfig*.json 与 package.json 均无）。
- 说明：各包 tsconfig `references` 使用相对路径（如
  `packages/cordis/mygo/tsconfig.json` 引用 `../../../vendor/cordis`），在安装
  进 checkout 后解析到 workspace；不属于守则禁止的「显式 checkout 引用」，
  但属于同源问题的安装形态变体，随 2.2 一并裁决。

### 2.4 共享构建预设 `shared/tsdown.client.ts` —— 不适用/待裁决

- 仓库无 `shared/tsdown.client.ts`；各 server 包自带 `tsdown.config.ts`，
  panel 客户端用 `build.mjs` + `tsdown.config.mjs`。守则的共享预设针对
  dsh-client 插件形态；mygo 非该形态。需裁决：不适用或迁移。

### 2.5 NPM_TOKEN —— 合规

- 仓库内无 `.npmrc`（find 无结果），无真实令牌落盘；发布流程要求
  `NPM_TOKEN` 仅环境变量注入（scripts/publish-mygo.mjs dry-run 门禁）。

## 3. emoji —— 不合规（25 个 tracked 文件）

扫描命令（AGENTS.md 自查 6 的正则：Extended_Pictographic + ZWJ + VS16 +
区域指示符）命中 25 个文件，含三类：

- 真 emoji / Emoji_Presentation：`docs/acceptance*.md`、`docs/community-census.md`、
  `docs/cli-verification.md`、`docs/design-r4*.md`、`docs/design-r5-cli.md`、
  `docs/plugin-pack-verification.md`、`docs/round-closeout.md`、
  `docs/next/*` 等大量 `[OK]` 检查标记（U+2705 等）；
- 脚本输出违规：`packages/cordis/mygo-cli/src/render.ts` 的警告前缀
  （U+26A0，Emoji_Presentation=Yes）——守则明确禁止脚本输出 emoji；
- 语料 fixture：`packages/cordis/mygo/tests/fixtures/dsh-external/working-activity/src/status.ts`
  （U+1F525）。
- 边缘命中：多处 `U+2194`（左右箭头，Extended_Pictographic=Yes 但
  Emoji_Presentation=No；若按正则严格计则命中，按常规语义不计）。

判定：不合规，需一轮 emoji 清理（文档标记替换为文字、render.ts 警告前缀
替换为普通字符、fixture 按语料来源处理）。近 30 条提交信息无 emoji。

## 4. push / publish —— 合规

- 当前 `origin/main == HEAD`（未推送差异 0；既有推送为用户操作，非 agent）。
- `scripts/publish-mygo.mjs` 只有 dry-run 门禁与自检，未执行发布；无对外
  发布包/tarball 生成。

## 5. 结论与建议

重点结论（开发与命名）：

1. 命名：npm 名基本合规，`mygo-rdb` 不合规；目录名仅 panel 合规——需用户
   裁决框架仓库是否豁免目录前缀，或排改名轮。
2. emoji：25 文件不合规，其中 render.ts 的脚本输出违规最直接，建议优先清理；
   清理轮需同步刷新本仓库文档中的检查标记。
3. 框架层冲突（install.sh 写入 checkout / PATCHES.md vendor 修改 /
   workspace:^ 依赖 / 共享预设）：建议在 AGENTS.md 增加「核心框架仓库例外」
   条款或另行裁决，避免每次自查都重复命中。

## 6. 待办（未执行，等待裁决）

- emoji 清理轮（25 文件）。
- 命名裁决与（如需要）改名轮。
- AGENTS.md 框架层例外条款登记。
- mygo-rdb 已按用户裁决 ignore（本轮不处理其命名/emoji）。
