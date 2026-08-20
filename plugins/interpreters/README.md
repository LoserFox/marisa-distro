<p align="center">
  <a href="https://dshfind.com/zh/plugins/huanlinoto/dsh-plugin-interpreters"><img src="https://dshfind.com/api/card/huanlinoto/dsh-plugin-interpreters?lang=zh" alt="dsh-plugin-interpreters card"></a>
</p>

# dsh-interpreters

[![npm version](https://img.shields.io/npm/v/@huanlin/dsh-plugin-interpreters)](https://www.npmjs.com/package/@huanlin/dsh-plugin-interpreters)

DSH 插件：暴露 `run_python` 和 `run_node` 两个模型可调用工具，通过 stdin 执行代码并返回 stdout/stderr/exit code。在设置页「插件配置」分区提供配置卡片，让用户设置 Python 和 Node.js 解释器的可执行文件路径，工具描述中会告知模型解释器位置。

## 架构

- **工具**：`run_python` / `run_node`，通过 `spawn(executable, ['-'])` 执行代码，代码经 stdin 传入（无命令行长度限制）
- **设置持久化**：通过 `ctx.settings` 命名空间 `interpreters` 持久化到 `$DSH_HOME/settings.yaml`
- **动态 description**：工具的 `description` 在注册时根据配置计算，包含解释器路径；设置变更时通过 `bridge.onChange()` 自动重新注册
- **配置暴露（TypertRemoteService 模式）**：DSH 的 settings RPC 域（api-proxy）只向配置客户端提供白名单命名空间（`interpreters` 不在其中），所以浏览器通过 host 内置的 typertRemote `/api` RPC 通道读写 `interpreters` 命名空间——`InterpretersConfigGateway` 继承 `TypertRemoteService` 并用 `@Remote('get')` / `@Remote('set')` 标记方法，typertRemote 的 SRC discovery 自动 claim `/api/interpreters/get` 和 `/api/interpreters/set` 端点。gateway 在 host 进程内 in-process 调 `ctx.settings.update(ns, patch)`，绕过 wire-layer allowlist
- **客户端 bundle**：配置卡片通过 `settings.plugin.item` slot 注册（「插件配置」分区），卡片用 `connection.rpc.call('/api', 'interpreters/get'|'set', { args: {...} })` 读写，不依赖 `settingsScope`（因为 `interpreters` 不在白名单中）；`connection/reset` 事件触发卡片重载

## 开发

```sh
pnpm install          # 安装依赖（link: 指向 ~/.dsh/source/current/）
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest run
pnpm run build        # tsdown + tsc（生成 lib/index.js, lib/client.js, lib/types/*.d.ts）
```

### 目录结构

```
src/
├── index.ts              # Host 入口：name, inject, apply（实例化 bridge + gateway + 工具注册）
├── config.ts             # Config schema (schemastery), ResolvedConfig, resolveConfig
├── settings.ts           # installInterpretersSettings: 注册 namespace，返回 bridge (source() + onChange())
├── gateway.ts            # InterpretersConfigGateway: TypertRemoteService + @Remote('get'|'set')
├── tools.ts              # registerTools: 注册 run_python + run_node
├── runner.ts             # runCode: spawn + stdin + stdout/stderr 收集
└── client/
    ├── index.ts          # Client 入口：slots.inject('settings.plugin.item') + connection/reset
    ├── store.ts          # 卡片响应式 store（通过 connection.rpc 读写 /api/interpreters/*）
    ├── InterpretersCard.tsx  # 配置卡片组件
    └── locales.ts        # i18n (zh + en)
```

## 运行

### 本地安装

```sh
# 从 npm 安装（推荐）：
dsh plugin --profile web add @huanlin/dsh-plugin-interpreters

# 本地开发（热更新）：
dsh plugin --profile web add "link:D:/Projects/deepseek-harness/dsh-interpreters"
```

### 配置

默认配置（`cordis.patch.yml`）：

```yaml
pythonPath: 'python'    # Python 可执行文件路径
nodePath: 'node'        # Node.js 可执行文件路径
timeoutMs: 30000        # 执行超时（毫秒）
```

运行时通过设置页「插件配置」分区的卡片修改，持久化到 `$DSH_HOME/settings.yaml`。

## 检查

```sh
pnpm run typecheck && pnpm test && pnpm run build
```

验证 `lib/` 产物：
- `lib/index.js` — host bundle（ESM，external: `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-tools`, `schemastery`）
- `lib/client.js` — client bundle（CJS，`window.__ModuleLoader__.load` 包裹，external: `react`）
- `lib/types/` — TypeScript 声明文件
- `cordis.patch.yml` — bundle 配置层
