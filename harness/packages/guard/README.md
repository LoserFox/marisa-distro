# guard/ — loop-hygiene guard family

English | [中文](README.zh.md)

Behavioral guard plugins watch the agent loop for unproductive patterns and nudge the model back on course. A guard is a self-contained consumer of core seams, not a swappable capability.

| Package | Role | ctx key |
|---|---|---|
| [`repeat-tool-guard/`](repeat-tool-guard/README.md) | Advisory reminders for repeated tool calls | listens on tool and agent events |
