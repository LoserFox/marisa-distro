# RESEARCH — 急救模式落地（三级启动状态机 + 恢复执行器，2026-08-22）

> 用户拍板（2026-08-22）：三级启动流程——正常启动 → 不行用极简配置（不加载任何插件和
> 非核心功能）→ 还不行出「魔理沙急救模式」小 UI（壳层自带页面），允许从内嵌 bundle 提取
> 原 backend 资源重新覆盖、重置所有用户配置；原代码和配置允许备份，用户可手动还原自己的
> 配置文件。「初始化配置」「初始化源码」两个选项单独勾选，默认 备份+初始化配置+初始化源码。
>
> 前序研究：docs/RESEARCH-ab-partition-vs-repair-mode-20260821.md（极简模式为主防线、
> A/B 归升级回滚、嵌入式 bundle 作免费 B 槽）。本文件是它的落地实现，分支
> feature/rescue-mode（worktree：marisa-rescue-worktree，基线 803b84dc）。

## 三级启动状态机（desktop/main.go + rescue_state.go + rescue_health.go）

```
normal（--profile marisa 完整组合）
  → 连续 normalFailuresBeforeMinimal（2）次启动失败
  → minimal（--profile web：harness 内置 base+web-app 模板，零 marisa 插件）
    → 连续 minimalFailuresBeforeRescue（2）次失败
    → rescue（壳层本地控制端点 + 急救页，不依赖后端）
```

计入失败计数的事件（同一连续计数器，修复后）：
- 后端进程未发布 URL（启动即退出 / 120s 超时 / 启动失败）；
- **发布 URL 后 stableRunTime（2min）内快速异常退出**——崩溃循环不再无限重试；
- **页面健康检查失败**（见下）——web 页面内报错首次进入降级判定。

清零计数的事件：页面健康通过后的干净退出 / 用户主动重启（托盘「重启后端」）。

- 成功发布 URL 即持久化 normal 状态；冷启动读到持久化 stage=rescue 直接进急救页
  （状态文件在日志目录 rescue-state.json，backend 树之外，恢复/重解包不会清掉）；
- 极简 profile 经 launcher.cmd 的 `MARISA_BOOT_PROFILE` 注入（launcher.cmd 现在
  `set BOOT_PROFILE=%MARISA_BOOT_PROFILE%`，默认 marisa）；
- 托盘「重试完整模式」：置位 retryFullMode 并杀后端，supervise 下一轮迭代拉回
  normal（dev 形态无 launcher 参与，minimal 降级对该形态无效但无害；急救恢复动作
  对 dev 明确报不可用）。

### 手动入口（desktop/rescue_state.go parseBootFlags）

- `--minimal`：跳过完整组合直接以极简 profile 启动（优先于持久化状态）；
- `--rescue`：直接进急救页，不尝试启动后端（并在急救页停留期间持久化
  stage=rescue，关闭重开仍回急救页，直到完成恢复或重试）；
- 与 `--console` 同风格，仅本次进程生效；wails 不解析未知参数，无冲突。

### 页面健康检查（desktop/rescue_health.go monitorPageHealth）

- 导航成功后壳层起 127.0.0.1 随机端口 HTTP 端点（CORS 放行），周期性向当前文档
  注入探针 JS（导航完成前注入落在旧文档，故 500ms 重复注入直至收到心跳）；
- 探针捕获 window error / unhandledrejection 与 DOM 加载完成标记，每 3s 心跳一次；
- 判定：booted 且零错误 → 页面健康；窗口（90s）内出现未捕获 JS 错误 → 该次启动
  计入失败；超时未 booted → 白屏/导航失败，计入失败；
- 覆盖场景：client bundle 抛错（如 inject 缺失导致的 web boot 失败页）、白屏、
  页面加载失败——这些在旧实现里后端 boot 全绿、壳层零感知、永不降级。

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

desktop 单测（rescue_test.go 12 项 + rescue_server_test.go 5 项 +
rescue_health_test.go 7 项 + rescue_guard_test.go 1 项）：
- 执行器六组合矩阵 + 空请求拒绝 + 不可用形态报错（临时目录 + mock 重解包）；
- 状态往返（save/load/损坏回退）、applyBootProfile（minimal 注入 / normal 清除）；
- HTTP 协议：错误 token 403、state 载荷、retry/rescue 触发 done、失败不回传 done；
- 页面健康：心跳端点聚合（booted/错误数/首条错误/CORS）、健康/报错/超时/停止
  四分支、探针脚本内容与格式化；exitFailureClass 计数矩阵；
- 命令行：--minimal / --rescue / 未知参数 / 覆盖顺序。

三形态全过：`go test ./...`、`go test -tags embeddedbundle ./...`、
`go test -tags installedbundle ./...`；`go vet` 三形态全过；
`go build -tags embeddedbundle` release 编译冒烟通过。

## 待人工验收（真实窗口）

1. 完整模式正常启动：无降级（回归）；
2. 人为截断 profile package.json → 重启 → 2 次失败后进极简模式（web UI 可用，无
   marisa 插件）→ 托盘「重试完整模式」；
3. 再破坏（如截断 marisa-distro 下关键文件）→ 急救页出现（文案/错误摘要/勾选默认态）→
   勾选恢复 → 备份目录生成 + 全新出厂 backend + 正常启动；
4. 只勾「初始化配置」：现场还原、配置清零、会话消失（备份可还原）；
5. 还原演练：把 backups/<ts>/backend 改回 backend 后重新启动正常；
6. **页面级降级**：破坏 client bundle（如删除 dist 关键文件）→ 页面 JS 报错 →
   2 次后进极简模式（日志出现「web 页面健康检查失败」）；
7. **--minimal 手动入口**：带参数启动 → 直接极简模式（日志「命令行强制启动阶段：
   minimal」）；**--rescue**：带参数启动 → 直接急救页；
8. **崩溃循环计数**：制造发布 URL 后立即 crash 的循环 → 2 次后降级（此前永不降级）。

## 已知边界

- installed 形态「初始化源码」不可用（MSI 管理，页面禁用该项）；
- dev 形态无 backend 目录，急救动作报「dev 构建使用系统 dsh」；minimal 降级对
  dev 形态无效（无 launcher 参与，MARISA_BOOT_PROFILE 不被消费）；
- 恢复期间窗口不可交互（HTTP 同步执行，解包 1-2 分钟）；
- 备份目录不自动清理（用户手动管理）；
- 页面健康检查只覆盖启动窗口（SetURL 后 90s）：页面健康通过后的运行期 JS 报错
  不触发降级（需页面侧协作上报，属后续迭代）；
- 极简模式仍加载同一 DSH_HOME 与 marisa overlay patch：用户数据损坏或 overlay
  文件损坏时 minimal 同样失败，直接落入急救页兜底。
