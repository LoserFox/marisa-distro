# Agent Note：静态 repository Plugin 格式

状态：已实现

[English](2026-07-30-static-repository-plugin-format.md) | 中文

## 问题

一个已经包含可复用 skills 或 MCP server 声明的仓库，应当能被独立 Harness 应用使用，而不必先变成 Harness SDK 项目，也不应被迫改写现有布局。常见仓库只需新增一个 `.dsh-plugin` 目录，同时仍可把原有 skills 与 `.mcp.json` 放在仓库其他位置。与此同时，如果把任意仓库入口都当作 Cordis Plugin，就会让每个仓库成为新的无限制运行时扩展表面，并绕过现有的 skill 与 MCP 生命周期所有者。

[Package-manager-native repository cache](2026-07-30-package-manager-native-repository-cache.md) 会准备一个精确 package source，但有意不了解任何 DSH 格式。因此本层需要一种兼容 package manager 的创作格式、确定性的已准备产物，以及在 Loader dispose 和替换期间仍保持事务性的 Cordis 组合。

## 决策

`@deepseek-ai/dsh-repository-plugin` 负责一个受限的 `.dsh-plugin` package 格式，且只允许两类贡献：skill 根和一个通用 `.mcp.json`。Package metadata 使用 `package.json#dsh.skills` 声明相对 skill 根路径，使用 `package.json#dsh.mcpServers` 声明相对 MCP 文档路径；两者至少需要一个。路径可以离开 `.dsh-plugin` 以复用仓库内容，但必须留在包含该 `.dsh-plugin` 的目录之下；因此，一个嵌套且可选择的 Plugin 可以拥有其 package 上方相邻的子树，却不能访问无关宿主路径。

`.dsh-plugin` package 把 `dsh-plugin-prepare` 声明为普通 package-manager `prepare` 脚本。Helper 会校验 metadata 与源码类型，严格解析 `.mcp.json`，把静态资源复制到 `dsh-plugin-assets`，并写入 `dsh-plugin.mjs`。`.mjs` 扩展名避免强迫仓库作者在 package metadata 中设置 `type: module`。生成模块来自固定、无 import 的模板，只包含规范化 manifest、由 manifest 派生的 `inject` 列表（`loader`，加上按声明能力加入的 `skills`／`tools`，使包装 fiber 在其子插件所需服务上门控），以及对 `dsh-repository-plugin` Loader builtin 的委托。准备阶段永远不会发现、转译、打包或保留自定义仓库入口。

加载 DSH package 会以 effect 方式注册该 builtin。生成的包装模块使用 `import.meta.url` 把 builtin 挂载为自己的子级，因此所有贡献都归属于包装 fiber，并在 Loader 移除或回滚时消失。Builtin 会在读取资源前重新校验已准备 manifest 与路径包含关系。它只组合现有实现，而不自行注册 skills 或 MCP 工具。

每份已准备 skill 集合都会挂载 `dsh-skill-local`，使用唯一的 `repository:<package-name>` 提供方名称、仅包含复制后的自定义根，并禁用监视。因此 `dsh-skill-local` 新增两个通用配置字段：`providerName` 和 `includeDefaultRoots`。默认值保持原有单一本地提供方行为；repository 实例设置不同名称并排除项目／用户根，使多个实例既不冲突，也不会重复宿主本地发现。

`.mcp.json` 中的每个 server 都变成一个现有 `dsh-mcp-client` 子级。适配层接受通用根对象 `{ "mcpServers": ... }`；stdio 定义只允许可选的 `type: "stdio"`、`command`、`args` 与 `env`，HTTP 定义只允许 `type: "http"`、`url` 与 `headers`。严格的 `${NAME}` 进程环境变量引用在运行时、cache 准备之后展开；缺失变量会使 Plugin 加载失败。HTTP 映射到 client 的 Streamable HTTP transport，stdio 使用已准备 package 目录作为 `cwd`。只有现有 client 负责连接尝试、失败日志、远端工具同步、工具调用和断开。因此 MCP 连接失败会继续沿用“Plugin 成功但不注册工具”的既有行为，不会被重新分类为 repository 准备或 Loader 失败。

未知 MCP 字段会被拒绝。这里有意排除 OAuth、`auth` 对象、`CLAUDE_PLUGIN_ROOT` 和更广泛的 Claude 兼容契约。Hooks、commands、agents、apps、任意 Cordis 代码、marketplace 和发现同样不受支持。Repository 子目录选择与 GitHub 源配置属于[独立应用集成](../feature/2026-07-30-config-only-repository-plugins.md)，而不是本格式 package。

## 考虑过的替代方案

**加载仓库自己的 Cordis 入口。** 拒绝，因为这会把宣传为静态的格式变成无限制代码加载 API，要求仓库作者依赖 Harness 内部实现，并重复普通 SDK／Plugin dependency 路径。

**让生成包装模块直接实现 skills 和 MCP。** 拒绝，因为复制的运行时代码会与 `dsh-skill-local` 和 `dsh-mcp-client` 漂移，尤其是提供方失效、工具同步、失败和 teardown 契约。

**让每个生成包装模块 import Harness package。** 拒绝，因为 repository package 不应解析或锁定应用的内部依赖图。Loader builtin 提供一份由 app 所有的实现，并让生成包装模块保持无 import。

**监视已准备 repository 资源。** 拒绝，因为一个精确 repository cache generation 是不可变的。Ref、子目录或配置变化会选择新 generation；第二套 watcher 会创造一套没有所有者的刷新身份。

**把 MCP 连接失败当作 Loader 更新失败。** 拒绝，因为现有 MCP client 有意收束连接失败并不暴露工具。只对 repository source 改变该语义，会让同一 server 配置拥有两套失败契约。

## 后果

- 现有 skill／MCP 仓库可以新增一个很小的 `.dsh-plugin/package.json`，无需移动资源或采用 SDK 项目。
- 已准备输出是确定性的静态胶水；已配置仓库及其依赖生命周期仍是受信任的可执行 package-manager 输入，而非 sandbox。
- 多个 repository Plugin 通过提供方名称和普通 MCP server-name 唯一性共存；重复名称经现有 registry 失败，并参与 Loader 回滚。
- Cache 内的源码编辑不会实时出现；必须选择另一个精确 source／ref／path／config。
- 新增贡献类型必须提供显式格式和 DSH 自有运行时消费方；它不能意外以 repository JavaScript 形式进入。

## 测试

聚焦测试会准备 skills 与 MCP metadata，证明生成包装模块不含 import，拒绝 Work IQ 风格的 OAuth 字段，映射 Expo 风格 HTTP 与 DataJunction 风格 stdio 及环境变量，并覆盖缺失变量。真实 Loader 测试通过已注册 builtin 挂载生成包装模块，经 `ctx.skills` 读取其 skill，移除 Loader 条目并观察提供方清理。Keyless headless 示例通过真实 `cordis.yml` 加载一份签入的已准备包装模块，并快照 repository skill 写入日志的模型目录行。
