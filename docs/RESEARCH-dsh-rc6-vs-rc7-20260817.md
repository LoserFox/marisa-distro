# DSH `0.1.0-rc.6` vs `0.1.0-rc.7`（master / npm next）

> 研究日期：2026-08-17  
> 上游仓库：[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)  
> 方法：`git ls-remote`、浅克隆后的 commit / tag / `git show` / `git diff`、npm registry 元数据。没有使用博客或二手解读。  
> 本地对照：`maintenance/upstreams.json` 把 vendored `harness/` 标成 `baseline: 4e7fb95f`、`dshVersion: 0.1.0-rc.6`。

## 结论

公开 Git 上**没有 `main`，也没有 `next` 分支**。默认分支是 `master`；`next` 只是 npm dist-tag。`0.1.0-rc.7` 就是今天的 `origin/master` HEAD，并打了唯一公开 tag `dsh-v0.1.0-rc.7`。`0.1.0-rc.6` 在同一条 `master` 历史上，但是 **merge commit，没有对应 git tag**。

rc6 → rc7 不是大重构。CLI 入口、`dsh web` 参数和 `webServer` 服务名都没变。对下游 fork 真正要紧的是：

1. **插件设置页契约换了**：`settings.plugin.item` 从 `list` + `id`/`order` 变成按 settings namespace 的 `keyed` slot；Host 不再用白名单拦截未列出的 namespace，并删掉 RPC 错误 `settings-not-exposed`。
2. **ACP / MCP / code-mode 开始正经传图**：ACP prompt 与助手输出可带 image；MCP 工具结果可把 image 投影进模型上下文；attachment 增加批量 `saveImages` 和类型化 admission 错误码。
3. **DeepSeek `reasoningEffort` 增加 `low`**；LLM replay 元数据从 `unknown` 收成 `ReplayEnvelope`，max-token 截断时会同步丢掉不能安全执行的 tool-call。
4. **产品 subagent 预设**把 `enableRunInBackground: false` 改成 `backgroundMode: one-shot`。
5. **持久 bash** 不再改写 `PS1`；**node-pty** 从 `^1.1.0` 钉到 `1.2.0-beta.15`（桌面原生重建会碰到）。

另外：Marisa 账本里的 `4e7fb95f` **不在公开 GitHub 历史里**。它是本机 `C:\Users\lf\deepseek-harness` 上的私有对象 `4e7fb95fa7565857b7f95e63202f3e7b848bb730`，subject 为 `Private DSH snapshot 20260808T121140Z`（2026-08-08 12:11 UTC）。本地 `harness/package.json` 仍是 `0.0.1`，包目录也还是旧布局。把这份快照叫做 rc6，指的是兼容目标，不是公开 `fb826987` / npm `0.1.0-rc.6` 那棵树。升到 rc7 之前，先要认清本地基线落后的是**整段公开 rc6 发布面**，而不只是 rc6→rc7 这 4 天。

## 精确 refs

| 对象 | 值 | 来源 |
|---|---|---|
| 远程默认分支 | `master`（`HEAD` = `refs/heads/master`） | `git ls-remote https://github.com/deepseek-ai/deepseek-harness.git` |
| `main` 分支 | 不存在 | 同上，远程只有 `refs/heads/master` |
| `next` git 分支 | 不存在 | 同上 |
| 公开 tags | 只有 `dsh-v0.1.0-rc.7` | `git ls-remote --tags`；克隆后 `git tag -l` |
| rc7 commit / tag | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | lightweight tag 指向 PR [#2620](https://github.com/deepseek-ai/deepseek-harness/commit/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca) |
| rc7 bump | `bb4ca698d63714e753f5621b07400e6ebb0b5d97` `release(dsh): 0.1.0-rc.7` | `git show bb4ca698d`，2026-08-17 18:26 +0800 |
| rc6 merge | `fb82698709c39f1860b0ab0ed147e1fa30c1d5d0` | PR [#2531](https://github.com/deepseek-ai/deepseek-harness/commit/fb82698709c39f1860b0ab0ed147e1fa30c1d5d0) `release: dsh@0.1.0-rc.6`，2026-08-13 19:56 +0800 |
| rc6 bump | `15148dbd9a1d1f1ef1a26e5749b32af0cd663935` `release(dsh): 0.1.0-rc.6` | `git show 15148dbd9`，2026-08-13 19:52 +0800 |
| rc6 git tag | **没有** | `git tag -l '*rc.6*'` 为空 |
| 祖先关系 | `fb826987` 是 `99f6f02fe` 的祖先 | `git merge-base --is-ancestor` 退出码 0 |
| 仓库根版本 rc6 | `"version": "0.1.0-rc.6"` | `git show fb8269870:package.json` |
| 仓库根版本 rc7 | `"version": "0.1.0-rc.7"` | `git show 99f6f02fe:package.json` |
| CLI 包 rc6 | `@deepseek-ai/dsh@0.1.0-rc.6` | `git show fb8269870:apps/cli/package.json` |
| CLI 包 rc7 | `@deepseek-ai/dsh@0.1.0-rc.7` | `git show 99f6f02fe:apps/cli/package.json` |
| Node 基线 | 两边都是 `^22.19.0 \|\| >=24.0.0`，`pnpm@11.7.0` | 同上两个 `package.json` 的 `engines` / `packageManager` |
| 上游 CHANGELOG | 仓库里没有产品 CHANGELOG | `git ls-tree -r --name-only 99f6f02fe` 只有 release 脚本，没有 `CHANGELOG*` |
| Marisa pin | `4e7fb95fa7565857b7f95e63202f3e7b848bb730` | `git -C C:\Users\lf\deepseek-harness log -1 4e7fb95f`：`Private DSH snapshot 20260808T121140Z` |

## npm：`next` 是 dist-tag，不是分支

[`https://registry.npmjs.org/@deepseek-ai/dsh`](https://registry.npmjs.org/@deepseek-ai/dsh)（2026-08-17 读取）：

| 字段 | `0.1.0-rc.6` | `0.1.0-rc.7` |
|---|---|---|
| `time` | `2026-08-13T12:35:03.000Z` | `2026-08-17T11:50:59.000Z` |
| tarball | [`dsh-0.1.0-rc.6.tgz`](https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.6.tgz) | [`dsh-0.1.0-rc.7.tgz`](https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.7.tgz) |
| integrity | `sha512-brpZfED7ieRa2PQ5tUxMhHrM1pb2CmKFVM/f6yMULBDMicahk+Z2OsHgTwTDnoiZm23Ftu9rQz0NN4pflaoJcg==` | `sha512-ZceDCJ8FAywih+USW/OMk9jEhunlvJBGEz4kqrhau23hPzbciOazZrywH0nBRsaalSeAJ1JGBmjtw4OSjToStw==` |
| `bin.dsh` | `lib/bin.js` | `lib/bin.js` |
| 依赖名集合 | 相同 61 个包 | 相同 61 个包，版本约束从 `^0.1.0-rc.6` 改成 `^0.1.0-rc.7` |
| `gitHead` | 空 | 空 |
| `repository` | `apps/cli` | `apps/cli` |

`@deepseek-ai/dsh` 的 dist-tags：

- `latest = 0.1.0-rc.7`
- `next = 0.1.0-rc.7`

抽样的内部包同时发布了 `0.1.0-rc.6` 和 `0.1.0-rc.7`，但 **`latest` 并不整齐**：

| 包 | `latest` | `next` | rc6 发布时间 | rc7 发布时间 |
|---|---|---|---|---|
| `@deepseek-ai/dsh` | `0.1.0-rc.7` | `0.1.0-rc.7` | 2026-08-13 12:35:03 | 2026-08-17 11:50:59 |
| `@deepseek-ai/dsh-base` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:22:13 | 2026-08-17 11:45:35 |
| `@deepseek-ai/dsh-web-app` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:34:55 | 2026-08-17 11:50:54 |
| `@deepseek-ai/dsh-client-web` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:34:37 | 2026-08-17 11:50:43 |
| `@deepseek-ai/dsh-client-ui-settings-plugins` | `0.0.1-rc.3` | `0.1.0-rc.7` | 2026-08-13 12:30:41 | 2026-08-17 11:49:48 |
| `@deepseek-ai/dsh-host-apiproxy` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:27:12 | 2026-08-17 11:38:53 |
| `@deepseek-ai/dsh-llm` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:14:12 | 2026-08-17 11:34:52 |
| `@deepseek-ai/dsh-llm-deepseek` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:14:21 | 2026-08-17 11:40:51 |
| `@deepseek-ai/dsh-attachment` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:25:33 | 2026-08-17 11:34:43 |
| `@deepseek-ai/dsh-acp` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:35:12 | 2026-08-17 11:51:04 |
| `@deepseek-ai/dsh-mcp-client` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:23:30 | 2026-08-17 11:47:34 |
| `@deepseek-ai/dsh-tool-subagent` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:20:11 | 2026-08-17 11:44:42 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `0.0.1-rc.1` | `0.1.0-rc.7` | 2026-08-13 12:24:57 | 2026-08-17 11:48:21 |

所以口语里的 “next 分支 rc7” 实际是：**npm `next` 通道上的 `0.1.0-rc.7` 家族 = 公开 `master` HEAD**。只有顶层 CLI 包把 `latest` 也推到了 rc7；多数库包的 `latest` 仍停在 `0.0.1-rc.*`。下游不能假设 `npm i @deepseek-ai/dsh-*@latest` 会拿到整齐的 rc6 或 rc7 面。

已发布版本序列（`@deepseek-ai/dsh` 的 `time` 字段）：`0.0.1-rc.1`（08-10）→ `0.0.1-rc.2` → `0.0.1-rc.5` → `0.1.0-rc.2` → `0.1.0-rc.3` → `0.1.0-rc.6`（08-13）→ `0.1.0-rc.7`（08-17）。没有 `0.1.0-rc.4` / `0.1.0-rc.5` npm 版本。

## 提交范围

公开仓**不是**“只有 rc7 一个快照”。`git rev-list fb8269870..99f6f02fe`：

- 全部提交：106
- `--first-parent`：22（21 个功能/修复 PR + 1 个 release merge）
- `--no-merges`：67

First-parent 时间线（全部在 `master` 上，日期为 committer +0800）：

| 日期 | SHA | PR | 主题 |
|---|---|---|---|
| 2026-08-13 | `c6f3414e9` | [#2537](https://github.com/deepseek-ai/deepseek-harness/commit/c6f3414e9d0f06cb1fc5a1920eb0d50bf68f12ce) | 公开文档引用 / Pages |
| 2026-08-14 | `f322d5cb0` | [#2527](https://github.com/deepseek-ai/deepseek-harness/commit/f322d5cb0d0a1e8b89969e78f20b009768ace565) | Cordis 面板样式 |
| 2026-08-14 | `39ada2e76` | [#2549](https://github.com/deepseek-ai/deepseek-harness/commit/39ada2e76306744fa33b85100b4ea248525165c8) | DeepSeek `reasoningEffort: low` |
| 2026-08-14 | `21d2433d9` | [#2374](https://github.com/deepseek-ai/deepseek-harness/commit/21d2433d973a8a5e57e13307c92160805a4f1578) | 产品 subagent 的 one-shot background |
| 2026-08-14 | `887c4977d` | [#2546](https://github.com/deepseek-ai/deepseek-harness/commit/887c4977dbfcfa5583749fc7213c87f3488468e4) | npm 发布依赖顺序 |
| 2026-08-15 | `6c18b04a6` / `5bb600f9f` | [#2571](https://github.com/deepseek-ai/deepseek-harness/commit/6c18b04a6bfe20b4a43d1c94b80cc8f532b6dfde) / [#2577](https://github.com/deepseek-ai/deepseek-harness/commit/5bb600f9fb17c31f26089ada6c25eaf900104e71) | 缩客户端安装面，当天回滚，净效果为零 |
| 2026-08-17 | `66cd593bf` | [#2559](https://github.com/deepseek-ai/deepseek-harness/commit/66cd593bf3eb80c2512d19cacd431704acbe3991) | 英文 Code preset 文案改为 PTC mode |
| 2026-08-17 | `c5759d350` | [#2553](https://github.com/deepseek-ai/deepseek-harness/commit/c5759d3506bf3661e32897b96b88aaca946573fd) | Web UI 指南润色 |
| 2026-08-17 | `7841e0a93` | [#2586](https://github.com/deepseek-ai/deepseek-harness/commit/7841e0a93eb118363d38ac6356ab565fdda8d4c8) | 最小模式 / 持久 bash 就绪检测 |
| 2026-08-17 | `b3eaafe3a` | [#2535](https://github.com/deepseek-ai/deepseek-harness/commit/b3eaafe3ae03d58196028d60b07d2255fe5de535) | Cordis turn-end 诊断测试 |
| 2026-08-17 | `cb8756b83` | [#1371](https://github.com/deepseek-ai/deepseek-harness/commit/cb8756b838e03832bdbf2a688053176b8c3eb999) | 大历史分页避免 `Math.min(...sources)` |
| 2026-08-17 | `fc497af8f` | [#2417](https://github.com/deepseek-ai/deepseek-harness/commit/fc497af8f72942903ea0288aa7f33884c39fa6ca) | pwsh terminal overlay fixture |
| 2026-08-17 | `ed5a10b6e` | [#2494](https://github.com/deepseek-ai/deepseek-harness/commit/ed5a10b6e1eb2c69c1defc28f1a9ccc24b5a72b3) | 提高 Windows CI timeout |
| 2026-08-17 | `84257ea5d` | [#2596](https://github.com/deepseek-ai/deepseek-harness/commit/84257ea5de4469e6c9231c73a0ae30464f6a2a8c) | max-token 与 replay 元数据对齐 |
| 2026-08-17 | `8f998186a` | [#2404](https://github.com/deepseek-ai/deepseek-harness/commit/8f998186a9a1269a2faaf75c7f9e18e611e3c6af) | 插件自有设置页 |
| 2026-08-17 | `fec00fcb2` | [#2504](https://github.com/deepseek-ai/deepseek-harness/commit/fec00fcb2ca87113857a2ec4a1546027e6527b13) | Safari textarea 软换行收缩 |
| 2026-08-17 | `e0bb7cafc` | [#2308](https://github.com/deepseek-ai/deepseek-harness/commit/e0bb7cafc053df3fc1f114e10f3815d4140fd34d) | 问用户卡片可折叠 |
| 2026-08-17 | `a9ce05a04` | [#2462](https://github.com/deepseek-ai/deepseek-harness/commit/a9ce05a04c798363746393c5a9f8b8ea2dc7f1a8) | Python SDK model-visible 断言 |
| 2026-08-17 | `cc68bbf38` | [#2517](https://github.com/deepseek-ai/deepseek-harness/commit/cc68bbf382a52d25fdd87ae029fe1c4ad20aecda) | `node-pty@1.2.0-beta.15` |
| 2026-08-17 | `8822d6744` | [#2252](https://github.com/deepseek-ai/deepseek-harness/commit/8822d6744fb1289d85c2e067be9de068bf485860) | ACP/MCP/code-mode 富内容 / 图片桥 |
| 2026-08-17 | `99f6f02fe` | [#2620](https://github.com/deepseek-ai/deepseek-harness/commit/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca) | 发布 `0.1.0-rc.7`（全家族 `package.json` 版本号） |

新增源码文件（相对 rc6 merge，不含 `.agents` / i18n 镜像）：

- `docs/cookbook/adding-a-settings-card.md`（及 `.zh.md`）
- `packages/acp/acp/src/content.ts`
- `packages/client/ui-settings-plugins/src/client/tab-store.ts`
- `packages/client/ui-conversation/src/client/skeleton/safari.ts`
- `packages/client/ui-primitives/src/useDismissOnOutsidePointer.ts`
- 若干 ACP / attachment 测试与 Python SDK pty 构建脚本

`git diff --diff-filter=D` 在 `*.ts` / `*.tsx` / `*.yml` 上没有产品源码删除。`#2571` 改过一批 client `package.json`，`#2577` 全部撤回。

## 对下游 fork 有意义的产品变化

### 1. 插件设置页：list slot → keyed-by-namespace（破坏性）

PR [#2404](https://github.com/deepseek-ai/deepseek-harness/commit/8f998186a9a1269a2faaf75c7f9e18e611e3c6af)。

`packages/client/ui-settings-plugins/src/client/slot-contract.ts` 把 slot 从

```ts
'settings.plugin.item': { kind: 'list'; scope: 'root'; ... }
```

改成

```ts
'settings.plugin.item': { kind: 'keyed'; scope: 'root'; ... }
```

注册选项从必填 `id` + 可选 `order`/`label` 变成必填 `key`（就是 Host 上的 settings namespace）。内置卡从 `id: 'bash' | 'agent-loop' | 'web-search'` 改成 `key: SHELL_NS | AGENT_LOOP_NS | WEB_SEARCH_NS`。`cordis-client-runner` 的 slot catalog 示例同步改成 `key: '<one key the owner dispatches>'`。

Host 侧 `packages/host/apiproxy/src/api-proxy.ts` 删除了：

- 常量 `WEB_SETTINGS_NAMESPACES`（原先写死 `agent-loop`、`shell`、`locale`、`permission`、`ui-conversation`、`ui-theme`、`web-search-deepseek`）
- 常量 `PRODUCT_SETTINGS_NAMESPACES`
- `exposedNamespaces()` / `notExposed()`
- RPC 错误码 `settings-not-exposed`（`rpc.ts` + `rpc.schema.ts`）

`settings.describe` 现在返回 seam 上**全部**已注册 namespace。rc6 注释写明：给插件配置页加一张卡必须改 apiproxy；rc7 cookbook [`docs/cookbook/adding-a-settings-card.md`](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/docs/cookbook/adding-a-settings-card.md) 则说外部插件只要 Host `installSettingsSection` + 浏览器 `settings.plugin.item` 用同一个 namespace key，不必改仓库。

**Marisa 含义**：任何还按 `id`/`order` 往 `settings.plugin.item` 注册的插件，在 rc7 client 上会对不上 keyed dispatch。反过来，rc7 之后插件终于可以不改 Harness 就出现在设置页。同步时要重审 MyGO 设置面、以及所有自绘 settings 卡。

### 2. ACP / MCP / attachment 富内容（行为扩展，协议面变宽）

PR [#2252](https://github.com/deepseek-ai/deepseek-harness/commit/8822d6744fb1289d85c2e067be9de068bf485860)。

- 新文件 `packages/acp/acp/src/content.ts`：ACP image block 只收 `image/png|jpeg|webp|gif` 和 canonical base64；当前模型必须声明 `inputModalities` 含 `image`，否则 `AcpContentError`。
- `packages/acp/acp/src/index.ts` 模块注释从 “prompt text” 改成 “prompt text/images … assistant text/images”；prompt 结算改成 admission + agent idle + 有序 output 之后才 settle。
- `packages/mcp/mcp-client/src/tools.ts`：MCP 结果若含 image，先 decode / 预检 / 写入 attachment，再投影成模型 `ContentBlock`；失败时给文本诊断，原始字节仍留给编程调用方。
- `packages/attachment/attachment/src/error.ts`：`AttachmentError.code` 从 `string` 收成联合类型；新增 `isImageAdmissionError()` 与 `saveImages()` 批量入口（先数/字节/类型校验，再逐张 `saveImage`）。
- `packages/core/tools/src/code-mode.ts`：子工具结果若带 image，run 结束后 `deferContext` 一条 user message。`packages/fs/tool-fs/src/read-image.ts` 删掉了 parent 路径上自己 `deferContext` 的旧逻辑。

**Marisa 含义**：视觉/附件插件、ACP 桥、MCP 图结果的时序会变。`docs/upstream-diff.md` 里因 rc6 API 停用的 `multimedia-webui-input` 等需要对照这套 admission API 再测，而不是假设 rc7 只是版本号。

### 3. DeepSeek `low` effort（加法，配置联合变宽）

PR [#2549](https://github.com/deepseek-ai/deepseek-harness/commit/39ada2e76306744fa33b85100b4ea248525165c8)。

`packages/llm/llm-deepseek/src/index.ts` / `types.ts` / `serialize.ts` / `adapter.ts`：

- `reasoningEffort?: 'off' | 'high' | 'max'` → `'off' | 'low' | 'high' | 'max'`
- wire 字段 `reasoning_effort` 现允许 `'low' | 'high' | 'max'`
- 目录里的 efforts 增加 `{ id: 'low', name: 'Low' }`
- `docs/config-catalog.md` 同步

穷举该联合的配置 UI / 校验代码会漏掉 `low`。默认仍是 `high`。

### 4. ReplayEnvelope 与 max-token 一致性（host/LLM 契约）

PR [#2596](https://github.com/deepseek-ai/deepseek-harness/commit/84257ea5de4469e6c9231c73a0ae30464f6a2a8c)。

`packages/llm/llm/src/types.ts` 新增：

```ts
export interface ReplayEnvelope {
  response: unknown
  blocks?: readonly unknown[]
}
```

`StreamChunk` 的 `finish.replayState` 从 `unknown` 改成 `ReplayEnvelope`。`BlockAssembler` 在 `finish.kind === 'max-tokens'` 时丢掉 `tool-call` block，并按同一 mask 裁剪 `replay.blocks`；长度对不上则整份 envelope 丢弃。`llm-pi-ai` 对不可用 replay 降级为 provider-neutral 内容，并 `ctx.logger.warn`。

**Marisa 含义**：自写 LLM adapter / replay 缓存如果把 `replayState` 当不透明 blob 原样回放，rc7 会按 block 对齐；对不齐会被丢掉。这是类型收紧，不是静默兼容。预发布磁盘上的旧扁平 `replayState` 走同一降级路径，不保证形状兼容。

### 5. 产品 subagent：`enableRunInBackground` → `backgroundMode: one-shot`

PR [#2374](https://github.com/deepseek-ai/deepseek-harness/commit/21d2433d973a8a5e57e13307c92160805a4f1578)。

`apps/cli/config/agent-presets/{standard,code,cordis}/agent.cordis.yml` 里 disabled 的 Codex / Claude Code 行：

```yaml
# rc6
enableRunInBackground: false
# rc7
backgroundMode: one-shot
```

字段本身没有从 schema 删除。`packages/subagent/tool-subagent/src/index.ts` 在 rc7 里两者并存：`enableRunInBackground` 默认 `true`（要不要暴露 `run_in_background`），`backgroundMode` 默认 `'one-shot'`（默认前台，显式 `true` 走普通 Job；`continuable` 默认后台）。rc6 预设用 `enableRunInBackground: false` 把产品行锁死在前台；rc7 改成 `backgroundMode: one-shot` 后，模型可以显式要后台并拿回 Job id。取消时若错误是 `AggregateError`（启动+回滚失败），不再报 `killed`；后台启动文案从 `task` 改成 `job`。

**Marisa 含义**：自定义 preset 若仍写 `enableRunInBackground: false`，字段还在，行为继续锁前台。只有抄官方产品行的副本需要改字段。`yet-another-subagent` 目前因 rc6 不兼容停用，rc7 也没有自动修好它。

### 6. 持久 bash 不再劫持 PS1

PR [#2586](https://github.com/deepseek-ai/deepseek-harness/commit/7841e0a93eb118363d38ac6356ab565fdda8d4c8)。

`packages/shell/tool-bash-persistent/src/index.ts` 删除 `__DSH_PERSISTENT_BASH_PROMPT__` 和 `stripPrompt`。setup 只发 `stty -echo`。命令结束改看 `result.waitReason === 'stdin_read'`，避免 `exec` / 交互子进程把自定义 prompt 检测转成空转直到超时。`packages/terminal/terminal-bash/src/index.ts` 在 `PROMPT_COMMAND` 里重新断言 `PS1`。

**Marisa 含义**：Windows 默认走 pwsh，这条主要影响 Linux/macOS 实验壳和任何仍挂持久 bash 的 profile。最小模式的 bash 超时/挂起类问题是这次的修复目标。

### 7. 大历史分页

PR [#1371](https://github.com/deepseek-ai/deepseek-harness/commit/cb8756b838e03832bdbf2a688053176b8c3eb999) 把

```ts
Math.min(event.seq, ...sources)
```

改成手写循环。`sourceEventSeqs` 很大时不再炸调用栈。Host↔client 历史 RPC 形状没变，只修分页 cut 计算。

### 8. `node-pty@1.2.0-beta.15`

PR [#2517](https://github.com/deepseek-ai/deepseek-harness/commit/cc68bbf382a52d25fdd87ae029fe1c4ad20aecda)。

`packages/subprocess/subprocess-local/package.json`：`node-pty` 从 `^1.1.0` 改为精确 `1.2.0-beta.15`。`pnpm-workspace.yaml` 的 `patchedDependencies` 从 `patches/node-pty@1.1.0.patch` 换成 `patches/node-pty@1.2.0-beta.15.patch`。

**Marisa 含义**：桌面 backend 若重建原生 pty，要带上新 patch 和 beta 预编译。这是发行闭包变化，不是 JS API。

### 9. UI 文案与交互（非协议）

- [#2559](https://github.com/deepseek-ai/deepseek-harness/commit/66cd593bf3eb80c2512d19cacd431704acbe3991)：英文 `presetCodeName` 从 `Code mode` 改为 `PTC mode`（中文本来就是 `PTC 模式`）。preset **id 仍是 `code`**。
- [#2308](https://github.com/deepseek-ai/deepseek-harness/commit/e0bb7cafc053df3fc1f114e10f3815d4140fd34d)：问用户卡片可收起，新增 locale `nav.minimize` / `nav.maximize`。
- [#2504](https://github.com/deepseek-ai/deepseek-harness/commit/fec00fcb2ca87113857a2ec4a1546027e6527b13)：Safari textarea 软换行不再把输入条越缩越小。
- [#2527](https://github.com/deepseek-ai/deepseek-harness/commit/f322d5cb0d0a1e8b89969e78f20b009768ace565)：Cordis 面板 / JobList 点击外部关闭。

## 明确没变的 fork 接触面

`git diff --quiet fb8269870 99f6f02fe` 退出码 0：

| 文件 | 含义 |
|---|---|
| `apps/cli/src/args.ts` | Marisa 的 `dsh web --profile` 补丁仍要重放 |
| `apps/cli/src/web.ts` | 同上 |
| `apps/cli/src/bin.ts` | CLI 入口未动 |
| `packages/host/webserver/src/index.ts` | 公开 rc6 **已经**把 Cordis 服务名做成 `webServer` |

公开 rc6 的 webserver 模块注释写的就是 “`webServer` service”。`docs/upstream-diff.md` 里 “额外提供旧名 `webServer`” 对照的是 **Marisa 自己的 `4e7fb95f` 快照**，不是公开 rc6。若同步目标改成公开 `fb826987` 或 `99f6f02fe`，这项补丁应重新判断能否删除，而不是默认重放。

CLI 包依赖名集合 rc6/rc7 相同，没有新的必装 `@deepseek-ai/dsh-*` 运行时包。`@deepseek-ai/dsh-agent-loop` / `dsh-web-app` / `dsh-client-modules` 的已发布 JS 在 npm tarball 对比里也只有 version / peer 范围变化。

## 和 Marisa 当前 pin 的关系

[`maintenance/upstreams.json`](../maintenance/upstreams.json)：

```json
"baseline": "4e7fb95f",
"dshVersion": "0.1.0-rc.6",
"channel": "testing"
```

[`docs/upstream-diff.md`](./upstream-diff.md) 把它写成 “`4e7fb95f`（2026-08-08 快照）”。

核对结果：

- 公开克隆里 `git rev-parse 4e7fb95f` 失败：该 SHA **不在** `deepseek-ai/deepseek-harness` 的可达历史上。
- 本机 `C:\Users\lf\deepseek-harness` 与 `C:\Users\lf\.dsh\source\current-0808` 都有完整对象：`4e7fb95fa7565857b7f95e63202f3e7b848bb730`，`2026-08-08 12:11:40 +0000`，`Private DSH snapshot 20260808T121140Z`。
- 本地 `harness/package.json` 的 `version` 是 `0.0.1`，`harness/apps/cli/package.json` 也是 `0.0.1`，不是公开 rc6 的 `0.1.0-rc.6`。
- 本地 `harness/packages/` 仍是 `bash/`、`compact/`、`pty/`、`ui-question`、`ui-model` 这套旧分组；公开 rc6/rc7 已是 `shell/`、`compaction/`、`terminal/`、`ui-user-questions`、`ui-settings-plugins`。
- 导入提交是本仓 `9149bcf182127a624ff11c93f782a832e2e22566`（2026-08-16）`vendor: add DSH rc6 harness and plugin snapshots`。

包名对照（0808 私有快照 vs 官方 rc6/rc7，**不是** rc6→rc7 的差）：

| 0808 私有快照（Marisa 基线） | 官方 rc6 / rc7 |
|---|---|
| `@deepseek-ai/dsh-bash` | `@deepseek-ai/dsh-shell` |
| `@deepseek-ai/dsh-compact*` | `@deepseek-ai/dsh-compaction*` |
| `@deepseek-ai/dsh-pty*` | `@deepseek-ai/dsh-terminal*` |
| `@deepseek-ai/dsh-tasks*` | `@deepseek-ai/dsh-jobs*` |
| `@deepseek-ai/dsh-frontend` | `@deepseek-ai/dsh-web-frontend` |
| `@deepseek-ai/dsh-client-ui-slash` | `@deepseek-ai/dsh-client-ui-input-trigger` |
| `@deepseek-ai/dsh-repeat-tool-guard` | `@deepseek-ai/dsh-repeat-tool-reminder` |

因此：

- “当前 main 的 rc6” 若指**上游公开 master 上的 rc6**，那是 `fb82698709c39f1860b0ab0ed147e1fa30c1d5d0` / npm `@deepseek-ai/dsh@0.1.0-rc.6`。
- “当前 Marisa 的 rc6” 是更早、未出现在公开历史上的 `4e7fb95f` 私有快照，只是兼容版本号写成了 rc6。
- “next 的 rc7” 就是公开 `master` @ `99f6f02fe` / npm `next`=`0.1.0-rc.7`。

从 Marisa 树跳到 rc7，要重放的不只是上表 21 个 PR，还包括 **4e7fb95f → 公开 rc6** 之间从未进过本仓的上游提交。公开 rc6→rc7 本身相对小；本地→rc7 不是小跳。

## 升级清单（只记录事实，不改代码）

同步到公开 rc7 时，至少要逐项看：

1. 插件 / MyGO 是否还按 `settings.plugin.item` 的 `id`+`order` 注册。
2. 任何写死 `settings-not-exposed` 或 Host settings 白名单的补丁。
3. profile 里的 `enableRunInBackground`（字段还在；官方产品行已改 `backgroundMode`）。
4. 自研 LLM adapter 对 `replayState` 的假设。
5. DeepSeek 设置 UI 是否要露出 `low`。
6. Windows 原生 `node-pty` 重建与 pnpm patch。
7. `docs/upstream-diff.md` 现有 Harness 补丁：`--profile` 必重放；`webServer` 别名在公开 rc6+ 上可能已可删；client 模块名映射、toolview、tsconfig 发行裁剪仍要对照新树。
8. 因 “rc6 API/时序” 停用的插件（`multimedia-webui-input`、`dsh-llm-fallbacks`、`yet-another-subagent`、`dsh-diff-viewer`、`dsh-sonar`、`dsh-track`）需要在 **公开 rc7** 上重测，不能沿用对 `4e7fb95f` 的结论。

## 方法与限制

- GitHub HTTPS API（`api.github.com`）和 `github.com` HTML 在本环境被拦截；refs 来自 `git ls-remote` / 本地浅克隆，PR 号来自 merge commit subject。
- npm 来自 `https://registry.npmjs.org/@deepseek-ai/dsh` 及同 scope 包的 `dist-tags` / `time` / `versions`。
- 没有跑上游测试，也没有把 Marisa `harness/` 对 `99f6f02fe` 做三方 merge。
- 浅克隆工作区在 `.tmp-dsh-upstream/`，不是发行树的一部分。
