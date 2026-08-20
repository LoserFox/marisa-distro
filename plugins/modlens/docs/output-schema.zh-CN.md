---
summary: '输出契约：每次识别返回的 JSON 结构、result 字段与 meta'
read_when:
  - 解析 modlens 输出或在它之上构建工具
  - 查 meta.attempts 和 meta.warnings 的含义
---

# ModLens 输出契约（v2）

[English](output-schema.md) | 中文

CLI 向 stdout 打印一个 JSON 对象：

```json
{
  "image": "/abs/path/or/url",
  "provider": "antigravity-cli",
  "result": { "...": "see below" },
  "meta": {
    "generatedAt": "2026-08-01T12:00:00.000Z",
    "model": "gemini-3.6-flash-low",
    "conversationId": "string|null",
    "durationSeconds": 25.4,
    "usage": {},
    "attempts": [{ "provider": "antigravity-cli", "ok": true, "durationSeconds": 25.4 }],
    "warnings": []
  }
}
```

`meta.attempts` 按顺序列出这次运行中故障转移链尝试过的每个 provider，失败时附带 `error` 字符串。`meta.warnings` 携带路由通知：故障转移、被忽略的 `extraBody`，以及自动模式下这次识别花了谁的额度。

只要 provider 支持，`result` 就由 JSON schema 强制约束（agent CLI 走 `--json-schema`，API provider 走 response-schema 字段或预填模板），CLI 返回前还会自己校验一遍结构，所以结构损坏的结果会触发故障转移，不会到你手上：

```json
{
  "summary": "string",
  "ocr": {
    "full_text": "string",
    "lines": [
      { "text": "string", "language": "string (optional)" }
    ]
  },
  "layout": {
    "regions": [
      {
        "type": "string (a short kind: title, paragraph, list, table, chart, form, code, image, icon, link, nav, ...)",
        "reading_order": 1,
        "text": "string"
      }
    ]
  },
  "semantics": {
    "scene": "string",
    "intent": "string (optional)",
    "entities": [
      { "name": "string", "type": "string", "evidence": "string (optional)" }
    ],
    "relations": [
      { "subject": "string", "predicate": "string", "object": "string" }
    ]
  },
  "visual": {
    "dominant_colors": ["string"],
    "style": "string",
    "notes": ["string"]
  },
  "uncertainty": ["string"]
}
```

必填字段：`summary`、`ocr`、`layout`、`semantics`、`visual`、`uncertainty`，也就是每一个顶层字段，`visual` 也不例外。（早期文档把 `visual` 写成可选，但强制执行的 schema 一直要求它，请以 schema 为准。）

可选字段：`ocr.lines[].language`、`semantics.intent`、`semantics.entities[].evidence`、`semantics.relations`、`visual.dominant_colors`、`visual.style`、`visual.notes`。每一个要么不存在，要么就是它声明的类型，绝不会是 `null`：模型在这些位置没话可说时经常写 `null`，modlens 会在结果交到你手上之前把这个键删掉，所以读可选字段只需判断它在不在，不用判断是不是 null。

`layout.regions[].type` 是自由字符串，不是封闭列表。区域类型本质是开放集合：固定枚举会让任何网页截图里的 `link`、门户页里的 `search` 直接落选，而一次落选就为了一个描述性标签废掉整次识别。常用词表写在该字段的 schema `description` 里作为指引，凡是在服务端强制执行这份 schema 的 provider 都会收到，没列到的类型不会有任何代价。

相对 v1 的变化：删掉了像素级 `bbox` 坐标和数值型 `confidence` 分数。视觉模型会凭空编造这两样，v2 不再假装提供。
