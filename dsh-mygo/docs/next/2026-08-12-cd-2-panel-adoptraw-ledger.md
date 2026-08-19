# 候选决策 CD-2：面板 folder 安装的静态账 vs `dsh.lock/v1` 账本分叉（只登记，不实现）

> 生成时间：2026-08-12 · 与 CD-1（错误词汇分叉）同格式登记。
> 出处：cli-verification.md §8.2（T50 如实标注）、README「Web 面板」一节。

## 现状

- 面板 folder 安装（`POST /api/mygo/install` → `installFromRoot` →
  `pluginManager.adoptRaw`）走**静态装载路径**：账目 = `cordis.patch.yml`
  桥接行 + `mygo-plugins/<id>/` 安装目录 + `.mygo-install.json` +
  `plugins()` 静态记录（origin static / rail bridge）；**不写** pack 期
  `dsh.lock/v1`，**不写** registry 行（registry 表保持 0 行，实测 T50）。
- pack/npm 安装路径（`installPluginPack` / `resolveInstall`）写
  `dsh.lock/v1` + 不可变 store + registry 持久化。
- 两套账本并存：同一插件可能「面板账有、lockfile 账无」（或反之）。

## 候选方向

- (a) 统一：面板 folder 安装也走 `resolveInstall`/lockfile 路径（需本地
  tarball 候选 + 身份归一），面板账收敛为 lockfile 的投影；
- (b) 明确定义静态账为合法一等路径：桥接行 + 安装目录即账本，lockfile 只
  覆盖 npm/pack 源；在 README/文档中给出判定规则（何时用哪条路径）；
- (c) 混合：保留静态账，但 `bomExport`/对账把两账并表并标注来源。

## 状态

仅登记，本轮与后续实现不得预先落地任一方向；待独立小轮裁决。
