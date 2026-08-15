# dsh-paste-input

**简体中文** | [English](./README.en.md)

DSH WebUI 文件输入增强插件：**Ctrl+V 粘贴** + **全页面拖拽** + **选择文件/文件夹**，发送时复制进会话工作区临时附件目录，并把对话气泡里的附件文本块**折叠为文件 chip**。

派生自 [dsh-external/dsh-multimedia-webui-input](https://github.com/dsh-external/dsh-multimedia-webui-input)（MIT），在其基础上新增剪贴板粘贴输入、首次告知弹窗与气泡附件折叠。

## 版本兼容 / Version compatibility

兼容 DSH snapshot0808（`snapshots/20260808T121140Z`）、snapshot0809（`snapshots/20260809T140917Z`）、snapshot0810（`snapshots/20260810T155924Z`）、snapshot0811（`snapshots/20260811T152241Z`）与最终快照 snapshot0812（`snapshots/20260812T172954Z-final`）：注册的槽位（`conversation.input.left` / `conversation.input.dock` / `settings.section`）在 0808~0812 上均保持声明；依赖服务在 0812 经历官方更名——`slash` → `inputTriggers`（client 侧，随包名 `@deepseek-ai/dsh-client-ui-slash` → `@deepseek-ai/dsh-client-ui-input-trigger` 一并迁移）、host 侧 `httpServer` → `webServer`，本插件 v0.1.3 已同步迁移（lib 两半 + `dsh.client` 元数据，见下）。0809 实机验证——粘贴 → 复制进工作区附件目录 → 气泡折叠 chip 全链路可用；0811 与 0812 最终快照实机 boot 验证通过（见下）。

**npm 发版兼容**：兼容 DSH npm 发版 `@deepseek-ai/dsh@0.0.1-rc.5`（dist-tag `next`，即最终快照 snapshot0812 的 npm 发版；`npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` 可访问指定版本并启动，lib 生产模式），同时保持兼容 `@deepseek-ai/dsh@0.0.1-rc.2`（snapshot0811 的 npm 发版）。实测（npm rc.5 基线）：`dsh web` 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-community/dsh-paste-input`（inject: `dsh-client-runtime`/`dsh-client-ui-input-trigger`/`dsh-client-ui-conversation`/`dsh-client-ui-settings`），`/plugins/@dsh-community/dsh-paste-input/client.js` 返回 200；client 半经 `window.__ModuleLoader__.load` 正确注册，host 半的 `webServer` 上传路由在 rc.5 consumer 中加载成功。本插件**无任何 cordis 依赖**（无 peerDependencies；lib 构建产物无 cordis 导入）——0811 的 cordis 更名（`cordis` → `@deepseek-ai/cordis`）与本插件零影响，`npm install` 无需额外参数。

### 0809 兼容要点（实机验证）

- **加载机制变化**：0809 重构了客户端插件机制——旧的 `dsh.plugin.json` 清单 + `resolveClientPath`（`packages/plugin/plugin`）已删除，改为 **package.json 的 `dshClient` 声明**（`platform: 'web'`，可选 `inject`/`immediately`）+ `exports["./client"]` 指向构建产物；宿主扫描 loader 条目组成 boot 图，Web 端从 `/plugins/<id>/client.js` 拉取。本插件 package.json 已满足该声明，无需改动。
- 附件消息协议（`==== DSH_PASTE_INPUT_V1 ====` 标记）与 `.dsh/tmp/attachments/<session>/<send>/` 目录逻辑不依赖快照内部实现，0809 实测全链路成功。
- **构建要求**：0809 宿主在激活时校验 `dshClient` 包的构建产物，缺失会抛 `ClientPackageCompositionError` 并**拒绝启动 `dsh web`**——升级快照或改源码后必须重新 `pnpm run build` 再启动，否则浏览器拉到的是旧 `lib/client.js`。

### 0810 兼容要点（snapshot0810）

- **元数据发现变化**：0810 的 ClientModuleHostService 在启动时扫描已加载插件的 package.json，但只读**嵌套 `dsh.client`**（`packages/client/modules/src/index.ts` 的 `resolveMeta`，`pkg.dsh.client`）；顶层 `dshClient` 字段读不到会静默丢出 boot 图——无日志、无报错，"启动顺利但插件全没"。本插件已从顶层 `dshClient` 迁移为嵌套 `dsh.client`（inject 原样保留）；`lib/client.js` 构建产物不变（package.json 不参与编译），symlink 安装改源仓库即生效，无需重装。

### 0811 兼容要点（snapshot0811，实机验证）

- **cordis 更名对本插件零影响**：0811 将 vendored cordis 由 `cordis@4.0.0-rc.7` 更名为 `@deepseek-ai/cordis@4.0.1-rc.1`（官方 client 包随之全部改从 `@deepseek-ai/cordis` 导入）。本插件不导入 cordis（无 peerDependencies、lib 构建产物无 cordis 引用），无需任何迁移。
- **实机 boot 验证**：snapshot0811（`snapshots/20260811T152241Z`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-community/dsh-paste-input`（inject: `dsh-client-runtime`/`dsh-client-ui-slash`/`dsh-client-ui-conversation`/`dsh-client-ui-settings`），`/plugins/@dsh-community/dsh-paste-input/client.js` 返回 200。本插件使用的槽位 `conversation.input.left`/`conversation.input.dock`（`ui-conversation` 声明）与 `settings.section`（`ui-settings` 声明）在 0811 上保持声明；`slash` 服务与 `window.__ModuleLoader__` 加载协议不变。

### 0812/最终快照 兼容要点（snapshots/20260812T172954Z-final，实机验证）

- **client 服务更名：`slash` → `inputTriggers`**：最终快照将输入触发服务由 `slash` 更名为 `inputTriggers`（随官方包 `@deepseek-ai/dsh-client-ui-slash` → `@deepseek-ai/dsh-client-ui-input-trigger` 一并改名，服务与 `registerSource` API 本身不变）。本插件 `lib/client.js` 已同步迁移 4 处（两个 inject 数组 + `ctx.get` + `registerSource` 调用），`dsh.client` 元数据的 inject 列表同步由 `dsh-client-ui-slash` 迁移为 `dsh-client-ui-input-trigger`。
- **host 服务更名：`httpServer` → `webServer`**：最终快照将 host 侧 HTTP 路由注册服务由 `httpServer` 更名为 `webServer`（`packages/host/webserver` 提供，`register({ kind: 'prefix', path, handler })` API 不变）。本插件 `lib/index.js` 已同步迁移 2 处（inject 数组 + `ctx.webServer.register` 调用），上传路由照常注册。
- **cordis 更名与本插件零影响**：与 0811 相同，本插件不导入 cordis（无 peerDependencies、lib 构建产物无 cordis 引用），`cordis` → `@deepseek-ai/cordis` 更名（npm rc.5 基线上为 `4.0.1-rc.4`）零影响，`npm install` 无需额外参数。
- **实机 boot 验证**：最终快照（`snapshots/20260812T172954Z-final`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-community/dsh-paste-input`；npm rc.5 consumer `dsh web` 启动后 boot 清单同样包含本插件（inject 已显示 `dsh-client-ui-input-trigger`），`/plugins/@dsh-community/dsh-paste-input/client.js` 返回 200，host 半 `webServer` 上传路由加载成功。本插件使用的槽位 `conversation.input.left`/`conversation.input.dock`（`ui-conversation` 声明）与 `settings.section`（`ui-settings` 声明）在最终快照与 rc.5 上保持声明；`inputTriggers` 服务与 `window.__ModuleLoader__` 加载协议不变。

## 更新记录 / Changelog

### 2026-08-13 · v0.1.3 — 最终快照服务改名迁移（snapshot0812 + npm rc.5）

- **迁移（client）**：`slash` → `inputTriggers`（lib/client.js 4 处：inject 数组 ×2 + `ctx.get` + `registerSource` 调用），`dsh.client` 元数据 inject 由 `@deepseek-ai/dsh-client-ui-slash` 迁移为 `@deepseek-ai/dsh-client-ui-input-trigger`——最终快照将输入触发服务与官方包一并更名，服务与 `registerSource` API 不变
- **迁移（host）**：`httpServer` → `webServer`（lib/index.js 2 处：inject 数组 + `ctx.webServer.register` 调用）——最终快照将 host 侧 HTTP 路由服务更名，`register({ kind: 'prefix', path, handler })` API 不变
- **验证**：DSH 最终快照（`snapshots/20260812T172954Z-final`）与 npm rc.5（`@deepseek-ai/dsh@0.0.1-rc.5`）consumer 实机 boot 验证通过（boot 清单包含本插件、client.js 返回 200、webServer 上传路由加载成功）

### 2026-08-11 · v0.1.2 — 客户端插件元数据迁移（snapshot0810）

- **迁移**：package.json 从顶层 `dshClient` 声明迁移为嵌套 `dsh.client`（inject 原样保留）——0810 的 ClientModuleHostService 只读 `pkg.dsh.client`，旧字段会被静默忽略导致插件不进 boot 图
- **验证**：DSH snapshot0810 实机验证通过（粘贴 → 复制进附件目录 → 气泡折叠 chip 全链路）

### 2026-08-10 · v0.1.1 — 修复气泡折叠 chip 显示位置错乱

- **修复**：发送时若 chip 前后都有输入文字（尤其是多文件发送），折叠后的文件 chip 位置错乱——此前所有用户文字被合并为一个文本块堆在顶部，第一个 chip 因 flex 布局悬浮在首行文字右侧，其余 chip 散落在文本块下方；现按源顺序穿插渲染（文字 → chip → 文字 → chip…），文字段独占一行，相邻附件块的 chip 自动并排
- **修复**：折叠区文字与 chip 对齐气泡内部 16px 文字缩进（去掉此前多余的横向内缩与底部空隙）
- **验证**：DSH snapshot0809 实机验证通过

## 能力

- **Ctrl+V 粘贴**：粘贴截图/复制的图片/文件 → 作为附件加入输入框（首次粘贴弹出告知弹窗，可勾选"不再提示"，选择持久化在浏览器 localStorage）
- **全页面拖拽**：文件/文件夹拖到页面任意位置（聊天区、空白处、输入框）即加入附件；文本/链接拖拽保持浏览器默认行为
- **选择**：输入框左侧回形针按钮 → 选择文件 / 选择文件夹
- **气泡折叠**：发送后，消息气泡里冗长的附件路径文本块（含 `==== DSH_PASTE_INPUT_V1 ====` 标记协议）自动折叠为 📎 文件 chip；你在 chip 前后输入的文字按原顺序穿插保留（多文件发送时文字与各文件的 chip 逐段交错，chip 独占一行），悬停 chip 显示完整原始附件块（路径/清单/文件列表），点击 chip 复制完整路径
- 发送时文件复制到 `<会话工作区>/.dsh/tmp/attachments/<session>/<send>/`，绝对路径随消息前置给模型，无权限问题
- 设置面板：附件用量统计与按会话/工作区清理（所有权标记保护，二次确认）

## 与 dsh-vision 协作：截图识别

配合 [dsh-external/dsh-vision](https://github.com/dsh-external/dsh-vision) 插件（注册 `view_image` 工具，桥接任意 OpenAI 兼容 VLM，默认智谱免费 `glm-4.6v-flash`），本插件的粘贴/拖拽截图可以**直接识别**：

1. 截图（Win+Shift+S）→ 粘贴或拖入 DSH
2. 发送后截图复制进工作区附件目录
3. 模型看到附件路径 → 调用 `view_image` → VLM 返回图片内容（OCR 提取文字、读图表、识别 UI 布局等）

两个插件零耦合：本插件负责"文件进对话"，dsh-vision 负责"看图"，通过工作区附件路径衔接。

## 附件消息协议

附件块以显式标记界定（模型可见文本，气泡折叠识别用）：

```
==== DSH_PASTE_INPUT_V1 ====
<附件根目录绝对路径>

Files: N
Manifest: .dsh-paste-input.json
Attached files (paths are relative to the root above):
- "file.txt" (2.0 KiB)
==== END DSH_PASTE_INPUT ====
```

仅支持标记格式（历史无标记消息不折叠）。标记前后各带空行，保证用户输入的文字与标记不在同一行。

## 限制

- 粘贴的文件支持因浏览器而异：**Chrome/Edge** 在 paste 事件中只提供图片（截图、复制的图片）等媒体与文本/HTML，从文件管理器"复制文件"后粘贴不会出现文件项；**Firefox** 支持粘贴文件，但同样**不提供绝对路径**。浏览器出于安全不会把本地文件路径暴露给网页，因此粘贴均以 `文件名` 作为相对路径存储——需要原路径的场景请使用**拖拽**或**选择文件/文件夹**按钮
- 单文件 ≤ 1 GiB、单次 ≤ 2 GiB、≤ 10000 文件、≤ 64 层

## 安装（profile 模式）

```sh
dsh plugin --profile web add link:E:\deepseek-harness\dsh-paste-input
# 并在 ~/.dsh/profiles/web/cordis.patch.yml 追加：
# - insert:
#     - id: dsh-paste-input
#       name: '@dsh-community/dsh-paste-input'
```

重启 `dsh web` 生效。

## License

MIT（含 dsh-multimedia-webui-input 派生声明）
