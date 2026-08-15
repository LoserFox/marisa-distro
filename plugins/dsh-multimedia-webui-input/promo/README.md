# Promotional capture

[简体中文](README.zh.md) | English

This folder is a recording/QA workflow only. It does not add an automatic demo
mode, kiosk takeover, public link, or production dependency to the plugin.

`record.mjs` drives one real isolated DSH session. It selects a standalone
file and a three-file folder, sends both, waits for the real model to read all
four files, asks the model to edit only the copied folder attachment with
`StrReplace`, and then demonstrates both cleanup confirmation and workspace
cleanup. The source fixture remains unchanged after the run.

Inputs and the Playwright runtime are supplied through environment variables
so private repository URLs, API keys, local usernames, and machine-specific
paths are never checked in. `setup-isolated.mjs` and `cleanup-isolated.mjs`
create and remove a marker-owned temporary DSH home/workspace for recording;
the cleanup helper refuses paths outside its dedicated temporary prefix.

Generated review assets:

- `assets/dsh-multimedia-webui-input-demo.mp4` — H.264/YUV420p, 1440×900, full flow.
- `assets/dsh-multimedia-webui-input-demo.gif` — 960×600, accelerated 10 fps preview.

The checked-in assets show a real local send, model read/edit/verification,
and ownership-scoped cleanup. They are not a mock, an automatic product demo
mode, or a background replay feature.
