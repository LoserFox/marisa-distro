# Shell 切换器候选插件实测（2026-08-21）

范围：为「在 pwsh / MSYS2 bash / WSL2 bash 之间随意切换」的 shell 切换器需求实测四个候选插件，并落地 Marisa fork（`plugins/dsh-bash-terminal`，见 [docs/plugins/dsh-bash-terminal.md](plugins/dsh-bash-terminal.md)）。
方法：npm 拉取包 + 源码审计 + 在已安装 rc7 后端（`%LOCALAPPDATA%\marisa-distro\backend`）的 `marisa-test` 测试 profile 逐个装载，`--dump-config` 验证组合 + web app 真实 boot（HTTP 200 + 客户端资源）冒烟。

## 结论

1. **dsh-bash-terminal 0.3.14 是缺口最近的实现，已 fork 为 Marisa v0.4.0**：一个 `shell` 工具 + `terminal` 交互 PTY 工具，四种后端（fork 增加 msys2），设置页默认终端，fork 增加按调用 `shell` 参数切换。8-15 审计时的「1 Star、patch 官方白名单、文档矛盾」问题在 0.3.14 已基本消解（不依赖 settings 白名单 patch，走官方 settings/工具 seam）。
2. **dsh-envsel 0.1.3（rc7 原生）质量高但不是 shell 切换器**：会话级环境选择（conda/R/WSL 发行版/自定义路径），`/env` 命令 + `session_env` 工具 + `DSH_ENV_*` shell 事实，可与 shell 切换器互补（env 选择 ≠ 终端选择）。
3. **dsh-wsl-workspace 0.2.3 是 WSL 执行世界方案**：把整个 shell/fs 世界换成 WSL 提供方并生成 `wsl-<mode>` 预设，功能验证真实生效（scratch DSH_HOME 生成 4 个 wsl 预设），与「会话内切换终端」定位不同，可作 WSL 重度用户的可选路线。
4. **dsh-shell-command 0.1.0 是命令手势插件**：`/!` 单条命令 + `/terminal` 交互 PTY 弹窗，与 shell 切换器正交，不冲突。
5. **四个插件在 rc7 部署实例全部 boot 通过**，无依赖冲突；node-pty/conpty 在沙箱下无法验证（命名管道限制），`/terminal` 交互需桌面环境复核。

## 候选插件一览

| 包 | 版本 | 许可 | 运行依赖 | peers | 功能 | boot |
|---|---|---|---|---|---|---|
| dsh-bash-terminal | 0.3.14 | MIT | schemastery | rc.6 | 一个 shell 工具、多终端（powershell/gitbash/wsl + fork 的 msys2）、设置页默认、sandbox 感知、后台任务 | ✅ |
| @beihaizb/dsh-envsel | 0.1.3 | MIT | zod | rc.7 | /env + session_env 工具 + DSH_ENV_* 事实 + 客户端下拉；conda/R/WSL/自定义路径 | ✅ |
| dsh-shell-command | 0.1.0 | MIT | schemastery, node-pty, ws | rc.6 | /! 命令触发 + /terminal 交互 PTY 弹窗（connection RPC + agents + webServer） | ✅ |
| dsh-wsl-workspace | 0.2.3 | MIT | 无 | `*`（宽松） | WSL 工作区：生成 wsl-<mode> 预设，shell/fs 世界换为 WSL 提供方 | ✅ |

## 实测过程与证据

测试台：已安装 rc7 后端 + scratch DSH_HOME（仓库 `.tmp-plugin-audit/dsh-home`，settings/.credentials 复用）+ `marisa-test` profile（node_modules junction → 后端共享树，插件包解压进共享 node_modules，逐个加入 `dsh.profile.bundles`）。

- **组合验证**：`dsh --profile marisa-test --dump-config` 每个插件均出现对应 patch 行（envsel / tool-bash-terminal / shell-command / wsl-workspace），config 键完整。
- **boot 冒烟**：`node bin.js --profile marisa-test --port 7999` 后台启动，输出 `dsh web: http://127.0.0.1:7999`，HTTP 200，JS 资产 200，无 boot 报错（含 dsh-wsl-workspace 与 fork 共存场景）。
- **功能级**：
  - wsl-workspace：`$DSH_HOME/.agent-presets/` 真实生成 `wsl-code` / `wsl-cordis` / `wsl-minimal` / `wsl-standard`（agent.cordis.yml + preset.yml），persona 提示 WSL 上下文 ✅
  - bash-terminal fork：`C:\msys64\usr\bin\bash.exe -lc 'echo $MSYSTEM; uname -s'` 非沙箱环境输出 `msys2-ok:MINGW64` / `MINGW64_NT-10.0-26200`，pacman 在位 ✅；沙箱下报 `couldn't create signal pipe, Win32 error 5`（受限令牌限制，非插件缺陷）
  - envsel / shell-command：host apply 无异常；`/env`、`/!` 属于会话内交互行为，需 GUI 目视复核（本会话无浏览器自动化）
- **本机环境**：`C:\msys64`（MSYS2）✅、Git for Windows ✅、pwsh 7 ✅；`wsl -l` 沙箱下 E_ACCESSDENIED，WSL 发行版待桌面复核。

## 判定与下一步

- **默认挂载**：`dsh-bash-terminal` fork（v0.4.0）进入 Marisa 组合（bundle patch 已加，defaultShell=powershell）。`shell` 工具与官方 `tool-pwsh`（工具名 pwsh）不撞名；`terminal` 工具与官方 `tool-terminal`？——boot 实测无冲突，但工具目录重名需在发行前用 `request/header` 对比确认（对齐 8-15 验收门第 7 条）。
- **不默认挂载**：envsel（可选，MyGO 可装）、wsl-workspace（WSL 重度用户可选，注意它会在 DSH_HOME 写 `.agent-presets/`）、shell-command（可选，与官方工具面正交）。
- **待办**：① 上游 PR 反馈（GitHub 可达后）；② GUI 目视验证设置页下拉与 `/terminal` PTY；③ 工具目录重名比对；④ WSL 发行版实测（wsl 后端 + wslDistro）。

## 复现测试台

1. 复制后端 profile：`Copy-Item backend\.dsh\profiles\marisa → backend\.dsh\profiles\marisa-test`（node_modules 为 junction，勿跟随复制）。
2. 插件包解压进 `backend\marisa-distro\node_modules\<pkg>`（或 junction 指向仓库目录）。
3. `marisa-test/package.json` 的 `dsh.profile.bundles` 追加包名。
4. `$env:DSH_HOME=scratch; node backend\marisa-distro\harness\apps\cli\lib\bin.js --profile marisa-test --dump-config` / `--port 7999`。
