# 魔理沙整合包（Marisa Distro）

> DSH 插件生态的一键整合发行：29 插件聚合包 + 一键安装脚本 + profile 直装。
> 命名纪念：dsh-external/marisa（插件管理器）——魔理沙 = 把 DSH 生态精选插件整合成可分发、可审计、带管理内核的发行形态。

## ✅ v1.1 状态（2026-08-13 晚）

**29 依赖整合包完全跑通：HTTP 200，56 boot entries，19 个 client 插件 + 7 host 侧插件。**

5 个曾被剔除插件全部修复回归：**dsh-track**（tsconfig mac 路径→harness、@deepseek-ai 链接重建）、**dsh-sonar**（缺 ui-conversation 链接 + clientModuleHost guard——web profile 禁用 HMR 时跳过 host 注册）、**dsh-sidechain**（cordis 迁移 4 文件 + 链接重建）、**dsh-diff-viewer**（链接修复）、**dsh-a2a**（tsconfig 重写 + cordis 迁移 5 文件）

mygo 管理器已挂载（config.profile: web 已补），pack 打包模式需临时禁用 web-startup。

## ✅ v1 状态（2026-08-13）

**`dsh web` 启动成功（HTTP 200），16 个 client 插件 + host 侧全部挂载，`window.__DSH_BOOT__` 清单 53 entries 验证通过。**

## 安装

### 方式 A：一键脚本（推荐）

```sh
git clone https://github.com/LoserFox/marisa-distro
cd marisa-distro
./install.sh --harness <deepseek-harness源码路径> [--profile marisa] [--skip-verify]
```

脚本会：clone 21 个源码插件 → 生成 profile（dependencies 展开 30 依赖）→ pnpm install → 启动验证。

### 方式 B：profile 直装

```sh
dsh plugin --profile marisa add link:/path/to/marisa-distro/dsh-allinone
```

## 构成

| 组件 | 说明 |
|---|---|
| `dsh-allinone/` | 聚合包：29 依赖 + 27 insert 行的 cordis.patch.yml |
| `install.sh` | 一键安装（clone 插件 + 生成 profile + install + 验证） |
| `plugins.json` | 插件权威清单（21 git 源码 + 8 npm 版） |

### 插件构成（29）

- **21 源码态**（git clone）：git-identity、genui、workflow、vision-toolkit、web-ui-notify、suggested-replies、whale-girl、qwen-mm、multimedia-webui-input、drag-and-drop、stickers、code-map、ui-progress、paste-input、input-history、artifact、sonar、sidechain、diff-viewer、track、a2a
- **8 npm 版**：better-sidebar、llm-fallbacks、web-review、yet-another-subagent、ya-workspace-sidebar、interpreters、mineru、aigc-canvas
- **管理内核**：mygo 管理器 + mygo-cli（profile patch 挂载）

## 待办

- [ ] mygo pack 离线打包：CLI 已激活，卡 pluginManager 服务链（peer 服务 storage/invariants 未配齐）；打包模式需临时禁用 web-startup
- [ ] install.sh 启动验证的 deps-status-check 超时问题（首次启动触发 harness pnpm install，需预稳定）
- [ ] desktop Windows 打包（需 Windows 主机）
- [ ] dsh-auth 登录实现

## 理论背景

Cordis 论文中文翻译：`/root/research/reports/cordis-paper-zh.md`（《时空可组合性的编程范式》——DSH/Cordis 的形式化基础：可逆效应、反应式余效应、动态组合演算）

## 🎯 mygo 管理内核状态（2026-08-14）

**全链路激活**：
- pluginManager 服务 ✅（storage → storage-json → storage-domain → mygo 注入链完整）
- CLI 路由 ✅（`dsh --profile mygo mygo <pack|restore|init>`）
- pack/restore/init 命令链 ✅（pack 报"插件集为空"= 生态现状：当前仅 mygo-cli 有 dsh.mygo manifest，31 个社区插件均为 cordis/bundle 协议，mygo 新协议生态未跟进——非 bug）

**官方缺陷修复（本地 fork）**：web-startup 的 commander 不接受多余参数 → `dsh --profile web mygo pack` 必挂（docs 声称可用）→ 已加 `.argument('[args...]')` 透传（src/startup.ts + lib/startup.js）

**离线分发现状**：魔理沙的 31 插件分发 = install.sh（file: 源码 + 构建 + 链接修复 + 启动验证），不依赖 mygo pack
