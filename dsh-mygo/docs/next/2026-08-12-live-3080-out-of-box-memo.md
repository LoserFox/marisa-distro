# 备忘录：3080 运行环境更新 + Phase B 开箱可用性检查（2026-08-12）

> 性质：运维/交接备忘录（非设计文档）。记录 3080 从 0810 + mygo 0.2.x 迁移到
> 0811 + mygo 0.0.1-rc.1 的过程、开箱检查结论、已知边界与提交清单。

## 1. 环境现状（实测）

- `$DSH_HOME/source/current` → `test-r05En1cU-0811`；`dsh --version` = `0.0.1-rc.1`；
  `~/.dsh/mygo-self.json` = `0.0.1-rc.1 @ 4b9282f`。
- 3080 以 **lib 生产模式**运行：`node …/apps/cli/lib/bin.js web --port 3080`
  （PID 随重启变化；日志 `/tmp/dsh-3080.log`）。0811 源码经 tsx 直跑不兼容
  （`FiberState` const enum），必须用构建产物。
- web profile：bundles 仅 `dsh-base` + `dsh-web-app`；patch 行
  `storage-sqlite` / `dsh-mygo` / `dsh-mygo-panel`（默认启用）；
  `mygo-rdb-store`（postgres）已移除，deploy 目录与数据保留未删。
- 外部插件兼容已全部撤下：bundle/deps/patch 行/安装目录（移入
  `/tmp/mygo-update-backup-DqW1`），注册表无启用行。
- 受管插件：`dsh-mygo-cli`（enabled，经面板 folder 安装激活）。

## 2. 默认安装形态（install.sh）

**默认同时安装 mygo 本体 + panel**（+ mygo-api + mygo-cli）：

- 复制：`packages/core/mygo-api`、`packages/cordis/mygo`、`packages/cordis/mygo-cli`、
  `vendor/dsh-mygo-panel`（0810 checkout 额外复制 `vendor/cordis-alias`）。
- 构建：四包 `tsc -b` + `tsdown` + panel `build.mjs`（build:lib:host/client/web 由全量
  `npm run build` 承担）。
- 链接：profile 回退链接（5 项）、包级开发链接（mygo-cli/panel）、checkout 根
  `node_modules/@deepseek-ai/{dsh-mygo,dsh-mygo-api}`（面板 folder 安装的插件依赖解析，
  §5.7）。
- `DSH_SKIP_PNPM=1` 可跳过全仓 pnpm install（避免网络/重装；依赖由上述链接提供）。
- `VERSION` = `0.0.1-rc.1`，写入 `mygo-self.json`。

## 3. Phase B 开箱可用性检查（到 Phase B）

| 项 | 结果 | 证据 |
|---|---|---|
| clean → install.sh → 全量 build → 3080 启动 | [OK] | `npm run clean`（226 路径）→ install.sh → `npm run build` rc=0 → 3080 root 200 |
| 客户端插件 bundle | [OK] | 此前失败的 agent-preset 等全部 200（全量 client build 后） |
| CLI 套件（T44-T49） | [OK] 15/15 | 无网拦截，3 文件全绿 |
| 全量回归（mygo + mygo-api + CLI） | [OK] 63 文件 / 621 用例 | 无网拦截；**注**：测得时工作树含未提交的 mygo-rdb 下限修正（见 §4.2） |
| EB 套件 | [OK] 13/13 | 无网拦截 |
| typecheck（mygo-api + mygo + mygo-cli） | [OK] | `tsc -b` rc=0 |
| CLI 经面板激活 | [OK] | `POST /api/mygo/install`（folder）→ `plugins()` 显示 `dsh-mygo-cli enabled`；依赖 `install.sh §5.7` 根链接 |

## 4. 已知边界 / 注意事项

1. **live patch disable 面板不对称**：仅编辑 `cordis.patch.yml` 去掉/加回
   `disabled: true` 会热生效（无需重启）；热 enable 干净（200），热 disable 会残留
   `/api/mygo/*` 路由返回 400（`inactive context`），重启后才是 404 干净态。
2. **mygo-rdb 暂时 ignore（用户裁决，2026-08-12）**：其 manifest 下限
   `service:mygo-core >=0.1.0` 与版本线 `0.0.1-rc.1` 冲突，相关 3 个用例在 rc.1
   ambient 下失败；下限改为 `>=0.0.1-rc.1` 可修复。决策：**修正保留本地不回退、
   不提交**；打包/安装流程经核查本就不含 mygo-rdb（publish-mygo.mjs 仅发布
   mygo-api/mygo/panel/cordis-alias；install.sh 不复制 extension/mygo-rdb），
   维持不打包。提交态（不含修正）下这 3 个用例会失败，待后续单独处理。
3. **同 profile 双开冲突**：`dsh --profile web mygo …` 与运行中的 3080 会争端口；
   CLI 命令应在独立 profile 或停掉 web 后执行。
4. **pnpm install 会重建包级 node_modules**（可能清掉手工链接）；install.sh §5.6/5.7
   已固化，重跑即恢复。
5. 运行 3080 请继续用 lib 生产模式入口（`apps/cli/lib/bin.js` 或 0811 `bin/dsh`）。

## 5. 提交清单

**本次提交（已备好，等用户 push）**：
- `install.sh`：§5.7 checkout 根 node_modules 链接（面板安装依赖解析）。
- `packages/cordis/mygo-cli/tests/cli-e2e.spec.ts`：T47 自举语料对
  `workspace:^` 依赖的打包期归一（F1 同款，修复 communityDeps 区间校验）。
- 本备忘录。

**mygo-rdb（ignore，本地保留、不提交、不打包）**：
- `extension/mygo-rdb/package.json`（下限 `>=0.1.0` → `>=0.0.1-rc.1`）。
- `packages/cordis/mygo/tests/bom.spec.ts`、`tests/extension-mygo-rdb.spec.ts`
  （同一修正的测试断言）。

**此前已本地提交（未 push）**：`4b9282f`（install 纳入 CLI + skip-pnpm + VERSION）、
`d3a54ce`（host 聚合排除 mygo tests）、`73faf8a`（CLI workspace 依赖修正）、
`90ccd91`（包级开发链接固化）。

**备份**：`/tmp/mygo-update-backup-DqW1`（mygo-self.json、web package.json、
cordis.patch.yml、四个外部插件目录）。
