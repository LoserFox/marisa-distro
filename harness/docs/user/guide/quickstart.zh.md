# 快速开始

[English](quickstart.md) | 中文

本指南带你在 5 分钟内跑起一个 Agent。

## 环境准备

- [Node.js](https://nodejs.org/) ^22.19 或 >= 24
- 通过 Corepack 使用 [pnpm](https://pnpm.io/) 11
- [DeepSeek Platform](https://platform.deepseek.com/) API key

```sh
node -v
corepack enable
pnpm -v
```

## 第一步：安装并配置 API key

```sh
git clone https://github.com/deepseek-ai/deepseek-harness-sdk.git
cd deepseek-harness
pnpm install
pnpm run build
```

在仓库根目录创建已被 Git 忽略的 `.env`：

```sh
DEEPSEEK_API_KEY=sk-your-key-here
```

## 第二步：运行一个 Headless 任务

运行一个非交互式任务并打印最终回答：

```sh
pnpm run dsh run "summarize the architecture of this workspace"
```

`dsh run` 创建并持久化一个新会话，打印最终 assistant 回答，然后退出。运行期间，stderr 会打印可用于观察该会话的本地浏览器 URL。

## 第三步：使用 Web UI

启动浏览器界面：

```sh
pnpm run dsh web
```

打开 `http://127.0.0.1:3080`。agent 可以读写文件、运行命令、分配子任务和跟踪计划。可以尝试：`Create hello.js in the current directory, print "Hello from Harness!", and run it`。

## 回头看

`dsh run` 启动 `headless` profile：[`dsh-base`](../../../packages/bundle/base/cordis.patch.yml)、[`dsh-web-app`](../../../packages/bundle/web-app/cordis.patch.yml) 和 [`dsh-headless`](../../../packages/bundle/headless/cordis.patch.yml) 在空根之上组合。`dsh web` 使用前两层，不包含一次性 runner。二者都会根据各自入口模式选择 DeepSeek 模型和能力插件。

## 下一步

- [配置模型](./providers.md) — 接入 DeepSeek 之外的提供方与自定义网关
- [配置文件](./config.md) — 了解 `cordis.yml` 的格式
- [开发插件](../develop/basic/) — 编写自己的 tool 或后端
