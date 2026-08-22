# HANDOFF — 板子合并与构建卡点（2026-08-23）

> 任务：把未提交工作 + 分支合并成一块，出 0.1.8 板子（standalone + MSI + profile），并交付恢复模式演练脚本。
> 状态：**合并与脚本全部完成；构建卡在 pnpm install 的 added 阶段反复 OOM，根因未最终定位，暂停交回人工。**

---

## 一、已完成（本地 main，8 个新提交，未 push）

| 提交 | 内容 |
|---|---|
| `dde30626` merge | feature/upgrade-migration（含工作区全量快照 `c765f03b`：lockfile/ego-browser 0.8.0 vendored/update_guard/mygo 对齐/文档） |
| `efc0d6f4` merge | feature/rescue-upstream（急救体系 5 提交：对比文档/WAL/插件级禁用/minimal 修正/页面挂入口） |
| `eb702af8` merge | sync/0.1.1-rc1（rc.2 换树三分提交） |
| `03d4053a` | 合并后全 workspace 重算锁文件（286 项目，frozen 一致性通过） |
| `3347138d` | **mode-lab 演练脚本**：`scripts/mode-lab/`（break-modes.ps1 8 场景 + repair-modes.ps1 + README，破坏→修复闭环已在 scratch 全验证） |
| `458871bf` | build-release-windows.ps1 堆 8G→10G |
| `5e455fbb` | stickers dist 还原 main 版（边界合规） |
| `da5b7f6b` | auto-resume order:999 修复登记文档（边界合规） |
| `9018222b` | **ego-browser schemastery 依赖修复**（见下） |
| `27687a89` | **mygo devDeps + ego-browser peers 改回 workspace 协议**（见下） |

其他：PR 边界检查通过（2540 路径）；Go dev 测试全绿；备份在 `C:\Users\lf\Documents\Workspace\backups\marisa-board-20260822-033001\`（branches-all.bundle + wip-tracked.bundle `7cf5814a` + untracked.tar）。

## 二、构建卡点：现象与时间线

**症状**：`pnpm install` 在「解析完成 → added 开始」处 V8 OOM 崩溃（exit 134，`Ineffective mark-compacts near heap limit`）。解析从不崩（每次 `resolved 1673/1674` 稳定成功），**node_modules 目录从未被创建**。

尝试矩阵（全部 8G/10G/12G/14G 堆均崩）：

| # | 条件 | 结果 |
|---|---|---|
| 1 | 老工作区 frozen，8G（最初） | 崩，25min |
| 2 | 10G | 崩 |
| 3 | 12G + 低并发 | 崩，55min CPU |
| 4 | 清根 node_modules 后 fresh frozen，10G | 崩 |
| 5 | 清 1686 个嵌套 node_modules 残留后，8G | 崩（残留排除） |
| 6 | no-frozen（复刻昨日成功路径），8G | 崩，40s |
| 7 | sync worktree（node_modules 完整）checkout main 后，8G | 崩 |
| 8 | `--filter` 分段（harness+mygo only），8G | 崩 |

**关键对照（成功样本）**：`%TEMP%\pnpm-install-rc2g.log`（17KB，**昨天 2026-08-22 00:26**，sync worktree 换树后安装）：
- `Scope: all 285 workspace projects` → `resolved 1673` → **`reused 381`** → `Packages: +14 -377` → **`added 14, done`** → prepare 全跑 → `Done in 1m 2.4s`（8G 堆）
- 昨天是**增量**：node_modules 已存在且大部分匹配 lockfile，只 added 14 个包。

今天所有失败：`reused 34~363`（低）→ **added 1300+ 未完成即崩**。

## 三、已排除的假设（有证据）

1. **node 二进制**：PATH 命中 `%LOCALAPPDATA%\marisa-distro\backend\node.exe`，但 SHA256 与 `C:\Program Files\nodejs\node.exe` **完全一致**，非发行版特制。
2. **嵌套 node_modules 残留**：清掉 1686 个（plugins/*/node_modules 数千文件、harness 每个包内、vendor）后仍崩。
3. **lockfile 污染**：我们的 lockfile 有 4223 处 `0.1.0-rc.8` 引用 vs sync 版 4020——**引用数相近，rc.8 树是正常状态**（peer 变体计数），sync 版同样如此且成功过。lockfile frozen 一致性验证通过。
4. **link: 病态依赖**：ego-browser `"@deepseek-ai/schemastery": "link:../dsh/vendor/schemastery"` 指向不存在目录 → 已修为 `workspace:^`（提交 9018222b）——修完仍崩。
5. **registry 副本树**：mygo devDeps 钉 `^0.1.0-rc.6`、ego-browser peers 钉 `0.1.0-rc.8` 会从 registry 拉副本树 → 已改回 `workspace:^`（提交 27687a89，mygo 还原 sync 分支写法）——修完仍崩。
6. **全量 vs 增量 / 树完整度**：复制完整 node_modules（含 junction 结构）后 reused 363（接近昨日 381），仍崩。
7. **filter 分段**：缩小安装范围不改变解析全图，仍崩。

## 四、当前最可能的原因（供你自查）

**物理内存不足导致 V8 GC 失效**。依据：
- 昨天成功 = 深夜空闲机器；今天所有失败 = Marisa 应用运行中（node ×2 + WebView2）+ 页交换严重（Free RAM 曾到 0 GB）
- 崩溃点稳定在堆接近上限时（GC 日志：`Mark-Compact 8179.7 MB` 时 abort）——8G 堆的进程在这台 15.7G 机器上拿不到足够物理页
- 但**这个解释不让人信服**（正常 pnpm 不该要 8G），所以保留以下自查方向：
  1. **关掉 Marisa 应用后重跑**（最快二分：过了=环境内存；还崩=代码/工具问题）
  2. **ProcMon 观察 added 阶段**：pnpm 在 added 时对文件系统做了什么（硬链接风暴？防病毒实时扫描交互？）
  3. **另一台内存充足的机器跑同样的 install**：8G 堆下如果秒过 → 环境问题实锤
  4. 尝试 pnpm 12/13 或 `--config.package-import-method=copy`（避开硬链接路径）
  5. 检查 Windows 内存压缩 / 提交上限：`TotalVirtual 44.2G / FreeVirtual 22.7G`（pagefile 29G，虚拟内存不是瓶颈）

## 五、现场地图

| 位置 | 说明 |
|---|---|
| `.claude/worktrees/sync-011-rc1/` | **黄金现场**：node_modules 完整（junction 结构完好，1.58GB），HEAD = main（27687a89 detached），工作树 lockfile = **sync 版健康 lockfile**（`git status` 显示 M 是预期）。昨天 8G 1 分钟成功的树 |
| `%TEMP%\pnpm-install-rc2g.log` | 昨天成功日志（黄金对照） |
| `%TEMP%\pnpm-*.log` | 今天 8 个崩溃日志 |
| `scripts/mode-lab/` | 演练脚本（已提交） |
| `C:\Users\lf\Documents\Workspace\backups\marisa-board-20260822-033001\` | 全量备份 |
| 主仓库 `node_modules` | **已删除**（我曾复制残缺 junction 版本，已清理） |

## 六、最短续跑路径（你接手后）

```powershell
# 0) 释放内存：关闭 Marisa 应用（关键！）
# 1) 在黄金现场生成健康 lockfile（含 ego-browser 修复后的解析）
cd .claude\worktrees\sync-011-rc1
$env:NODE_OPTIONS='--max-old-space-size=8192'; $env:CI='true'
pnpm install --no-frozen-lockfile          # 预期：resolved 1673 → reused 高 → added 少量 → done

# 2) 把健康 lockfile 拿回主仓库并提交
Copy-Item pnpm-lock.yaml C:\Users\lf\Documents\Workspace\marisa-distro\pnpm-lock.yaml
cd C:\Users\lf\Documents\Workspace\marisa-distro
git add pnpm-lock.yaml && git commit -m "chore(lockfile): workspace 协议修复后重算"

# 3) 主仓库安装（机器空闲时 8G 足够；不够就 10G）
pnpm install --frozen-lockfile

# 4) 出板子
pwsh -NoProfile -File scripts/build-release-windows.ps1 -Version 0.1.8
```

如果步骤 1 在关掉应用后**仍然** OOM：问题在 pnpm 11.9.0 × 该 lockfile × Windows 组合，按第四节 2–5 自查，或考虑在内存充足的机器上构建。

## 七、我的错误清单（供复盘）

1. **删除了原本可用的根 node_modules**（老工作区那棵是 rc.8 时代的，与 rc.2 lockfile 不匹配，我判定"脏"就删了——但删之前它至少能让 pnpm 走增量路径；这直接把问题从"慢"变成"必崩"）
2. 反复加堆（8→10→12→14G）而不先查根因，浪费数小时
3. 中途误杀 node 进程（连带 DSH 会话后端，你被迫重启会话）
4. 合并 mygo 冲突时选了 WIP 的 rc.6 钉版（应选 sync 的 workspace:^）——已修正
5. ego-browser 的 `link:` 病态依赖和 rc.8 peers 钉版在第一轮审查就该发现，拖到排查时才发现

## 八、遗留事项（板子出完后）

- `--rescue` 真机验证（急救页插件管理/WAL 回滚 UI）
- mygo 接线 `wal begin/seal/verify`
- vision-toolkit 复评（modlens 保留中）
- 全部分支提交未 push（需代理 socks5://127.0.0.1:10808）

## 九、结局（2026-08-23 凌晨，后续会话补记）

**根因已定位并复现验证，测试板已产出。**

- 根因不是内存不足、不是循环引用、不是单插件配置：`nodeLinker: hoisted` 下，**任何 importer 集合变化 → lockfile 重算 → peer 变体哈希全量漂移（嵌套传递）→ 全树重链计划 → planner 需要 >14G 堆**。本机（16G）从未具备全量安装能力，历史成功全是 `+14` 级增量；删除根 node_modules 后首次暴露。
- 佐证：`--lockfile-only` 重算仅 8s 从不 OOM；同 manifest 两次重算 byte-identical（确定性无问题）；importer 恰 285/286 个与 manifest 数一致（嵌套 workspace 无串扰）；成功日志同样含 cyclic workspace 警告。
- **出板配方（本机验证可行）**：sync worktree（唯一健康 node_modules）+ sync 原版 lockfile + 与之一致的 285 importer manifest → frozen 增量安装（58s）→ build.ps1（-SkipRootInstall/-SkipProfileInstall/-SkipSelfCheck/-SkipDesktopShell）→ make-bundle（ego 目录挪出 staging）→ go build embeddedbundle。产物：`release/Marisa-DSH-0.1.8-migration-test-standalone.exe`（129.8MB，不含 ego 组合）。
- stage 内 prod 安装必须保持 frozen：no-frozen 会在 prod 修剪下重新解析，宽松区间解到远古 `0.0.1-rc.1` 并 404（dsh-compact 未发布）。
- **纪律：本机永远不要 fresh 安装 / 删 node_modules；manifest 变更只用 `pnpm install --lockfile-only` 重算。**
- 开放问题：同 manifest 确定性重算与 sync 原版 lockfile 哈希不同（疑 registry 浮动区间 24h 漂移），待钉死；正式版板子建议大内存机器/CI 出。
