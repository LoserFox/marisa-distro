# RESEARCH — 急救模式落地（三级启动状态机 + 恢复执行器，2026-08-22）

> 用户拍板（2026-08-22）：三级启动流程——正常启动 → 不行用极简配置（不加载任何插件和
> 非核心功能）→ 还不行出「魔理沙急救模式」小 UI（壳层自带页面），允许从内嵌 bundle 提取
> 原 backend 资源重新覆盖、重置所有用户配置；原代码和配置允许备份，用户可手动还原自己的
> 配置文件。「初始化配置」「初始化源码」两个选项单独勾选，默认 备份+初始化配置+初始化源码。
>
> 前序研究：docs/RESEARCH-ab-partition-vs-repair-mode-20260821.md（极简模式为主防线、
> A/B 归升级回滚、嵌入式 bundle 作免费 B 槽）。本文件是它的落地实现，分支
> feature/rescue-mode（worktree：marisa-rescue-worktree，基线 803b84dc）。

## 三级启动状态机（desktop/main.go + rescue_state.go）

```
normal（--profile marisa 完整组合）
  → 连续 normalFailuresBeforeMinimal（2）次启动失败（未发布 URL / exit≠0）
  → minimal（--profile web：harness 内置 base+web-app 模板，零 marisa 插件）
    → 连续 minimalFailuresBeforeRescue（2）次失败
    → rescue（壳层本地控制端点 + 急救页，不依赖后端）
```

- 成功发布 URL 即清除失败计数并持久化 normal 状态；
- 冷启动读到持久化 stage=rescue 直接进急救页（状态文件在日志目录
  rescue-state.json，backend 树之外，恢复/重解包不会清掉）；
- 极简 profile 经 launcher.cmd 的 `MARISA_BOOT_PROFILE` 注入（launcher.cmd 现在
  `set BOOT_PROFILE=%MARISA_BOOT_PROFILE%`，默认 marisa）；
- 托盘新增「重试完整模式」：置位 retryFullMode 并杀后端，supervise 下一轮迭代拉回
  normal（dev 形态无 launcher 参与，minimal 降级对该形态无效但无害；急救恢复动作
  对 dev 明确报不可用）。

## 急救页与控制端点（desktop/rescue.html + rescue_server.go）

- 壳层起 127.0.0.1 随机端口 HTTP 服务，仅接受随机 token（页面 URL 内嵌，fetch 透传）；
- `GET /api/state`：最近失败原因 + 日志尾部 + 备份根 + capabilities（resetSource 是否
  可用——embedded 可用，installed/dev 不可用并禁用勾选项）；
- `POST /api/rescue {backup, resetConfig, resetSource}`：执行动作，成功 signalDone
  让 supervise 回 normal 重启；失败留在急救页可重试；
- `POST /api/retry`：不恢复直接重试完整启动；`/api/open-log`、`/api/open-backups`、
  `GET /api/backups` 辅助；
- 页面文案：「哎呀，魔理沙无法正常启动，即使打开极简模式仍无法正常运行。」

## 恢复执行器（desktop/rescue.go + 形态分派）

动作语义矩阵（backup 默认勾选）：

| backup | resetSource | resetConfig | 行为 |
|---|---|---|---|
| ✓ | ✓ | ✓ | 整个 backend rename 到 backups/<ts>/backend（原子、junction 自洽）→ 重解包出厂（含出厂 .dsh）→ 配置即出厂（幂等清用户面） |
| ✓ | ✓ | ✗ | 备份 → 重解包 → 用户配置面（sessions/storages/settings/凭据/profile 用户层 cordis.patch.yml）从备份搬回新树 |
| ✓ | ✗ | ✓ | 备份 → 现场 rename 还原 → 清 .dsh 用户面（出厂文件保留） |
| ✓ | ✗ | ✗ | 备份 → 现场还原（纯备份，页面提示需至少勾一项初始化） |
| ✗ | ✓ | ✓/✗ | 直接 RemoveAll + 重解包（无备份，页面有警告文案） |
| ✗ | ✗ | ✓ | 保留源码，仅清 .dsh 用户面 |
| ✗ | ✗ | ✗ | 拒绝（页面按钮禁用） |

- 备份是整体 rename（秒级、junction 目标绝对路径随还原自动复活）；用户手动还原 =
  把 backups/<ts>/backend 改回 backend（或只拷回 .dsh 配置面）；
- 「初始化源码」= `reinstallBackend()`：RemoveAll(backend) 后复用 ensureBackend 的
  版本化原子解包（VERSION 缺失即重新解包内嵌 tar.zst）——嵌入式 bundle 即免费 B 槽；
- 形态分派：rescue_embedded.go（embeddedbundle）/ rescue_installed.go（installedbundle）/
  rescue_dev.go（无 tag）提供 rescueBackendDir；rescue_embedded.go /
  rescue_stub.go（!embeddedbundle）提供 reinstallBackend + rescueSourceAvailable。

## 测试证据

desktop 单测（rescue_test.go 12 项 + rescue_server_test.go 5 项）：
- 执行器六组合矩阵 + 空请求拒绝 + 不可用形态报错（临时目录 + mock 重解包）；
- 状态往返（save/load/损坏回退）、applyBootProfile（minimal 注入 / normal 清除）；
- HTTP 协议：错误 token 403、state 载荷、retry/rescue 触发 done、失败不回传 done。

三形态全过：`go test ./...`、`go test -tags embeddedbundle ./...`、
`go test -tags installedbundle ./...`；`go vet` 三形态全过。

## 待人工验收（真实窗口）

1. 完整模式正常启动：无降级（回归）；
2. 人为截断 profile package.json → 重启 → 2 次失败后进极简模式（web UI 可用，无
   marisa 插件）→ 托盘「重试完整模式」；
3. 再破坏（如截断 marisa-distro 下关键文件）→ 急救页出现（文案/错误摘要/勾选默认态）→
   勾选恢复 → 备份目录生成 + 全新出厂 backend + 正常启动；
4. 只勾「初始化配置」：现场还原、配置清零、会话消失（备份可还原）；
5. 还原演练：把 backups/<ts>/backend 改回 backend 后重新启动正常。

## 已知边界

- installed 形态「初始化源码」不可用（MSI 管理，页面禁用该项）；
- dev 形态无 backend 目录，急救动作报「dev 构建使用系统 dsh」；
- 恢复期间窗口不可交互（HTTP 同步执行，解包 1-2 分钟）；
- 备份目录不自动清理（用户手动管理）。
