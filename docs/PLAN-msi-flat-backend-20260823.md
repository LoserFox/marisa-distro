# MSI 扁平化与用户目录常驻源码后端方案（PLAN）

> 状态：草案（2026-08-23）  
> 关联：`docs/packaging.md`、`desktop/installer/Product.wxs`、`desktop/installed.go`、`desktop/embedded.go`、`desktop/paths.go`

## 1. 背景与动机

standalone 形态（`go:embed bundle/backend.tar.zst` + `%LOCALAPPDATA%\marisa-distro\backend\`）已经验证了一套可用路径：首次启动按 `VERSION` 解包、staging 原子发布、替换前 `guardUpdateData` 备份 `.dsh`、按 `MIGRATIONS.json` 链式迁移。MSI 形态仍是另一条分叉链路：`%LOCALAPPDATA%\Marisa DSH\` 下同时放 `exe + backend.tar.zst + backend\`，安装期在 MSI 事务内解包，回滚只能从 `backend.tar.zst` 重提。

用户侧痛点：

1. **程序目录不扁平**——`Marisa DSH\` 既是程序目录又是数据目录，`backend.tar.zst` 装完即无用却常驻安装目录，难清理、难审计。
2. **回滚必须重提**——`backend\` 删了就没了，没有版本化缓存，回滚要重解 `tar.zst` 或重跑 MSI，慢且依赖安装包仍在。
3. **升级在 MSI 事务内做重 IO**——`PrepareBackend` 解 50k+ 小文件时不能弹窗、看不到进度，失败靠 MSI 回滚而非应用层重试。
4. **两套 `ensureBackend` 分叉**——`installed.go` 与 `embedded.go` 各自为政，后续加迁移/备份要改两处。

本方案把 MSI 改为：程序目录扁平化、源码 backend 常驻用户目录并版本化，回滚直接切版本，不从 exe/MSI 里重提。

## 2. 现状盘点

### 2.1 MSI（`installedbundle`）

- `desktop/installer/Product.wxs:12,20,29,38`：`INSTALLFOLDER=%LOCALAPPDATA%\Marisa DSH\`，含 `ApplicationExecutable` + `BackendArchive(backend.tar.zst)` 两个 Component。`InstallExecuteSequence` 在 `InstallFiles` 后以 `deferred` 方式执行 `--prepare-installed-backend "[INSTALLFOLDER]backend.tar.zst"` 解到 `INSTALLFOLDER\backend\`，`rollback` 时执行 `--remove-installed-backend`。
- `desktop/scripts/build-msi.ps1`：`go build -tags installedbundle` 产出不含内嵌的薄壳 `marisa-desktop-msi.exe`，`candle/light` 再把 `backend.tar.zst` 打进 MSI。
- `desktop/installed.go:22`：`installedBackendDir()` = `exe 旁 backend\`；`ensureBackend()` 仅校验 `launcher.cmd` 存在并复活 `LINKS.json`，不做版本管理。

### 2.2 Standalone（`embeddedbundle`）

- `desktop/embedded.go:29,39,82`：`//go:embed bundle/backend.tar.zst` 编进 exe；`backendRootDir()` = `%LOCALAPPDATA%\marisa-distro\backend\`；`ensureBackend()` 对比 `embeddedBackendVersion()` 与 `backend\VERSION`，`backend.extracting` staging 解包→`runUpgradeMigrations`→`guardUpdateData`→`RemoveAll backend`→`Rename`→复活 junction→写 `VERSION`。
- `desktop/paths.go:11`、`desktop/update_guard.go`、`desktop/migrate.go`：应用数据目录、`.dsh` 备份、迁移链均围绕 `marisa-distro\` 树。

### 2.3 落差小结

| 维度 | MSI | Standalone |
| --- | --- | --- |
| 程序目录 | `exe + backend.tar.zst + backend\` | 单 exe |
| 后端落盘 | `INSTALLFOLDER\backend\` | `marisa-distro\backend\` |
| 版本化 | 无 | `VERSION` + staging 原子发布 |
| 回滚 | 重解 tar.zst | 重启即重试，数据有 `backup\` |
| 升级交互 | MSI 事务内，不可弹窗/无进度 | `guardUpdateData` 可选确认框+日志 |

## 3. 目标形态

### 3.1 目录布局

```
%LOCALAPPDATA%\Marisa DSH\          # 程序目录（扁平）
  Marisa DSH.exe
  backend-maintenance-error.log      # 仅失败时

%LOCALAPPDATA%\marisa-distro\        # 用户数据 + 后端（常驻源码）
  backend\                           # 当前生效（launcher 指向这里）
    launcher.cmd / .dsh / VERSION / LINKS.json / ...
  backends\                          # 版本化归档，回滚源
    marisa-backend-0.1.8\
    marisa-backend-0.1.9\
  cache\
    backend.tar.zst                  # 可选：最近一次分发的原始 tar.zst（校验/离线重装）
  backup\dsh-<from>-<ts>\            # 已有 .dsh 备份，不动
  logs\ / sessions\ / ...
```

- 程序目录只留 exe（与快捷方式）；`backend.tar.zst` 不再常驻程序目录，`backend\` 也不在程序目录。
- MSI 与 standalone 共用 `%LOCALAPPDATA%\marisa-distro\backend\` 这一棵树；`MARISA_BACKEND_DIR` 仍可覆盖，便于排障。
- 回滚 = 把 `backends\<目标版>` 拷回/切回 `backend\`，不碰 exe，不重解。

### 3.2 生命周期

- **安装**：MSI 只装 exe。首次启动时 exe 自行把 backend 发布到 `marisa-distro\backend\`（见 §4.2 二选一实现）。
- **升级**：新 MSI 覆盖 exe；下次启动按 `VERSION` 走 `staging→迁移→备份 .dsh→归档旧版到 backends\<from>→发布新版`。旧版保留在 `backends\`。
- **回滚**：托盘/急救页「回滚到上一版」列 `backends\` 可用版本，停后端后把目标版拷回 `backend\` 并重建 junction。
- **卸载**：MSI 卸载只删程序目录；`marisa-distro\` 保留（避免误删 `.dsh`）。如需「完全卸载」由应用层显式动作或卸载时勾选。

## 4. 详细设计

### 4.1 MSI 产物变化

- `Product.wxs`：删除 `BackendArchive` Component 及其 `File(backend.tar.zst)`；`Feature Complete` 仅剩 `ApplicationExecutable`。删除三条 `CustomAction`（`PrepareBackend / RollbackPrepareBackend / RemoveBackend`）及 `InstallExecuteSequence` 中对应条目。
- `MediaTemplate` / `MajorUpgrade` / 快捷方式保持不变；`INSTALLFOLDER` 仍为 `%LOCALAPPDATA%\Marisa DSH\`，但内容扁平。
- MSI 体积显著下降（不再内含 `backend.tar.zst`）；安装事务不再做重 IO。

### 4.2 后端分发二选一（择一落地）

**方案 A（默认推荐）：exe 内嵌**——MSI 只含 exe，exe 以 `embeddedbundle`（或新增 `msi-flat`）tag 把 `backend.tar.zst` 编进自身。最扁平，MSI 只有一个 File，安装后首次启动即走 standalone 同款 `ensureBackend`。代价是 exe 体积回到 standalone 量级。

**方案 B：MSI 另送 cache payload**——MSI 仍携带 `backend.tar.zst`，但 `Directory` 指向 `LocalAppDataFolder\marisa-distro\cache\`（而非 `INSTALLFOLDER`），落盘为 `cache\backend.tar.zst`。exe 保持薄壳，首次启动从 `cache\backend.tar.zst` 解到 `backends\<version>\` 再发布到 `backend\`。MSI 体积与现状相当，exe 体积小，但需新增 cache 目录的 Component 规则。

两者对 Go 侧改动几乎相同，仅 `backend` 字节来源不同（`go:embed` vs 读 `cache\backend.tar.zst`）。本方案默认按 A 实现，B 作为回退选项保留分支。

### 4.3 Go 侧统一

- 新增 `desktop/backend_store.go`（或并入 `paths.go`）：
  - `backendRootDir() / backendsDir() / cacheTarPath() / listBackendVersions() / readActiveVersion()`。
  - `backendsDir()` = `appDataDir() + "\backends"`；`cacheTarPath()` = `appDataDir() + "\cache\backend.tar.zst"`。
- 抽公共 `ensureBackend()`：
  - 来源版本：A 走 `embeddedBackendVersion()`，B 走读 `cacheTarPath()` 内 `VERSION`（复用 `extractTarZst` 的读 VERSION 逻辑）。
  - 对比 `backend\VERSION`，一致则仅 `recreateLinks`；不一致则 `staging→runUpgradeMigrations→guardUpdateData→归档旧版→发布`。
  - 归档旧版：`copyDshTree` 跳过 junction 的能力复用到整棵 `backend\` 归档（或 `Move` 后拷回，取决是否需保留 `backend\.dsh` 的 junction 语义）。
- `installed.go`：
  - `installedBackendDir()` 改为 `MARISA_BACKEND_DIR ?? backendRootDir()`，不再是 `exe 旁`。
  - `ensureBackend()` 委托公共实现；保留 `handleBackendMaintenance` 作兼容入口（MSI 旧包仍可能调用），内部转调新路径或直接返回。
- `embedded.go`：复用同一公共 `ensureBackend`，仅保留 `backendZip` 的 embed 声明。
- `update_guard.go / migrate.go`：不动，MSI 也走同一套 `backupDshData / guardUpdateData / runUpgradeMigrations`。`platformUpdatePrompt` 在静默场景（`MARISA_UPDATE_NO_PROMPT=1`）自动备份，不阻塞安装。

### 4.4 回滚实现

- `rollbackBackend(targetVersion string) error`：
  1. 校验 `backends\<target>` 存在且含 `launcher.cmd / VERSION / LINKS.json`；
  2. 停后端进程（复用 `backendManager` / `killServerTree`）；
  3. `guardUpdateData` 备份当前 `backend\.dsh`（失败则中止）；
  4. `RemoveAll backend\` 后把目标版整棵拷回（或 `Rename` + 拷回旧 `.dsh`，视归档策略定）；
  5. `recreateLinks` + 写 `VERSION`。
- 急救页（`desktop/rescue*.go`）与托盘（`desktop/tray.go`）新增「回滚到上一版」入口，展示 `listBackendVersions()` 供选择；失败写 `backend-maintenance-error.log` 供排障。
- 保留 `MARISA_BACKEND_DIR` 覆盖，便于「手动指向某版 backends\xxx」排障。

### 4.5 兼容迁移

- 首次启动检测到 `exe 旁 backend\`（旧 MSI 布局）存在：自动搬到 `marisa-distro\backend\`（若后者不存在）或归档到 `backends\<oldVersion>`，然后删 `INSTALLFOLDER\backend.tar.zst` 与 `INSTALLFOLDER\backend\` 的残留。
- 检测到 `INSTALLFOLDER\backend.tar.zst` 残留：移到 `cache\backend.tar.zst` 或直接删除（A 方案下不需要）。
- `MajorUpgrade DowngradeErrorMessage` 保持不变；`UpgradeCode` 不变，覆盖安装即升级 exe，下次启动触发 backend 发布。

## 5. 不做的事情

- 不改变 `harness / plugins / bundles / profiles` 的构建链；`make-bundle.ps1` 仍产出 `backend.tar.zst`。
- 不改变签名/更新检查/市场逻辑；`MARISA_INSTALL_FORM` 仍为 `msi`（或改为 `msi-flat`，待定）。
- 不自动清理 `backends\` 历史版本（可后续加「保留 N 版」策略）。
- 不把 `marisa-distro\` 纳入 MSI 卸载的自动清理（防误删用户数据）。

## 6. 风险与取舍

- **A vs B 的取舍**：A 最扁平、链路最统一，但 exe 体积大、全量随 MSI 分发；B 体积分布更均衡，但 MSI 需新增 cache Component，且「MSI 只有 exe」的简洁性稍弱。两者可通过构建参数切换，不锁死。
- **杀毒/占用**：发布期需停后端再 `RemoveAll backend\`；`backend\.dsh` 的文件占用与 standalone 现有逻辑一致，已有 `killServerTree` 与 `serverStopGrace` 覆盖。
- **junction 语义**：归档/回滚时复用 `isJunction / LINKS.json` 逻辑，避免把 `node_modules` 等部署物 junction 当普通目录拷。
- **静默升级不卡住**：MSI 不再弹窗，`MARISA_UPDATE_NO_PROMPT=1` 路径已覆盖 deferred custom action 场景，改后更不易挂起安装。

## 7. 实施步骤

1. 新增 `desktop/backend_store.go`：`appDataDir` 派生的 `backendRootDir / backendsDir / cacheTarPath / listVersions / readActiveVersion`。
2. 抽公共 `ensureBackend` 实现，`embedded.go` 与 `installed.go` 共用；`installedBackendDir` 改指向用户目录；`handleBackendMaintenance` 保留兼容。
3. 改 `Product.wxs` + `build-msi.ps1`（A：切 `embeddedbundle` 内嵌；B：改 payload 目标到 `cache\`。默认 A）。
4. 实现 `rollbackBackend` 与 `listBackendVersions`，接入 `rescue.go / tray.go` 的回滚入口。
5. 加入旧布局迁移：`exe 旁 backend\` 与 `INSTALLFOLDER\backend.tar.zst` 的检测与搬运。
6. 通过验证（见 §8）后更新 `docs/packaging.md` 的打包步骤与目录说明。

## 8. 验证清单

```powershell
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
pwsh -NoProfile -File desktop/bundle/make-bundle.ps1
pwsh -NoProfile -File desktop/scripts/build-msi.ps1
```

- MSI 安装：`%LOCALAPPDATA%\Marisa DSH\` 仅含 exe，`marisa-distro\backend\` 首次启动后出现且版本正确。
- 升级：覆盖安装新 MSI，重启后 `backend\VERSION` 更新，`backends\` 留有旧版，`.dsh` 数据未丢（`backup\` 有备份）。
- 回滚：急救页/托盘回滚到上一版，重启后版本回退、功能正常。
- 卸载：卸载后 `Marisa DSH\` 清空，`marisa-distro\` 保留；重装可恢复。
- 旧版迁移：从当前 MSI 布局升级到新布局，`exe 旁 backend\` 自动迁移且无残留 `backend.tar.zst`。
- 边界：`MARISA_BACKEND_DIR` 覆盖、`LINKS.json` 缺失/损坏、`VERSION` 缺失的容错与日志。

## 9. 后续工作

- `backends\` 保留策略（N 版上限与清理时机）。
- `packaging.md` 与 `RESEARCH` 文档同步；`maintenance/upstreams.json` 无需变更。
- Release 流程中 MSI 体积与 `SHA256SUMS.txt` 的说明更新。
