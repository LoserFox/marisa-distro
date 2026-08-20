---
summary: 'Output contract: the JSON shape every read returns, result fields and meta'
read_when:
  - Parsing modlens output or building on top of it
  - Checking what meta.attempts and meta.warnings mean
---

# ModLens Output Schema (v2)

English | [中文](output-schema.zh-CN.md)

The CLI prints one JSON object to stdout:

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

`meta.attempts` lists every provider the failover chain tried this run, in order, with an `error` string on failures. `meta.warnings` carries routing notices: failovers, an ignored `extraBody`, and whose quota an auto-mode read spent.

`result` is enforced by JSON schema where the provider supports it (agent CLIs via `--json-schema`, API providers via response-schema fields or a filled-in template), and the CLI verifies the shape itself before returning, so a structurally broken result fails over instead of reaching you:

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

Required fields: `summary`, `ocr`, `layout`, `semantics`, `visual`, `uncertainty` — every top-level field, `visual` included. (Earlier docs called `visual` optional; the enforced schema has always required it, so build to the schema.)

Optional fields: `ocr.lines[].language`, `semantics.intent`, `semantics.entities[].evidence`, `semantics.relations`, `visual.dominant_colors`, `visual.style`, `visual.notes`. Each is either absent or holds its declared type. Never `null`: a model with nothing to say there often writes one, and modlens drops the key before the result reaches you, so reading an optional field means checking whether it is there, not whether it is null.

`layout.regions[].type` is a free string, not a closed list. Region kinds are an open set: a fixed enum rejected `link` on any web screenshot and `search` on a portal, and a rejected result fails the whole read over a descriptive label. The field's schema `description` names the common vocabulary as guidance, which reaches every provider that enforces this schema server-side, so an unlisted kind costs nothing.

Changes from v1: pixel `bbox` coordinates and numeric `confidence` scores were removed. Vision models fabricate both, so v2 stops pretending to provide them.
