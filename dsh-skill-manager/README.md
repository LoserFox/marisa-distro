# dsh-skill-manager

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that lets you **manage your own skills** — the `~/.dsh/skills` directory the harness already discovers — straight from the chat, through slash commands and a model-facing tool.

DeepSeek Harness ships the full skill *capability* (the `dsh-skill` registry, the `dsh-skill-filesystem` provider, the `skill` loader tool, and the `/name` composer source). This plugin is a **Consumer** of that capability: it only reads and writes the user skill directory, so anything you create or change here shows up in the `/` menu and the model catalog on the next discovery.

> Everything is a plugin: this package is a **bundle** (`dsh.bundle` → a `cordis.patch.yml` that inserts one host-plane row). It is plain ESM with no build step.

## Install

```sh
dsh plugin --profile web add github:bitterSmilezzz/dsh-skill-manager
dsh web
```

Pin a commit for reproducible installs:

```sh
dsh plugin --profile web add github:bitterSmilezzz/dsh-skill-manager#<sha>
```

To remove it:

```sh
dsh plugin --profile web remove dsh-skill-manager
```

## Usage

### Slash commands (human, in the composer)

| Command | What it does |
|---|---|
| `/skills` | List your user skills and their model/user invocation flags. |
| `/skill-remove <name>` | Delete a user skill by name. |

### The `skill_manage` tool (the model)

Ask the agent to manage a skill and it calls `skill_manage`:

- `list` — list user skills.
- `get` (`name`) — read one skill's instructions.
- `save` (`name`, `description`, `content`, optional `whenToUse`, `modelInvocable`, `userInvocable`, `originalName` for rename) — create or update a skill.
- `remove` (`name`) — delete a skill.

For example: *"Create a skill named `code-review` that reviews a diff for correctness and style."*

## Skill file format

Skills are the exact format `dsh-skill-filesystem` discovers — a `<name>/SKILL.md` directory bundle with YAML frontmatter:

```markdown
---
name: code-review
description: Review a code change
whenToUse: For pull-request review tasks
---

The instructions the model follows when this skill is loaded.
```

`disable-model-invocation: true` and `user-invocable: false` are written only when the corresponding surface is turned off, matching the provider's default-permit semantics.

## How it works

```
dsh --profile web
  └─ skill-manager (host plane) injects commands + tools
       ├─ /skills, /skill-remove        → UI command plane (no model tokens)
       └─ skill_manage tool             → model calls it to read/write SKILL.md
            └─ dsh-skill-filesystem     → discovers the change on next catalog refresh
```

## Configuration

| Row | Field | Default | Meaning |
|---|---|---|---|
| `skill-manager` | `dshHome` | `$DSH_HOME`, then `~/.dsh` | Harness home whose `skills` directory is managed. |

## Model Experience

- **The tool result is model-visible** only when the model calls `skill_manage`; it returns a compact string summary. The tool schema adds a fixed per-request cost when the tool is visible.
- **Slash commands add no model tokens**: command discovery, execution, and output stay in the UI command plane.
- **Changed skills reach the model** through the existing skill catalog and `/name` gesture, which `dsh-tool-skill` already republishes after the filesystem provider invalidates.

## Known Limitations

- **User-root skills only** — this plugin manages `~/.dsh/skills`; bundled, project, and preset skills are read-only elsewhere (they appear in the per-session `/` menu).
- **No settings UI** — management is command- and tool-driven, matching filesystem-backed agent conventions (Claude Code, Codex) rather than a graphical page.
- **Text-only skill bodies** — the instruction body is plain Markdown; there is no resource enumeration or attachment upload.
- **Watcher latency** — a change is visible to the model on the next catalog refresh (the filesystem provider watches the directory); the tool result itself does not force an immediate catalog republish.

## Publishing

This repository is publish-ready as an installable bundle:

- **No build step** — `index.js` is plain ESM, so a git install needs no `prepare` script and no `allowBuilds` step.
- Add the **`dsh-plugin`** topic (already set on this repo).
- `dependencies` (`yaml` only) are published, so `dsh plugin add` installs them with pnpm — no harness peer packages are imported at runtime.

## License

[MIT](LICENSE)
