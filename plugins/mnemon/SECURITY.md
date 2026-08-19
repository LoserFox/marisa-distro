# Security Policy

**English** | [简体中文](#简体中文)

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (npm `dsh-mnemon`) | ✅ |

Only the latest published version receives security fixes. The plugin targets the DSH mainline snapshot it was verified against; see the compatibility baseline in [README.md](./README.md).

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report privately through one of these channels, in order of preference:

1. **GitHub Security Advisories** — use the “Report a vulnerability” flow on the [Security tab](../../security) of this repository (private vulnerability reporting).
2. **Email** — `grivn.wang@gmail.com` (maintainer). Use a subject prefix like `[dsh-mnemon security]`.

Please include, when possible:

- affected version(s);
- a minimal reproduction or proof of concept;
- whether the issue is already exploited publicly;
- your disclosure preference (e.g., coordinated disclosure, credit, embargo).

## What to expect

- Acknowledge receipt within **7 days**.
- A fix or a reasoned “not a vulnerability” response within **30 days** where feasible.
- Credit in the release notes unless you prefer to stay anonymous.

## Scope

In scope:

- The plugin bundle (`lib/`, `cordis.patch.yml`): data-loss, privilege-escalation, path-traversal, secret-leak, and memory-corruption style issues in plugin code.
- The control plane: lock handling, revision conflict checks, atomic writes, and subagent isolation boundaries.
- The WebUI: XSS or injection via rendered memory content.

Out of scope:

- Issues in upstream dependencies (`mnemon`, `cordis`, DSH core, React) — report those upstream; we will still help triage and pin workarounds.
- Missing features, documentation gaps, and non-security bugs — use regular issues.
- Credentials or secrets you intentionally stored in memory data yourself; the plugin has no secret scanner (see the disclosure in the README).

## Known limitations

- There is no deterministic credential/secret detection today. Do not write keys, tokens, or private keys into Runtime Memory, Documents, or Memory Spaces.
- Memory data is local; the plugin makes no remote calls, so remote-code-execution exposure is limited to what DSH and your providers already expose.

---

## 简体中文

### 支持的版本

| 版本 | 支持 |
|---|---|
| 0.1.x（npm `dsh-mnemon`） | ✅ |

仅最新发布版本获得安全修复。插件以验证时的 DSH mainline 快照为兼容基线，见 [README.zh-CN.md](./README.zh-CN.md)。

### 报告漏洞

请**不要**为安全漏洞开公开 issue，按优先级使用以下渠道私下报告：

1. **GitHub Security Advisories**：在本仓库 [Security 页](../../security) 使用“Report a vulnerability”（私密漏洞报告）。
2. **邮件**：`grivn.wang@gmail.com`（维护者），主题加 `[dsh-mnemon security]` 前缀。

请尽量附上：受影响版本、最小复现或 PoC、是否已被公开利用、披露偏好（协调披露 / 署名 / 保密期）。

### 预期

- **7 天**内确认收到；可行情况下 **30 天**内给出修复或“非漏洞”的结论。
- 除非你要求匿名，否则在发布说明中致谢。

### 范围

**范围内**：插件 bundle 与 `cordis.patch.yml` 中的数据丢失、提权、路径穿越、秘密泄露类问题；控制面（锁、revision 冲突检查、原子写、子 Agent 隔离）；WebUI 对记忆内容渲染的 XSS/注入。

**范围外**：上游依赖（`mnemon`、`cordis`、DSH 核心、React）自身的问题（报告给上游，我们可协助定位与临时规避）；功能缺失、文档问题（走普通 issue）；你自行写入记忆数据中的凭据或秘密（插件当前没有秘密检测器，见 README 披露）。

### 已知限制

- 当前没有确定性的凭据/秘密检测，请勿向热记忆、Documents 或 Memory Spaces 写入密钥、token、私钥。
- 记忆数据全部本地存储，插件不发起远程调用；远程代码执行面受限于 DSH 与你的 provider 既有暴露面。
