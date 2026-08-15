# dsh-input-history

**简体中文** | [English](./README.en.md)

DSH Web 输入历史插件：像终端一样用 **Ctrl+Up / Ctrl+Down** 召回和切换已发送的消息，零核心改动。

## 版本兼容 / Version compatibility

兼容 DSH snapshot0808（`snapshots/20260808T121140Z`）、snapshot0809（`snapshots/20260809T140917Z`）、snapshot0810（`snapshots/20260810T155924Z`）、snapshot0811（`snapshots/20260811T152241Z`）与最终快照 snapshot0812（`snapshots/20260812T172954Z-final`）：浏览器端实现只使用会话快照与官方输入门面（`conversation.input.for(actx).setDraft()`），不依赖任何被 0808/0809 迁移的槽位契约，typecheck 与实机加载均已验证——0809 运行中的 `window.__DSH_BOOT__` 清单包含本插件，Ctrl+Up / Ctrl+Down 召回实测可用；0810 迁移后 `dsh.client` 声明实测同样进 boot 图；0811 与 0812 最终快照实机 boot 验证通过（见下）。

**npm 发版兼容**：兼容 DSH npm 发版 `@deepseek-ai/dsh@0.0.1-rc.5`（dist-tag `next`，即最终快照 snapshot0812 的 npm 发版；`npm exec -p @deepseek-ai/dsh@0.0.1-rc.5 -- dsh --profile web --port <port>` 可访问指定版本并启动，lib 生产模式），同时保持兼容 `@deepseek-ai/dsh@0.0.1-rc.2`（snapshot0811 的 npm 发版）。实测（npm rc.5 基线）：`dsh web` 启动后 `window.__DSH_BOOT__` 清单包含本插件（inject: `dsh-client-runtime`/`dsh-client-ui-conversation`），`/plugins/@dsh-external/dsh-input-history/client.js` 返回 200；src 对 rc.5 基线构建产物 typecheck 全绿（本插件已把 cordis 类型导入与 peer 迁移至 `@deepseek-ai/cordis`，见下）。注意：0811 起 vendored cordis 更名为 `@deepseek-ai/cordis`（npm 发版不再发布 `cordis` 名义的 vendored 包），本插件已迁移（peer 声明 `@deepseek-ai/cordis: ^4.0.1-rc.1`，npm rc.5 基线上为 `4.0.1-rc.4`），纯 `npm install` 不再报 ERESOLVE。

### 0809 兼容要点（实机验证）

- **加载机制变化**：0809 重构了客户端插件机制——旧的 `dsh.plugin.json` 清单 + `resolveClientPath`（`packages/plugin/plugin`）已删除，改为 **package.json 的 `dshClient` 声明**（`platform: 'web'`，可选 `inject`/`immediately`）+ `exports["./client"]` 指向构建产物；宿主扫描 loader 条目组成 boot 图，Web 端从 `/plugins/<id>/client.js` 拉取。本插件 package.json 已满足该声明，无需改动。
- 依赖的官方输入门面 `conversation.input.for(actx).setDraft()` 与 `ConversationSnapshot.nodes` 会话快照在 0809 上保留，契约未变；键盘 capture 拦截不依赖任何槽位。
- **构建要求**：0809 宿主在激活时校验 `dshClient` 包的构建产物，缺失会抛 `ClientPackageCompositionError` 并**拒绝启动 `dsh web`**——升级快照或改源码后必须重新 `pnpm run build` 再启动，否则浏览器拉到的是旧 `lib/client.js`。

### 0810 兼容要点（snapshot0810）

- **元数据发现变化**：0810 的 ClientModuleHostService 在启动时扫描已加载插件的 package.json，但只读**嵌套 `dsh.client`**（`packages/client/modules/src/index.ts` 的 `resolveMeta`，`pkg.dsh.client`）；顶层 `dshClient` 字段读不到会静默丢出 boot 图——无日志、无报错，"启动顺利但插件全没"。本插件已从顶层 `dshClient` 迁移为嵌套 `dsh.client`（inject 原样保留）；`lib/client.js` 构建产物不变（package.json 不参与编译），symlink 安装改源仓库即生效，无需重装。

### 0811 兼容要点（snapshot0811，实机验证）

- **cordis 更名（本快照唯一影响本插件的官方变化）**：0811 将 vendored cordis 由 `cordis@4.0.0-rc.7` 更名为 **`@deepseek-ai/cordis@4.0.1-rc.1`**（官方 client 包随之全部改从 `@deepseek-ai/cordis` 导入）。本插件对 cordis 只有 type-only 导入（`src/index.ts`、`src/invariant.ts` 的 `import type { Context } from 'cordis'`），**构建产物（lib/*.js）零 cordis 运行时导入**——更名不影响已构建 bundle 的运行时加载；但源码对 npm rc.2 基线 typecheck 时 `cordis` 裸导入报 TS2307（仅此一处），**将类型导入迁移为 `from '@deepseek-ai/cordis'` 后全绿**。建议同步把 `peerDependencies.cordis` 迁移为 `@deepseek-ai/cordis: ^4.0.1-rc.1`。
- **实机 boot 验证**：snapshot0811（`snapshots/20260811T152241Z`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-input-history`（inject: `dsh-client-runtime`/`dsh-client-ui-conversation`），`/plugins/@dsh-external/dsh-input-history/client.js` 返回 200；typecheck（含 tests）对 0811 基线通过。依赖的输入门面 `conversation.input.for(actx).setDraft()` 与 `ConversationSnapshot.nodes` 契约在 0811 上保持不变（0811 会话快照仅新增 `views` 字段，不影响 nodes 读取）。

### 0812/最终快照 兼容要点（snapshots/20260812T172954Z-final，实机验证）

- **cordis 更名落地**：本插件已把 type-only 导入（`src/index.ts`、`src/invariant.ts` 的 `import type { Context } from '@deepseek-ai/cordis'`）与 `peerDependencies` 迁移至 `@deepseek-ai/cordis`（`^4.0.1-rc.1`；npm rc.5 基线上为 `@deepseek-ai/cordis@4.0.1-rc.4`）——构建产物（lib/*.js）依旧零 cordis 运行时导入，npm rc.5 消费者 typecheck 全绿，`npm install` 无需 `--legacy-peer-deps`。
- **invariants 源码包迁移（仅影响本地 typecheck）**：最终快照将 `@deepseek-ai/dsh-invariants` 源码包由 `packages/support/invariants` 移至 `packages/runtime-diagnostics/invariants`，devDependencies 路径已同步更新；服务名 `invariants` 与注册协议未变，运行不受影响。
- **实机 boot 验证**：最终快照（`snapshots/20260812T172954Z-final`）web 启动后 `window.__DSH_BOOT__` 清单包含 `@dsh-external/dsh-input-history`，`/plugins/@dsh-external/dsh-input-history/client.js` 返回 200；npm rc.5 consumer `dsh web` 启动后 boot 清单同样包含本插件。依赖的输入门面 `conversation.input.for(actx).setDraft()` 与 `ConversationSnapshot.nodes` 契约在最终快照与 rc.5 上保持不变（0811 新增的 `views` 与 `InputState.imageIds` 均不影响本插件读取的 nodes/draft 契约）。typecheck、build 与 18 个单测对最终快照基线通过。

## 功能

- **Ctrl+Up**：把最近一条已发送的用户消息填入输入框；连续按向上遍历更早的消息
- **Ctrl+Down**：向下遍历回更新的消息；回到最新位置时恢复你按 Ctrl+Up 之前未发送的草稿
- 裸方向键、Enter、Ctrl+Z/Y、斜杠菜单等全部原样放行——多行输入的光标移动不受影响（对应 [dsh-external/issues#153](https://github.com/dsh-external/issues/issues/153) 的约束）
- 历史来自当前会话快照的用户消息（自动去相邻重复、跳过空白），刷新页面后仍然可用
- 输入框被手动编辑、粘贴、或发送清空草稿后，浏览状态自动复位

## 安装

在 DSH 的 `cordis.yml` 中注册插件（或使用 marisa / plugin-registry 安装）：

```yaml
plugins:
  '@dsh-external/dsh-input-history':
    path: /path/to/dsh-input-history
```

重启 `dsh web` 后，浏览器端插件会随页面加载（`/plugins/<id>/client.js`）。

## 构建

```sh
pnpm install
pnpm run build      # lib/index.js + lib/invariant.js + lib/client.js
pnpm run test       # 纯逻辑单测
pnpm run typecheck
```

## 设计说明

- 纯浏览器端实现：无服务端行为（`src/index.ts` 是空壳），不向模型或会话日志注入任何内容
- 历史数据派生自 `ConversationSnapshot.nodes`（`kind === 'user'` 的文本块），不维护第二份状态
- 键盘在 document capture 阶段拦截，仅匹配 `Ctrl+ArrowUp/ArrowDown` 且焦点在会话输入框（`data-input-scroll` 内）时生效
- 草稿写入走官方输入门面 `conversation.input.for(actx).setDraft()`，与撤销/发送事务兼容

## Known Limitations and Deferred Work

- 历史仅覆盖当前会话（按 issue #153 语义）；跨会话/跨设备历史共享未实现
- 快照窗口外的旧消息不在召回范围内（窗口内必然包含最近发送的消息，实际影响很小）
- macOS 的 Cmd 修饰键未绑定（可扩展为配置项）
- 切换会话后浏览状态复位，不会跨会话续接
