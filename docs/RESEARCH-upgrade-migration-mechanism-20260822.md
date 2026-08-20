# 发行版升级迁移机制方案（standalone/MSI）

日期：2026-08-22
状态：**方案定稿，未落地**（用户「先只出方案不动手」；落地窗口建议随 rc8 harness 换树同 PR）
目标：给 Marisa 发行版补上缺失的「老版本 → 新版本」迁移机制——回答三个问题：迁移要不要提示、迁移什么、失败怎么办。当前仓库**没有任何迁移代码**（详见 `docs/plugins/dsh-update-check.md` 与 `desktop/embedded.go`/`installed.go`）。

## 零、现状与缺口（审计结论，2026-08-22）

| 层 | 现状 | 缺口 |
|---|---|---|
| 发现新版本 | `dsh-update-check`（plugins/，本地第一方）：轮询 GitHub Releases，横幅/设置卡片，深链下载 | 无（职责保持：只检查+通知，不下载不安装） |
| 程序落地（standalone） | `ensureBackend()`：VERSION 不一致 → **静默删旧 backend 目录 + 整体重解包**（embedded.go:102-146） | ① 无迁移步骤钩子 ② 用户改过 backend 目录内文件（部署 profile、cordis.patch.yml 等）被静默覆盖 ③ 无迁移日志/可查性 |
| 程序落地（MSI） | WiX `MajorUpgrade` 覆盖安装 + `--prepare-installed-backend` 全新解包（Product.wxs） | 卸载旧版时旧 backend 内自定义文件随 `RemoveBackend` 删除，无备份 |
| 用户数据 | 会话/设置/profile 运行时数据在 `%USERPROFILE%\.dsh\`，不在 backend 内，升级天然保留 | 若新版本改数据格式（rc8 研究已点名 session 存储格式变化，见 `docs/RESEARCH-rc8-migration-20260820.md` §6），**无迁移路径、无提示，旧数据可能直接读不了** |

用户原话问题：「老版本更新到新版本，会提示要迁移吗？还是默认迁移？」——现状回答：**不会提示，也没有迁移，是默认静默替换**。

## 一、设计原则：什么时候默认、什么时候提示

回答「提示还是默认」的唯一依据是**迁移是否影响用户可见数据、是否可逆**：

| 级别 | 触发条件 | 行为 | 例子 |
|---|---|---|---|
| `silent` 无感迁移 | 纯内部/路径调整，无用户可见变化 | 静默执行，不打扰 | junction 重建、缓存目录改名、索引重建 |
| `backup` 备份后默认迁移 | 改动用户数据但可逆 | **先自动备份再执行**，完成时一次性横幅告知备份位置 | 会话库格式重写、backend 内自定义配置归档 |
| `prompt` 提示确认 | 迁移会丢失信息，或需用户选择 | 后端启动后弹提示卡片，用户确认/取消后才执行 | 删除重复会话、格式迁移失败率高的重写 |

硬性规则（不因版本紧急而放宽）：

1. **失败安全**：迁移任一步失败 → 不删旧 backend、不切换，保留可启动的旧版本，下次启动重试（幂等）。
2. **可逆性**：所有 `backup` 级迁移执行前先落备份目录；`silent` 级也必须幂等可重放。
3. **可查性**：每次迁移写 `$DSH_HOME/migrations/state.json`（from/to、已完成步骤、时间、备份路径）与迁移日志；UI 可查。
4. **绝不静默丢用户自定义**：backend 目录内被新版 bundle 覆盖的文件一律先归档到备份目录，任何情况下不直接删除。

## 二、总体架构：两层迁移

按「谁拥有数据谁迁移」划分职责，避免壳与后端抢数据：

```
┌─ 文件层（Go 壳侧，desktop/migrate.go，新增）────────────────┐
│  编排 backend 目录替换：备份旧自定义文件 → 解包新 staging →   │
│  原子切换 → junction 重放 → 写 VERSION / 迁移状态            │
│  失败路径：保留旧目录，可重试                                 │
└───────────────────────────────────────────────────────────┘
┌─ 数据层（后端侧，迁移插件/脚本，随新 bundle 分发）───────────┐
│  会话库 / settings / profile 数据格式迁移；prompt 级弹提示    │
│  卡片（复用 dsh-update-check 的 UI 模式）；跑完写版本标记      │
└───────────────────────────────────────────────────────────┘
      元数据：$DSH_HOME/migrations/state.json（两侧共用）
      备份区：%LOCALAPPDATA%\marisa-distro\backup-<from>-<to>\
```

划分理由：

- 数据格式的**拥有者**是新版本后端（session/settings 的读写代码都在 harness 里），数据层迁移必须由后端自己跑，壳只负责把「旧版本号」传给后端。
- 目录替换的**编排者**是壳（它本来就管 ensureBackend），文件层迁移插在它的既有流程里最稳。
- 提示 UI 放数据层（后端启动后）天然绕开一个时序坑：`ensureBackend()` 在 `application.New()` 之前执行，此时壳还没有任何窗口可弹；数据层提示发生在后端起来之后，界面齐全。

## 三、迁移清单格式（bundle 内 `MIGRATIONS.json`，与 VERSION 并列）

```json
{
  "migrations": [
    {
      "from": "0.1.6",
      "to": "0.1.7",
      "steps": [
        {
          "id": "session-store-format",
          "scope": "data",
          "mode": "backup",
          "summary": "会话库存储格式升级",
          "detail": "v0.1.7 起会话库改为压缩物理层；旧库自动备份后原地升级",
          "script": "scripts/migrate-session-store.mjs"
        },
        {
          "id": "backend-custom-config-archive",
          "scope": "file",
          "mode": "backup",
          "summary": "归档旧版自定义配置",
          "detail": "cordis.patch.yml 等用户自定义文件备份到 backup 区",
          "paths": ["cordis.patch.yml", "config/"]
        }
      ]
    }
  ]
}
```

规则：

- **阶梯式**：`{from, to}` 成对声明；升级路径 = 从旧版本沿阶梯逐级执行到新版本，每级一组 steps。跨多级升级（如 0.1.5 → 0.1.8）按链依次跑 0.1.5→0.1.6→0.1.7→0.1.8。
- `scope: file` 由壳执行（`paths` 相对 backend 目录根，逐项归档到备份区后允许覆盖）；`scope: data` 由后端执行（`script` 相对新 bundle 根，壳解包后通过环境变量告知后端跑哪个脚本）。
- 步骤按 `mode` 分级执行：`silent` 直接跑；`backup` 先备份后跑；`prompt` 只登记 pending，等后端 UI 确认。
- 清单缺项（无 from 匹配）时**宁可跳过该级迁移也不阻塞启动**，但记录 `skipped` 到 state.json，供人工介入。

## 四、执行时序（standalone，改动点标注）

现状（embedded.go:102-146）：`读 VERSION → 不一致 → RemoveAll(旧) → 解包 staging → rename → junction → 写 VERSION`。

改后：

```
1. 读 %LOCALAPPDATA%\marisa-distro\backend\VERSION  = fromVersion
2. 读内嵌 bundle VERSION                            = toVersion
   ├─ 相同 → 现有路径（repair LINKS.json）结束
3. 读内嵌 MIGRATIONS.json，取 from→to 阶梯步骤
4. 【新增·文件层】对每个 scope:file 步骤：
   ├─ silent → 直接执行（幂等）
   └─ backup → 先把 paths 逐项复制到 backup-<from>-<to>\
5. 解包新 bundle 到 staging（★ 保留旧目录不删，与现状不同）
6. 【新增】写 MARISA_MIGRATIONS_FROM=fromVersion 到壳环境（子进程继承）
   —— 同时把 pending 的 scope:data / prompt 步骤清单写入
      $DSH_HOME/migrations/state.json（data-pending）
7. 切换：RemoveAll(旧) → rename(staging→backend) → junction 重放 → 写 VERSION
8. 后端首次启动：读 MARISA_MIGRATIONS_FROM → 跑 data-pending 的
   scope:data 脚本（silent/backup 自动，prompt 弹提示卡片）→
   完成写 state.json + 清 env 标记
```

失败路径（新保证）：

- 步骤 4-6 任一失败 → **删 staging、保留旧 backend 与旧 VERSION**，写错误到 state.json，下次启动重试。旧版本仍可正常启动（这正是「先只出方案」阶段最值得先落地的收益：现在一旦迁移过程崩在 RemoveAll 之后，用户手里只剩半个 backend）。
- 步骤 7 的切换本身保持现有原子性（staging + rename），不变。

## 五、提示 UI（数据层）

- `backup` 级完成：后端启动后一次性横幅「旧版本自定义配置已备份到 %LOCALAPPDATA%\marisa-distro\backup-0.1.6-0.1.7」（设置页可再次查看）。
- `prompt` 级：设置卡片 + 启动横幅，含迁移说明与「迁移 / 暂不」按钮；暂不则继续使用（旧格式数据只读降级或保持原样，不静默破坏），state.json 保留 pending，下次启动再问。
- 复用 `dsh-update-check` 已验证的横幅/卡片/设置 namespace 模式，不新造 UI 基建。

## 六、MSI 形态差异

| 项 | MSI 行为 | 方案 |
|---|---|---|
| 文件层迁移 | WiX 卸载旧版时 `RemoveBackend` 直接删旧 backend，新装全新解包 | **v1 不做文件层迁移**：旧 backend 自定义文件随卸载删除是 MSI 语义，风险由数据层 + 安装说明承担；如需保留，后续在 `PrepareBackend` 前加自定义动作归档（低成本，可后置） |
| 数据层迁移 | `%USERPROFILE%\.dsh\` 不受 MSI 影响 | 与 standalone 完全同路：安装后首次启动读 `MARISA_MIGRATIONS_FROM`（安装器通过 `PrepareBackend` 的 ExeCommand 或首启 env 注入） |
| 提示 | — | 同 standalone（数据层提示） |

## 七、实施范围（分阶段，建议随 rc8 换树同 PR）

- **阶段 1（框架，纯壳侧）**：`desktop/migrate.go` —— MIGRATIONS.json 解析、阶梯选择、backup 归档、state.json 读写、失败安全（staging 失败保留旧目录）。`go test` 覆盖：清单解析、多级阶梯、backup 幂等、失败不删旧。
- **阶段 2（数据层）**：迁移插件或复用现有插件挂 env 读取 + `scope:data` 脚本执行器 + 提示横幅/卡片 + state.json 完成标记。集成测试：mock 后端 + 假旧 bundle 跑通 检查→迁移→标记 全流程。
- **阶段 3（首个真实迁移项）**：随 rc8 落地时定义 session 存储格式迁移（内容以 rc8 上游 README 的升级路径为准）与 backend 自定义配置归档。
- **不做什么**：不接管自动下载安装（dsh-update-check 职责不变）；不做跨大版本回滚；MSI 文件层迁移后置。

## 八、验收清单

1. 构造假旧版本 bundle（VERSION=0.1.6 + backend 内自定义文件）→ 升到新版本 → 断言：自定义文件出现在 backup 区、state.json 记录完整、会话/设置数据在 `%USERPROFILE%\.dsh\` 原样保留。
2. 失败注入：迁移脚本中途退出 → 断言旧 backend 未删、VERSION 仍是旧值、下次启动可重试且不重复执行已完成步骤。
3. 跨多级：0.1.5 → 0.1.8 沿阶梯依次执行且每级只执行一次。
4. `pnpm test`、`go test -C desktop ./...` 与双 tag（`-tags embeddedbundle` / `installedbundle`）全绿。
5. 真实窗口验收：standalone 升级后首启横幅出现、MSI 覆盖安装后数据层迁移提示出现。
