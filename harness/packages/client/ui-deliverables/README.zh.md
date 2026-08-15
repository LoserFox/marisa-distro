# @deepseek-ai/dsh-client-ui-deliverables

[English](README.md) | 中文

产物文件的功能属主：把"完成的一轮以其产出文件收尾"的产物行注册进 chat 视图的 `conversation.chat.turnTail` 空位。全部策略都在本包内；从 cordis.yml 中删去本插件那一行即可整体移除该交互面，属主视图以零成本渲染一个空的空位。

`producedForClosing` 从 tail 空位的 owner 通货——定稿的快照节点与收尾 assistant 的 seq——推导一轮产出的文件。词表是改写工具自身的跟随 `locations`，绝不是收尾正文：无论模型是否记得点名，产出文件都会被列出。改写按渲染意图识别而非工具名——diff 卡片，或 `kind` 为 `edit` 的 generic 卡片（即 `str_replace_editor` 的 insert 所呈现的形状）——因此新的改写工具靠声明自己做了什么加入。read、删除与失败的调用不贡献任何条目；同一路径在一轮内按首见顺序只出现一次；累积在 turn 边界重置，因此一轮若先改写文件、随后没有正文内容就结束，不会溢进下一轮的行里。

`ProducedFiles` 在收尾消息正文与其 IconActions 之间渲染该行：一个安静的标签、至多六枚 chip（文本为文件名，完整路径作为 `title`），超出上限则显示一个明确的剩余计数。每枚 chip 经由 owner 提供的 `openFile` 打开——与工具行相同的 Host 打开器，chat 视图会把相对路径按会话 cwd 解析。设计原理：[workspace 文件链接 Agent Note](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.md)。

## 模型体验

无。该行是对已记录工具元数据的纯客户端派生，这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **正文提及仍是死文本。**收尾消息里以行内代码写出的文件名尚不能点击打开；把它接到同一份 `locations` 词表是 stacked 的后续工作。
