# dsh-sidechain

DSH 侧会话插件。它通过 fork 当前会话创建独立子会话，让用户在不中断主线程的情况下发起一次性问题或持续对话。

当前版本适配公开版 DSH npm `0.0.1-rc.5`、`0.1.0-rc.6` 和 `0.1.0-rc.7`（rc.7 源码提交 `99f6f02`）。

| 命令 | 用途 |
|---|---|
| `/btw <问题>` | 发起一次性侧问，适合快速确认信息 |
| `/side <问题>` | 创建可持续追问的侧会话 |
| `/side list` | 列出当前会话的直接子代理 |

侧会话继承主会话已经完成的回合作为参考上下文，但拥有独立的消息记录和执行过程。侧会话的提示、思考、工具调用和回答不会进入主会话的模型上下文。

## 功能

- `/btw` 在后台完成单轮问答，主会话可以继续使用。
- `/side` 创建可续聊线程，可直接在侧栏中发送后续消息。
- 右侧面板显示用户消息、上下文、思考、工具调用与回答。
- 运行中的会话实时更新，并在列表中显示活动摘要。
- 子会话历史持久化，重启 DSH 后仍可查看。
- 面板支持拖拽调宽、展开、手动刷新和 `Ctrl/Cmd+Shift+E` 快捷开关。

## 安装与卸载

依赖 DSH 提供的 `dsh-subagent`、`dsh-subagent-fork` 和 `dsh-commands` 插件。默认 Web profile 已包含这些依赖。

### 安装

```sh
dsh plugin --profile web add github:Buyi-wsgzg/dsh-sidechain
```

pnpm 10 及以上首次安装会提示允许 Git 依赖执行 `prepare`。按命令输出把插件键加入 Web profile 的 `pnpm-workspace.yaml`，然后重新执行安装命令。

插件会向 Web profile 添加以下配置：

```yaml
- insert:
    - id: dsh-sidechain
      name: '@dsh-external/dsh-sidechain'
```

安装或更新插件代码后，重启 `dsh web` 并刷新页面。

### 卸载

```sh
dsh plugin --profile web remove @dsh-external/dsh-sidechain
```

该命令会同时移除 profile 依赖和插件配置层。完成后重启 `dsh web` 并刷新页面。

## 配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `providerName` | `fork` | 用于创建子会话的 subagent provider |
| `persona` | 内置侧会话 persona | 侧会话的行为约束；空字符串表示沿用部署 persona |
| `readOnlyTools` | 未设置 | 可选工具 allow-list，例如 `['read', 'grep', 'glob']` |

配置示例：

```yaml
- insert:
    - id: dsh-sidechain
      name: '@dsh-external/dsh-sidechain'
      config:
        providerName: fork
        readOnlyTools:
          - read
          - grep
          - glob
```

## 使用

一次性侧问：

```text
/btw 这个目录下哪个文件最大？
```

命令立即返回，侧链面板自动打开并显示执行过程和答案。`/btw` 会话只读，不能继续追问。

持续侧会话：

```text
/side 分析一下当前插件的事件流
```

侧链面板会打开新线程。在线程底部输入消息并按 Enter，即可继续对话。

查看子代理列表：

```text
/side list
```

`/side` 和 `/btw` 都必须提供问题。

## 侧链面板

会话标题栏中的侧链按钮用于打开右侧面板。面板列表包含当前会话的直接子代理，并显示其类型、标题、运行状态和活动摘要。

选择一个线程后，面板显示该子会话的完整时间线：

- 用户消息与模型回答
- 上下文注入与模型思考
- 工具调用、结果和错误
- Markdown、代码块、表格与公式

`/side` 线程带输入框，可持续对话；`/btw` 线程为只读。面板只读取子会话日志，不会切换或激活主会话中的当前对话。

## 会话隔离

fork 只继承父会话已经完成的回合。继承内容仅作为参考，boundary 之后的消息才是侧会话的当前任务。

每个侧会话拥有独立日志。侧会话的消息、工具活动和回答留在子会话中，不会作为用户消息或子代理通知进入主会话。主会话只保留创建侧会话的命令结果。

默认 persona 允许非破坏性探索，不会主动修改文件、请求提权、创建子代理或向父会话报告。用户在侧会话中明确要求修改时，实际权限仍由 DSH 的 sandbox 和工具配置决定。

## 限制

- fork 不包含父会话正在进行的回合。
- `/btw` 只运行一轮；需要继续追问时使用 `/side`。
- `/side list` 和侧栏列出当前会话的全部直接子代理，不限于本插件创建的线程。
- `/side` 必须带首个问题；当前 subagent API 不支持创建后等待首次输入的空线程。

## 开发

```sh
pnpm install
pnpm check
```

`pnpm check` 依次执行类型检查、测试和构建。开发依赖固定到最新支持版 DSH `0.1.0-rc.7`，不需要本机存在 DSH 源码 checkout。
