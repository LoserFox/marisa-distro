# telemetry/ — session telemetry capability family

English | [中文](README.zh.md)

This family projects session activity into outbound telemetry and delegates delivery to a configured reporting backend. The [telemetry decision](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md) records the reporting boundary; the [mode decision](../../.agents/notes/implemented/feature/2026-08-05-feedback-gated-session-telemetry.md) records immediate, feedback-gated, and disabled delivery.

| Package | Role |
|---|---|
| [`session-telemetry/`](session-telemetry/README.md) | Defines capture, redaction, projection, and live or on-demand backend delivery. |
| [`session-telemetry-otel/`](session-telemetry-otel/README.md) | Delivers telemetry through OpenTelemetry logs in `FULL`, `FEEDBACK_ONLY`, or `DISABLED` mode. |
