# guard/ — 循环卫生 guard 家族

[English](README.md) | 中文

行为 guard 插件监视 agent loop（智能体循环）中的无效模式，并推动模型回到正轨。guard 是 core seam 的自包含消费方，而非可替换能力。

| 包 | 职责 | ctx key |
|---|---|---|
| [`repeat-tool-guard/`](repeat-tool-guard/README.md) | 针对重复工具调用的建议性提醒 | 监听工具和 agent 事件 |
