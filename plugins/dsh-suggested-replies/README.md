# dsh-suggested-replies

DSH Web 的“预测回复”插件：AI 回复结束后，生成几条用户下一步可能会发送的消息候选，并将它们显示在**聊天输入框上方**。点击候选只会将文本填入输入框，**不会自动发送**。

![候选气泡位于输入框上方](docs/suggested-replies-layout.svg)

## 行为

```text
AI 完成本轮回复
  -> 插件创建一个只使用官方事件的内部 Agent Session
  -> 内部 Agent 以零工具、完整 persona 根据近期对话生成候选
  -> flush 并归档内部 Session，把 UI 状态写入插件自有 storage-domain sidecar
  -> Web 在 conversation.input.dock（输入框上方）显示气泡
  -> 点击候选：inputActions.setDraft(text)
  -> 用户自行编辑或点击发送
```

- **正确位置**：注册 `conversation.input.dock`，位于 DSH 的消息输入卡片上方；不会放到输入框下方的 `conversation.composer.dock`。
- **单行展示**：候选始终保持在一条横线上；宽度不足时横向滚动查看，不换到第二行。
- **只填入草稿**：点击候选会替换当前草稿为该候选，不会调用发送动作。
- **候选内容**：优先覆盖合理的下一步执行、验证/追问、或决策/选择；候选跟随最近对话语言，彼此去重且可直接发送。
- **失败兜底**：辅助模型没有返回规定 JSON 时，插件仍按最近对话语言生成配置数量的保守候选，不再把空数组当成成功结果隐藏整行。
- **上下文范围**：辅助提示词只截取直接用户消息和 AI 回复；AGENTS、运行时快照和 Skill 目录等注入上下文不会挤占最近对话窗口。
- **过期保护**：新用户输入、设置关闭、辅助调用超时或插件卸载都会取消当前生成，避免旧结果在下一轮对话中回流。
- **模型调用与成本**：每个可生成候选的完成轮次额外运行一个短文本内部 Agent。默认复用 Session 最新 `request/header` 中实际使用的 provider/model，再回退到 Agent 默认路由；也可通过 `suggestionProvider` + `suggestionModel` 显式覆盖。关闭开关后不再运行该 Agent。
- **Core 零修改**：父 Session 不追加插件自定义事件，也不修改 `KNOWN_SESSION_EVENT_TYPES`。生成过程完整记录在内部官方 Agent Session；候选的 loading/ready/cleared 状态保存在插件拥有的 `suggested_replies_state` domain，因此卸载插件后父 Session 仍能由原版 DSH reader 恢复。
- **状态恢复**：sidecar 行按 Session id 存储，并校验 header 的 `{ createdAt, cwd }`；页面刷新或 Host 重启后仍可恢复当前候选，复用同一 id 的另一条 Session 不会读到旧状态。

## 安装

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:dsh-external/dsh-suggested-replies
```

### 本地开发目录安装

```sh
dsh plugin --profile web add /absolute/path/to/dsh-suggested-replies
```

安装或更新后，重启正在运行的 `dsh web` 服务，并在浏览器硬刷新页面。新建或重新打开一个会话后进行验证。

## 设置与配置

Web 设置页中的“下一步建议”分区提供 `enabled` 总开关。它写入 `$DSH_HOME/settings.yaml` 的 `suggested-replies` 区域，下一轮立即生效。

其余部署参数在 `cordis.patch.yml` 或 profile overlay 中配置：

| 字段 | 默认值 | 说明 |
| --- | ---: | --- |
| `enabled` | `true` | 是否生成候选；关闭后无辅助模型调用。 |
| `suggestionCount` | `3` | 每轮候选数量，范围 `2-4`。 |
| `contextMessageCount` | `4` | 传给辅助模型的最近可见消息数，范围 `2-6`。 |
| `maxSuggestionChars` | `160` | 单条候选保留的最大字符数，范围 `32-300`。 |
| `maxTokens` | `384` | 辅助调用的最大输出 token，范围 `64-1024`。 |
| `timeoutMs` | `15000` | 辅助调用最长时长（毫秒），范围 `1000-30000`。 |
| `suggestionProvider` | 未设置 | 可选：显式指定辅助调用 provider；省略时跟随当前会话模型。 |
| `suggestionModel` | 未设置 | 可选：显式指定辅助调用 model；必须与 `suggestionProvider` 同时提供。 |

示例 overlay：

```yaml
- patch:
    - id: suggested-replies
      config:
        suggestionCount: 4
        maxSuggestionChars: 120
        timeoutMs: 10000
        suggestionProvider: deepseek-official
        suggestionModel: deepseek-v4-flash
```

## 开发与验证

```sh
export DSH_SOURCE=/path/to/deepseek-harness
pnpm install --no-frozen-lockfile
pnpm run links
pnpm run typecheck
pnpm run test
pnpm run build
pnpm pack --dry-run
```

提交前的独立 Profile 验证：

```sh
TEMP_DSH_HOME="$(mktemp -d)"
DSH_HOME="$TEMP_DSH_HOME" dsh plugin --profile web add /absolute/path/to/dsh-suggested-replies
DSH_HOME="$TEMP_DSH_HOME" dsh --profile web --dump-config
```

实际页面验收要点：

1. AI 回复结束后，候选行的几何位置在 `[data-composer-card]` 上方。
2. 点击候选后，textarea 草稿变为候选文本。
3. 点击候选后不会创建下一轮、不会自动发送消息。

## 致谢

本项目是独立实现，并明确致谢 [dsh-external/dsh-auto-blame](https://github.com/dsh-external/dsh-auto-blame) 的双端 Web 插件组合思路。

本项目重新实现了产品语义、内部 Agent、sidecar 状态、RPC 长轮询、提示词、过期结果处理、输入框上方布局和“只填入不发送”的交互；未包含该项目的源代码、图像或品牌资产。

## License

[MIT](LICENSE)
