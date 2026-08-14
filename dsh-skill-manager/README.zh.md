# dsh-skill-manager

[English](README.md) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：直接在对话里**管理你自己的 skill**（即 harness 已经发现的 `~/.dsh/skills` 目录），通过斜杠命令和一个模型可调用的工具。

DeepSeek Harness 内置了完整的 skill **能力**（`dsh-skill` 注册表、`dsh-skill-filesystem` 提供方、`skill` 加载工具、`/name` 输入源）。本插件是该能力的 **Consumer**：只读写用户 skill 目录，因此你创建或修改的任何内容，都会在下一次发现时出现在 `/` 菜单和模型目录里。

> 一切皆插件：这个包是一个 **bundle**（`dsh.bundle` → 一个插入单行 host 插件的 `cordis.patch.yml`）。纯 ESM，无构建步骤。

## 安装

```sh
dsh plugin --profile web add github:bitterSmilezzz/dsh-skill-manager
dsh web
```

固定 commit 以便可复现安装：

```sh
dsh plugin --profile web add github:bitterSmilezzz/dsh-skill-manager#<sha>
```

移除：

```sh
dsh plugin --profile web remove dsh-skill-manager
```

## 使用

### 斜杠命令（人，在输入框）

| 命令 | 作用 |
|---|---|
| `/skills` | 列出你的用户 skill 及其模型/用户调用开关。 |
| `/skill-remove <name>` | 按名称删除一个用户 skill。 |

### `skill_manage` 工具（模型）

让 agent 管理 skill，它会调用 `skill_manage`：

- `list` — 列出用户 skill。
- `get`（`name`）— 读取某个 skill 的指令正文。
- `save`（`name`、`description`、`content`，可选 `whenToUse`、`modelInvocable`、`userInvocable`、重命名用 `originalName`）— 创建或更新 skill。
- `remove`（`name`）— 删除 skill。

例如：*「新建一个名为 `code-review` 的 skill，用来评审 diff 的正确性与风格。」*

## Skill 文件格式

skill 采用 `dsh-skill-filesystem` 发现的精确格式 —— `<name>/SKILL.md` 目录束，带 YAML frontmatter：

```markdown
---
name: code-review
description: 评审一次代码改动
whenToUse: 用于拉取请求评审任务
---

模型加载该 skill 时要遵循的指令正文。
```

`disable-model-invocation: true` 与 `user-invocable: false` 仅在对应 surface 被关闭时才写入，与 provider 的「缺省即允许」语义一致。

## 工作原理

```
dsh --profile web
  └─ skill-manager（宿主平面）注入 commands + tools
       ├─ /skills、/skill-remove        → UI 命令平面（不产生模型 token）
       └─ skill_manage 工具             → 模型调用它读写 SKILL.md
            └─ dsh-skill-filesystem     → 下次目录刷新时发现变更
```

## 配置

| 行 | 字段 | 默认 | 含义 |
|---|---|---|---|
| `skill-manager` | `dshHome` | `$DSH_HOME`，否则 `~/.dsh` | 被管理的 harness home，其 `skills` 目录即管理对象。 |

## Model Experience

- **工具结果仅在模型调用 `skill_manage` 时进入模型**，返回一段紧凑的字符串摘要；工具可见时，schema 带来每请求固定的开销。
- **斜杠命令不产生模型 token**：命令发现、执行与输出都停留在 UI 命令平面。
- **变更后的 skill 通过现有 skill 目录与 `/name` 手势到达模型**，这部分 `dsh-tool-skill` 会在 filesystem provider 失效后重新发布。

## Known Limitations

- **仅用户根 skill** —— 本插件管理 `~/.dsh/skills`；bundled、项目与 preset skill 在别处只读（出现在每会话的 `/` 菜单里）。
- **无设置页** —— 管理走命令与工具，遵循文件系统驱动的 agent 惯例（Claude Code、Codex），而非图形页面。
- **正文仅文本** —— 指令正文是纯 Markdown，无资源枚举或附件上传。
- **监听延迟** —— 变更在下次目录刷新时才对模型可见（filesystem provider 会监听该目录）；工具结果本身不会立即强制重发目录。

## 发布

本仓库已可直接作为可安装 bundle 发布：

- **无构建步骤** —— `index.js` 是纯 ESM，因此 git 安装无需 `prepare` 脚本，也无需 `allowBuilds` 步骤。
- 已加上 **`dsh-plugin`** 标签（本仓库已设置）。
- `dependencies`（仅 `yaml`）已发布，`dsh plugin add` 会用 pnpm 安装它 —— 运行时不再 import 任何 harness peer 包。

## 许可证

[MIT](LICENSE)
