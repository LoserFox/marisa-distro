# dsh-update-check

Marisa 发行版自研的检查更新插件（本地第一方插件）。定期检查 GitHub Releases，
发现新版本后在设置页卡片与启动横幅提示。

**只做检查 + 通知**：不下载、不校验、不安装——下载按钮深链到 GitHub Release
资产（MSI / standalone EXE，按安装形态选择；dev 形态给 Release 页）。

## 组成

- host 半（`lib/index.js`）：cordis 函数插件，注册四个同源路由
  （`/plugins/dsh-update-check/{state,check,dismiss,settings}`）与
  `update-check` settings namespace；启动 30s 后首次检查，之后每
  `checkIntervalHours`（默认 24h）一次；状态缓存到 `$DSH_HOME/update-check/state.json`。
- client 半（`lib/client.js`）：启动横幅（顶部 fixed，最小 DOM 注入）与设置页卡片
  （`settings.plugin.item`，key = `update-check`）。

## 配置（cordis 入口 config / 设置页）

| 键 | 默认 | 说明 |
|---|---|---|
| `repo` | `omdsh-dev/marisa-distro` | 检查的 GitHub 仓库（owner/repo） |
| `apiBase` | `https://api.github.com` | GitHub API 基址（镜像/测试可覆盖） |
| `checkIntervalHours` | `24` | 定时检查间隔（小时） |
| `autoCheck` | `true` | 自动检查开关（设置页可改） |

`MARISA_VERSION` 为空（dev 构建）时自动隐身：只注册路由，不启动定时检查、
不发网络请求、不写缓存。

## 权限影响

见 [docs/plugins/dsh-update-check.md](../../docs/plugins/dsh-update-check.md)。

## 开发

```sh
pnpm install       # 根 workspace 安装（插件是 workspace 成员）
pnpm run build     # tsdown：lib/index.js + lib/client.js
pnpm run typecheck
pnpm test          # vitest：semver / 状态缓存 / 代理 / 路由 / mock 集成
```
