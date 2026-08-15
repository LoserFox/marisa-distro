# session-persistence/ — persistence capability family

English | [中文](README.zh.md)

This family defines durable session persistence, semantic checkpoint policy, and the shipped storage backends.

| Package | Role | ctx key |
|---|---|---|
| [`session-persistence/`](session-persistence/README.md) | Defines the persistence service and shared write coordination | `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.md) | Applies semantic durability checkpoints | wraps `ctx.llm` and `ctx.tools` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.md) | Persists sessions in JSONL files | registers on `ctx.sessionPersistence` |
| [`session-persistence-sqlite/`](session-persistence-sqlite/README.md) | Persists sessions in SQLite | registers on `ctx.sessionPersistence` |

The [session-persistence decision](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md) records the family design.
