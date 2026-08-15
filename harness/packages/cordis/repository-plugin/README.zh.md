# @deepseek-ai/dsh-repository-plugin

[English](README.md) | 中文

这是 DeepSeek Harness 的受限 repository 插件格式。仓库作者在 `.dsh-plugin/package.json` 中声明静态 skill（技能）根和可选的通用 `.mcp.json`；prepare helper 会复制这些资源并生成固定、无 import 的 Cordis 包装模块。运行时包装模块只能委托给这个由 DSH 自有的包，再由它组合 [`dsh-skill-local`](../../skill/skill-local/README.md) 与 [`dsh-mcp-client`](../../mcp/mcp-client/README.md)。设计依据见[静态 repository 插件格式 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-30-static-repository-plugin-format.md)。

## 创作格式

在仓库的 `.dsh-plugin` 目录中放置一个普通包：

```json
{
  "name": "humanize-dsh-plugin",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "prepare": "dsh-plugin-prepare"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-repository-plugin": "^0.0.1"
  },
  "dsh": {
    "skills": ["../skills"],
    "mcpServers": "../.mcp.json"
  }
}
```

`dsh.skills` 是可选的本地 skill 根数组。`dsh.mcpServers` 是指向一个 `.mcp.json` 的可选路径；两者至少声明一个。路径相对于 `.dsh-plugin`，必须留在其父级源码目录下，因此可以引用 `../skills` 等仓库现有资源。一个仓库可以在不同的可选择子目录下放置多个各自独立的 `.dsh-plugin` 包。

## 独立应用配置

每个 profile 都以之为起点的随附 `dsh-base` 组合包包含一个空 `repository-plugins` 配置项。用户可在用户 patch 层中替换该配置项的配置来启用精确指定的 GitHub generation：写入 `$DSH_HOME/profiles/<name>/cordis.patch.yml`，或写入各 profile 共享的 home 级 `$DSH_HOME/cordis.patch.yml`；`--patch` overlay 则只为单次运行 patch 同一配置项：

```yaml
- id: repository-plugins
  name: '@deepseek-ai/dsh-repository-plugin'
  config:
    repositories:
      - 'github:PolyArch/humanize#<commit>'
      - 'github:owner/repository#<ref>&path:/plugins/one/.dsh-plugin'
```

每个源都必须采用 `github:owner/repository#<ref>`。省略 `&path:` 时选择 `/.dsh-plugin`；显式路径是仓库内的绝对路径，并且必须以 `.dsh-plugin` 结尾。commit ref 提供最清晰的不可变身份；tag 和 branch 仍可作为精确配置值使用。`cacheDir` 可覆盖默认缓存根 `$DSH_HOME/cache/repository-plugins`。

长期运行的 surface 通过 Cordis HMR（热模块替换）监视两个 `cordis.patch.yml` 层。有效的源列表变更会安装并替换整套 repository Plugin generation；拉取、准备、导入或插件应用失败时，最后一个可用树保持运行，并广播 `hmr/config-update-failed(filename, error)`。一次性运行只在启动时读取这些层，`--patch` overlay 则从不被监视。相同的源字符串会永久复用其已准备缓存条目，因此必须改变 ref、路径或其他源配置，才能选择发生变化的代码。应用集成依据见[仅凭配置接入 repository Plugin 的 Agent Note](../../../.agents/notes/implemented/feature/2026-07-30-config-only-repository-plugins.md)。

## 准备阶段

`dsh-plugin-prepare` 校验 `package.json#dsh`、确认 skill 根类型、解析 MCP 文件、把资源复制到 `dsh-plugin-assets`，并写入 `dsh-plugin.mjs`。包装模块只包含规范化后的静态 manifest（元数据清单），以及查找 `dsh-repository-plugin` Loader builtin 的固定代码；它不会发现或编译仓库 JavaScript，运行时也不会导入仓库的其他入口。

外层包管理器仍会运行已配置仓库包的生命周期脚本。这里的限制只定义 DSH 所支持的贡献表面；对于用户选择以可执行包管理器源安装的仓库，它并不是安全边界。

## 运行时组合

加载本包会注册一个 effect-scoped Loader builtin。每个生成的包装模块都把自身模块 URL 和已准备的 manifest 委托给该 builtin。运行时在挂载前会校验每个声明的 skill 根都是包内实际存在的目录——生成输出被丢弃的包（`files`／`.npmignore` 配置失误、缓存条目损坏）会使插件加载失败，而不是静默挂载一个没有 skill 的插件。Repository skill 根以唯一命名的 `dsh-skill-local` 提供方挂载，排除默认项目／用户根并禁用监视；缓存包 generation 是不可变的。包装模块 dispose（资源释放）时，会通过正常的 Cordis 子 fiber teardown 移除提供方和所有组合的 MCP client。

## 通用 MCP 格式

`.mcp.json` 根对象是 `{ "mcpServers": { ... } }`。stdio 条目只接受可选的 `type: "stdio"`、`command`、`args` 和 `env`；HTTP 条目只接受 `type: "http"`、`url` 和 `headers`。字符串值在插件加载时支持严格的 `${NAME}` 进程环境变量展开；缺失变量会使该次加载失败。HTTP URL 映射到现有 MCP client 的 `streamable-http` transport；stdio 条目以已准备的包目录作为 `cwd`。

未知字段会被拒绝，包括 OAuth 字段与 `auth` 对象。不提供 `CLAUDE_PLUGIN_ROOT` 展开或兼容层。完成格式转换后，现有 `dsh-mcp-client` 独占 transport 创建、连接诊断、工具同步、调用和断开生命周期；网络或子进程连接失败沿用该 client 既有的“记录错误且不注册工具”行为。

## 导出形状

Namespace 插件：具名导出 `name`／`inject`／`apply`、准备阶段常量和 `prepareDshPlugin`，不提供 default export。本包还提供 `dsh-plugin-prepare` 可执行文件和 invariant companion。

## 模型体验

### Repository skill

#### 模型看到什么

通过 `dsh-tool-skill` 间接呈现：已准备且允许模型调用的 skill 会按其声明的名称和描述进入该消费方记录到日志的目录及所选指令正文表面。消费方的确切 schema 见生成的 [`skill` 工具目录](../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill)。

#### Token 影响

有条件且随数据变化：每个可见的 repository skill 增加一行受限长度的目录项；加载一个 skill 会把其当前完整指令正文和资源基址指引加入保留的工具历史。

#### KV Cache 影响

稳定的已准备插件集合保持前缀稳定。添加、移除或替换 repository 插件可能使消费方追加替换目录，并影响后续请求前缀。

### Repository MCP 工具

#### 模型看到什么

通过 `dsh-mcp-client` 间接呈现：每个已连接 server 都贡献带 server 限定名的工具 schema；调用会保留该 client 的规范 MCP 结果和渲染。

#### Token 影响

取决于连接成功和远端工具列表；schema 会在当前工具视图中的请求上重复出现，而调用与结果会留在历史中直至压缩（compaction）。

#### KV Cache 影响

稳定的已连接工具列表保持前缀稳定。插件生命周期或 MCP 工具列表变化可能从首个受影响定义开始改变后续工具 schema 前缀。

## 已知限制与暂缓事项

- **仅支持 skill 与 MCP**：commands、钩子、agent（智能体）、apps、任意 Cordis 代码、marketplace 和兼容 shim 均有意排除在该格式之外。
- **没有 MCP 认证协议**：静态 header 可以使用环境变量展开，但带 OAuth 的定义会被拒绝，私有 server 登录流程不在此实现。
- **生成资源是不可变运行时输入**：repository cache generation 不受监视；必须改变 source、ref、path 或配置才能选择另一份已准备 generation。
