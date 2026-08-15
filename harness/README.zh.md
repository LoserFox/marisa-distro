# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是一款基于 DeepSeek Harness SDK 构建的开源 coding agent（编程智能体）。

它采用了**一切皆插件**的架构。

## 内测声明

DeepSeek Harness 正处于内部测试阶段，功能和接口可能发生变化。

为帮助诊断上报的问题，内测版本默认上传所有会话日志。设置 `DSH_TELEMETRY_DISABLED=1` 可关闭遥测。请通过内部企业微信群反馈问题和建议。

## 安装

克隆仓库，然后运行安装器：

```sh
git clone <repo-url>
cd deepseek-harness
scripts/install.sh
```

安装器要求系统已安装 `git` 和 Node `^22.19 || >=24`，缺少 `pnpm` 时可代为安装，并会提示输入 DeepSeek API 密钥，然后构建所需的仓库产物并启动 Web UI。

默认生效的检出位于 `~/.dsh/source/current`，启动器链接到 `~/.local/bin`。再次运行安装器即可更新。其他位置、更新机制和恢复选项由 [`scripts/install.sh`](scripts/install.sh) 负责。

## 使用 DeepSeek Harness

### Web UI

推荐在本地使用 Web UI；安装结束时，选择 Web UI 即可。以后需要启动时，或更新当前生效的检出后，请构建仓库并运行：

```sh
(cd ~/.dsh/source/current && pnpm run build)
dsh web
```

上述路径是安装器的默认位置。如果你设置过 `DSH_SOURCE` 或 `DSH_CURRENT`，或者复用了已有检出，请把 `~/.dsh/source/current` 换成该检出路径；详情见 [`scripts/install.sh`](scripts/install.sh)。Web UI 默认通过 `http://127.0.0.1:3080` 提供服务。

### Profile

`dsh` 启动 profile：按序叠放的插件组合包 patch 层，之上再叠加你在 `$DSH_HOME/profiles/<name>` 中的自有覆盖层：

```sh
dsh --profile web                       # the browser UI (same as: dsh web)
dsh plugin --profile tui add <package>  # install a plugin into a custom profile
dsh --profile tui                       # boot it
```

profile 布局、层语义与配置输出命令详见 [CLI（命令行界面）契约](apps/cli/README.md#profiles)。

### Headless

运行一项任务，打印最终答案后退出：

```sh
dsh run "summarize this workspace"
```

### 自动化与 SDK

在源码检出中通过环境变量或根目录 `.env` 设置 `DEEPSEEK_API_KEY`，然后启动 ACP（Agent Client Protocol）自动化服务器：

```sh
pnpm run demo:acp
```

[Python SDK](python/README.md) 驱动随附的 JSON-RPC 运行时。[示例](examples/README.md)涵盖可运行的 headless、ACP、JSON-RPC、Code Mode 和自指组合。

## 为什么选择 DeepSeek Harness

内置功能涵盖文件读取、编辑与搜索、shell 和持久 PTY 执行、可复用 skill（技能）、任务跟踪、目标、计划、待办事项与后台任务、subagent 与工作流、沙箱与审批、设置与凭据、可持久化、恢复、fork 与查询的会话、LSP 与 Web 访问、上下文压缩（context compaction），以及遥测。每个组合只选用适合其使用方式的能力子集。Web UI 包含 Plan Mode。

- **一切皆插件。** 模型、工具、策略、存储、上下文管理和界面均可组合为 [Cordis 插件](docs/user/develop/basic/index.md)，部署方无需 fork agent loop（智能体循环）即可扩展或替换行为。底层设计见[架构文档](docs/architecture.md)。
- **运行可重建。** 凡是模型可见的内容，都会记录在权威会话流中；持久化、恢复／fork／查询、回放、遥测和 UI 均从同一组事件派生。参见[会话日志架构](docs/architecture.md#session-log)。
- **Code Mode（需显式启用）。** 它会提供 `run_code` 工具和生成的 TypeScript SDK，只有程序输出会重新进入模型上下文。参见 [Code Mode](packages/core/tools/README.md#code-mode)。
- **自指 Cordis 工具需显式启用。** 这些工具可让 agent 检查自身的实时运行时，并在运行中挂载或卸载插件。参见 [Cordis 工具](packages/cordis/tool-cordis/README.md)。

## 社区

扫描二维码，或打开 <a href="https://wj.qq.com/s2/27234598/03eb/">DeepSeek Harness 微信社区申请页面</a> 申请加入。

<p>
  <img src="assets/community-wecom-survey.png" alt="DeepSeek Harness 微信社区二维码" width="240">
</p>

## 开发

请先阅读[开发指南](docs/development.md)；修改包之前，请阅读[架构文档](docs/architecture.md)。

面向 agent：遵循 [AGENTS.md](AGENTS.md)。

DeepSeek Harness 目前处于内测阶段。

## 许可证

[BSD 3-Clause](LICENSE)

第三方依赖及其许可证在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中披露。
