# 杂项小任务：jucode 网关 grok-4.6 上下文查询、workbuddy 模型配置迁移

> 来源会话：`07623210-7272-45f4-8664-07af68314176.jsonl`（2026-08-18 19:45–19:47）、`1e2e586a-5b92-4eca-808b-3082facc6ccb.jsonl`（2026-08-18 14:51–14:53）
> 整理方式：会话记录结构化纪要

## 背景与目标

两个彼此无关的小任务：

1. **07623210**：查询 `https://api.jucode.cn/anthropic` 网关上的 grok-4.6 模型最大上下文长度（用户提供了自己的 API key）
2. **1e2e586a**：从 `C:\Users\lf\Downloads\workbuddy-windows.bat` 中提取内嵌的模型配置 JSON，放入 `C:\Users\lf\.codebuddy`

## 关键决策与理由

| 决策 | 理由 |
|---|---|
| 用 OpenAI 格式 `/v1/models` 查询上下文 | Anthropic 格式的 `/anthropic/v1/models` 只返回 id/display_name/created_at，**不返回**上下文字段；网关文档（docs.jucode.cn/docs/models）写明扩展字段只在 OpenAI 格式返回 |
| 结论以网关返回为准（400K）而非官方值（500K） | xAI 官方 Grok 4.6 公布 500K，但网关对当前 key 配置的是 400K——`/v1/models` 返回的是权威配置 |
| 不发送大 prompt 实测 | 会花用户账号的 token/钱，未经询问不做 |
| `.codebuddy\models.json` 采用「替换」而非合并 | 用户经 AskUserQuestion 明确选择替换（bat 的 14 个模型与现有 11 个 Buddy 模型 id 无冲突，但用户仍选替换）；替换前做了备份 |
| 写入时转换为 `{"models": [...]}` 包装格式 | bat 生成的是裸数组，CodeBuddy 识别的是包装结构；直接放裸数组可能无效 |
| API 线路取「推荐」默认线路 | bat 内含两条线路（默认 `https://work.xclawxx.top/v1` / 备用国内 `work-gz.aicodee.com`），脚本标注默认线路为推荐 |

## 工作过程时间线

- **07623210（约 2.5 分钟）**：WebFetch 不支持自定义请求头 → curl 带 key 查模型列表（无上下文信息）→ 单模型详情 404 → 官网/文档 SPA 抓取失败 → 网上查到官方 500K → 发现 docs.jucode.cn 文档说明扩展字段位置 → 调 OpenAI 格式 `/v1/models` 拿到权威值
- **1e2e586a（约 2 分钟）**：识别 bat 是逐行 echo 生成 models.json 的脚本 → sed 提取（两次踩坑：首行是单 `>` 丢失开头 `[`；`\+` 在 Git Bash 的 sed 里不生效，改用 `-E`）→ 解析出 14 个模型 → 发现目标文件已存在（11 个 Buddy 模型）→ 询问用户 → 用户选替换 → 备份 + 写入 + 验证

## 产物与影响

- **07623210**：无文件产物。结论：jucode 网关 grok-4.6 `context_window = 400,000 tokens`、`max_output_tokens = 128,000`、`reasoning_efforts = none/low/medium/high/xhigh`；同 key 下 grok-4.5、grok-composer-2.5-fast 同为 400K
- **1e2e586a**：`C:\Users\lf\.codebuddy\models.json` 替换为 14 个模型（Auto、deepseek-v4-flash、DeepSeek-V4-Flash-plus、deepseek-v4-pro、DeepSeek-V4-Pro-plus、glm-5.2/-max-stable/-stable、glm-5.3-stable、Kimi-K2.6、kimi-k3-stable、MiniMax-M2.7/-highspeed、MiniMax-M3），默认线路 `https://work.xclawxx.top/v1`；备份在 `C:\Users\lf\.codebuddy\models.json.backup-20260818`（原 11 个 Buddy 模型）

## 遇到的问题与解决

| 问题 | 解决 |
|---|---|
| Anthropic 格式模型列表没有上下文字段 | 改用 OpenAI 格式 `/v1/models`（网关文档指明扩展字段位置） |
| 官网和文档站都是 SPA，抓不到内容 | 查 docs.jucode.cn 的 Next.js 页面 + 文档说明，确定字段位置 |
| Git Bash 的 `/tmp` 与 Windows Python 路径不互通 | 改用相对路径/PowerShell 一条命令处理 |
| bat 首行用单 `>` 写文件，sed 按 `>>` 匹配丢了开头 `[` | 正则改为 `^>+`（注意 Git Bash sed 的 `\+` 不生效，用 `-E`） |
| 目标 models.json 已存在且格式不同 | 询问用户（合并 vs 替换），用户选替换；备份后再写，格式转换为 `{"models": [...]}` |

## 要点摘录

- 07623210 结论（agent）：「官方 xAI Grok 4.6 是 500K，但这个网关对当前 key 配置的是 400K。所以以 `/v1/models` 返回的 400K 为准。」
- 1e2e586a（agent）：「bat 脚本其实是给 WorkBuddy（`.workbuddy` 目录）用的，裸数组格式；用户要求放到 `.codebuddy`，需转换格式」——最终按用户选择的替换执行
- 用户选择（AskUserQuestion 回答）：「替换」

## 关联文档

- [JuCode 模型文档](https://docs.jucode.cn/docs/models)（会话中引用的外部文档）
- 无仓库内关联；属个人环境配置任务
