# dsh-bash-terminal（Marisa fork）

fork 基线：npm `dsh-bash-terminal@0.3.14`（[MAXeaglet/dsh-bash-terminal](https://github.com/MAXeaglet/dsh-bash-terminal)，MIT）。vendored 自 npm 包（host 为编译产物 `lib/`，`src/` 仅 client），fork 版本号 0.4.0。**需求来源**：Marisa 长期讨论的「在 pwsh / MSYS2 bash / WSL2 bash 之间随意切换」shell 切换器（见 [8-15 调研](RESEARCH-adam-awesome-plugin-audit-20260815.md) 的 Shell 切换需求与 `dsh-bash-terminal` 初评；2026-08-20 实测四个候选插件后决定 fork 本插件补齐缺口）。

## fork 增量（相对 0.3.14）

| # | 增量 | 文件 | 说明 |
|---|---|---|---|
| 1 | **msys2 后端** | `lib/index.js` | `SHELLS` 加入 `msys2`；新增 `candidateMsys2Paths`（已知根 `C:\msys64` / `C:\tools\msys64` / Program Files / LOCALAPPDATA + PATH 中以 `usr\bin` 结尾且排除 Git 的条目）；`resolveAllPaths` 支持 `msys2Root` 配置；`buildArgv`/`terminalArgv` 增加 msys2 分支（`bash -lc` / `bash -i`） |
| 2 | **MSYSTEM 注入** | `lib/index.js` `lib/terminal.js` | `buildEnv` 对 msys2 在未设置时注入 `MSYSTEM`（默认 `MINGW64`，`msys2Msystem` 可配）；terminal open 同样注入 |
| 3 | **按调用切换** | `lib/index.js` `lib/terminal.js` | `shell` 工具新增 `shell` 参数（enum powershell/msys2/gitbash/wsl），execute 用 `args.shell ?? settings.defaultShell`；`terminal` open 同款 `shell` 参数。设置页 `defaultShell` 仍是用户默认，模型仅在用户明确要求时临时切换（systemPrompt 有对应引导） |
| 4 | **wslDistro 配置** | `lib/index.js` `lib/terminal.js` | `wslDistro` 作为 WSL 默认发行版（`args.distro ?? settings.wslDistro`），未配置走系统默认 |
| 5 | **设置面扩展** | `lib/index.js` | settings namespace 从只有 `defaultShell` 扩为 `defaultShell` + `msys2Root` + `msys2Msystem` + `wslDistro`；execute/terminal open 每次从 settings 合并解析（设置页改动即时生效） |
| 6 | **设置页补 msys2 选项** | `src/client.jsx` | 设置 → 通用「默认终端」下拉原本只有 PowerShell / Git Bash / WSL 三项，与后端四后端目录不一致（后端 `msys2` 只能靠配置文件 `defaultShell` 或按调用 `shell` 参数使用）；`SHELLS` 对齐 `lib/index.js` 加入 `msys2`，补充 zh/en `shell.msys2` 文案（2026-08-26） |
| 7 | **默认终端值动态注入 system prompt** | `lib/index.js` | 原 `tool:bash-terminal` 引导段是静态文本（只说 "defaults to the user's choice"，模型无从知道当前值，容易猜 shell 或改用 pwsh 工具）；改为 `systemPrompt.section` 函数式 text，每次请求组装时读取 settings 的 `defaultShell` 实际值嵌入（如 "The user's current default terminal is Git Bash (…value \"gitbash\")…Do NOT pass the shell argument on ordinary calls"）。新 `shellGuidanceText` 纯函数可单测（2026-08-26） |
| 8 | **调用卡片显示实际终端** | `lib/index.js` | shell 工具是四合一，UI 卡片只显示工具名 "shell"，看不出用哪个终端（官方 bash/pwsh 有专属行 "Bash · {description}"）；`presentCall` 的 description 改为 `callDescription()` 前缀终端标签（`Git Bash · 查看 git 状态`），显式 `shell` 参数优先、否则闭包读一次 settings 默认值（结果随 callView 快照持久化，重放保留调用时终端）——折叠行、展开卡片、结果态均可见（2026-08-26） |

上游语义保持：不占用 `ctx.shell` 接缝（官方沙箱 pwsh 原样可用）；`ctx.subprocess` 派生（进程树终止、grace/SIGKILL、spill）；`run_in_background`/`jobs`；沙箱 escalate 面（`sandbox_permissions`/`justification`，wsl 视为自隔离）；每次调用全新 shell 不保留状态。

## 配置

bundle patch 默认（全部可选，留空即自动探测）：

```yaml
- id: tool-bash-terminal
  name: 'dsh-bash-terminal'
  config:
    defaultShell: 'powershell'   # powershell | msys2 | gitbash | wsl
    msys2Root: ''                # 如 C:\msys64；留空自动探测
    msys2Msystem: 'MINGW64'      # MSYSTEM 值（MINGW64/MSYS/UCRT64/CLANG64...）
    wslDistro: ''                # 如 Ubuntu-22.04；留空用系统默认发行版
    pwshPath: ''                 # 留空自动探测
    gitBashPath: ''              # 留空自动探测
    wslPath: ''                  # 留空用 %SystemRoot%\System32\wsl.exe
```

## 权限影响

- **进程执行**：以 dsh 进程同权限派生用户所选 shell（pwsh / MSYS2 bash / Git Bash / wsl.exe）执行命令，**在 DSH 沙箱外**（与上游一致）；沙箱策略仅经 `ctx.sandboxPolicy`/`ctx.sandbox` 对非 wsl 后端做 argv 约束与 deny 检测。
- **网络/写盘/密钥**：无新增。探测只做 `lstat` 与 PATH 扫描。

## 验证

- **单元测试**：`plugins/dsh-bash-terminal/test/unit.mjs`（node:test，13 项）——候选路径探测（含排除 System32/Git）、`resolveAllPaths` 配置优先、msys2/wsl argv 构造、MSYSTEM/WSLENV env 注入、terminalArgv、`shellGuidanceText` 动态引导段（嵌入当前默认值 + 禁止猜测传参）、`callDescription` 卡片终端标签。运行方式：插件目录 `node_modules` junction 指向含 @deepseek-ai peer 的 node_modules（开发机用已安装后端），`node test/unit.mjs`。
- **设置页 UI 验证**（2026-08-26，live 部署树）：`node scripts/build-client.mjs` 重建 `dist/client.js`/`dist/client.core.js` 后同步 live 部署，浏览器实测设置 → 通用 →「默认终端」下拉出现四项 PowerShell / MSYS2 / Git Bash / WSL；选中 MSYS2 写入 settings 持久化（下拉按钮即时变为 MSYS2），切回 Git Bash 恢复原默认值。
- **boot 冒烟**：以已安装 rc7 后端的 `marisa-test` 测试 profile 装载 fork（bundle patch 生效、`--dump-config` 含 `tool-bash-terminal` 行与全部 config 键），web app 启动 HTTP 200、无 boot 报错。
- **真实执行**：本机 `C:\msys64\usr\bin\bash.exe -lc 'echo $MSYSTEM; uname -s'` 在非沙箱环境输出 `MINGW64` / `MINGW64_NT-10.0-26200`，pacman 在位——msys2 后端 argv 链路可用。沙箱/受限令牌下 MSYS2 报 `couldn't create signal pipe, Win32 error 5`（与 Marisa OOM 事故记录同源，属沙箱限制非插件缺陷）。
- **环境事实**（2026-08-21 本机）：`C:\msys64` MSYS2 已装、Git for Windows 已装、pwsh 7 在位；`wsl -l` 在沙箱下返回 E_ACCESSDENIED，WSL 发行版需桌面环境复核。

## 上游反馈

- 计划：向 MAXeaglet/dsh-bash-terminal 提交 msys2 后端 + 按调用 `shell` 参数 + `wslDistro` 配置的 PR（本机 GitHub 不可达，待网络恢复后提交）。
- 同步注意：上游 npm 版本若更新，按 `maintenance/upstreams.json` 的 fork 流程重放差异（diffDocument 本文件）。

## 2026-08-23 依赖区间迁移

0.1.1-rc.2 迁移收敛的一部分：`@deepseek-ai/*` 依赖区间从 `^0.1.0-rc.6`/`^0.1.0-rc.8` 统一改为 `workspace:^`（workspace 成员）或 `^0.1.1-rc.2`（registry 包）。机械替换，无代码改动；解析目标从 registry rc.8 副本树切换到 workspace rc.2 树。反馈上游：待同步窗口。
