# dsh-code-map

**DSH 代码地图插件**：给模型补上「地图型」语义查询——symbol 索引 / 文档符号 / 调用层级 / 继承树。

## 定位（Why）

DSH 核心 LSP 接缝（`ctx.lsp`）只暴露四个**定位型**操作（goToDefinition / findReferences / goToImplementation / hover）。模型干活时最高频的认知需求其实是**地图型**的：

- 这个文件里有哪些导出 / 函数 / 类？（documentSymbols）
- 这个函数被谁调用、又调用了谁？（callHierarchy incoming/outgoing）
- 这个接口有哪些实现、这个类有哪些子类？（typeHierarchy）

本插件在 LSP 之上提供这些查询，**零 SDK 依赖**（服务接口自声明，宿主运行时注入），随装随用。

## 状态

- **v0.0.1（2026-08-11）**：仓库 + 官方 repository-plugin 骨架 + `code_map` 工具（`document_symbols`：文档符号树，含嵌套层级）。
- **v1（2026-08-11 完成）**：`call_hierarchy`（incoming/outgoing 调用链，LSP 3.17）+ `type_hierarchy`（继承/实现树）。两者都经真实 typescript-language-server / tsc 冒烟验证。
- **v2**：项目级符号图——跨文件引用聚合、符号搜索（库地图）。

> **type_hierarchy 实现说明**：typescript-language-server（及 tsserver 本身）不实现 LSP 3.17 type-hierarchy 请求（长期缺口，TS#8268），故该操作不走 LSP，而是用插件自带的 `typescript` 编译器 API 静态分析继承/实现边（supertypes 读 heritage clauses，subtypes 跨文件扫描，含 mtime 指纹的 program 缓存）。`document_symbols` / `call_hierarchy` 仍走 LSP。

## 安装（官方 0811 bundle 格式）

```sh
# 本地开发（link）
dsh plugin --profile web add .

# 云端仓（git 源码；需 prepare + allowBuilds 授权）
dsh plugin --profile web add github:dsh-external/dsh-code-map

# npm 私有 registry（预构建）
dsh plugin --profile web add @dsh-external/dsh-code-map
```

包根声明 `dsh.bundle`（`cordis.patch.yml`），安装后自动纳入 `dsh.profile.bundles` 层栈。装完在新会话中模型自动获得 `code_map` 工具：

```
code_map operation=document_symbols file_path=<相对 workspace 或绝对路径>
code_map operation=call_hierarchy file_path=<path> line=<1-based>
code_map operation=type_hierarchy file_path=<path> line=<1-based>
```

## 开发

```sh
pnpm install            # workspace: 包根 + dev-packages
pnpm build              # tsc → lib/
dsh plugin --profile web add .   # 本地安装
```

## 架构

```
src/
  index.ts       # cordis 插件 entry（name/inject/apply），注册 code_map 工具
  lsp-client.ts  # 最小 LSP 客户端：Content-Length framing + JSON-RPC + 进程池（document_symbols / call_hierarchy）
  ts-hierarchy.ts # TS 编译器 API 类型层次分析器（type_hierarchy，含 program 缓存）
  tools.ts       # 工具定义与结果渲染
```

- 语言服务器按 workspace **常驻池化**（首次查询 spawn，复用进程，插件卸载时全杀）。
- 每次查询瞬态打开文档（didOpen → 查询 → didClose），内容永远是新的，无索引过期问题。
- 默认 typescript 服务器自动探测（`typescript-language-server` + `typescript` 随插件安装）；`config.servers` 可覆盖或扩展其他语言。

## License

BSD-3-Clause
