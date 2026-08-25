# model-proxy — 让模型请求走代理的小东西

零依赖（仅 Node 标准库）的本地模型请求转发代理。DSH / 任何 OpenAI 兼容客户端的
模型请求 → 本地转发代理 → 你的 socks5/http 代理 → 模型 API。

代理默认值写进 pwsh `$PROFILE`（或用户级环境变量），新终端自动生效。

## 原理

```
DSH (DEEPSEEK_BASE_URL=http://127.0.0.1:8787/v1)
        │  HTTP（相对路径 /v1/chat/completions）
        ▼
model-proxy (127.0.0.1:8787)  ── relay 模式
        │  SOCKS5/HTTP CONNECT 隧道（MODEL_PROXY）
        ▼
socks5://127.0.0.1:10808 (xray/clash/v2ray…)
        │
        ▼
https://api.deepseek.com（或其他 target）
```

两种工作模式，同一端口：

| 模式 | 触发 | 用途 |
|---|---|---|
| relay | 请求行是相对路径，或绝对 URL | DSH 接线：`DEEPSEEK_BASE_URL` 指向本地代理，路径/查询/请求头/SSE 流式/文件上传全部透传 |
| CONNECT | `CONNECT host:port` 隧道请求 | 任意 HTTP 客户端把它当普通正向代理用 |

上游代理支持 `socks5://`、`socks5h://`（域名交给代理解析）、`http://`、
`https://`，可带 `user:pass`；目标命中 `NO_PROXY` 时直连。

## 快速开始

```powershell
# 1. 安装 shell 默认配置（写进 $PROFILE，新终端生效）
pwsh -NoProfile -File tools\model-proxy\install-profile.ps1

# 2. 启动本地代理（$PROFILE 里的函数，或手动）
Start-ModelProxy            # 等价于：node tools\model-proxy\model-proxy.mjs

# 3. 验证
curl.exe http://127.0.0.1:8787/__status     # 返回 JSON，proxy 字段 = 你的代理
curl.exe http://127.0.0.1:8787/v1/models    # 拿到 401/418 = 隧道已通（无 key 被 API 拒绝）
```

装完后**新开一个终端**：`$env:DEEPSEEK_BASE_URL` 已指向本地代理，
`dsh` CLI 的模型请求自动走代理。桌面应用（从开始菜单启动）不读 `$PROFILE`，
需要用户级变量：

```powershell
pwsh -NoProfile -File tools\model-proxy\install-profile.ps1 -UserScope
```

## 配置项

优先级：命令行参数 > 环境变量 > 默认值。

| 来源 | 含义 | 默认 |
|---|---|---|
| `--proxy` / `$env:MODEL_PROXY` | 上游代理 URL（`direct`=直连） | 回退 `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY` |
| `--target` / `$env:MODEL_PROXY_TARGET` | 上游 API origin（relay 目标） | `https://api.deepseek.com` |
| `--port` / `$env:MODEL_PROXY_PORT` | 监听端口 | `8787` |
| `--host` / `$env:MODEL_PROXY_HOST` | 监听地址 | `127.0.0.1` |
| `$env:NO_PROXY` | 命中则直连（逗号分隔，支持 `.后缀` 与 `host:port`） | 继承系统 |
| `--quiet` | 关逐请求日志 | |
| `--status` / `--check` | 打印配置 / 连通性自检 | |

DSH 相关：

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_BASE_URL` | 设为 `http://127.0.0.1:8787/v1`，模型请求经本地代理 |
| `DEEPSEEK_SEARCH_BASE_URL` | 联网搜索同法（`http://127.0.0.1:8787`，默认注释掉） |

> **为什么写在 profile 而不是 .env**：DSH 的 boot 层把 `HTTP_PROXY` /
> `HTTPS_PROXY` / `ALL_PROXY` / `DEEPSEEK_BASE_URL` 列为「只能由启动环境提供」
> 的变量，`.env` 里写会直接拒绝启动（`app-boot/src/index.ts` 的
> `BOOTSTRAP_NAMES`）。shell 默认参数正是它的合法来源。

## 验证 / 排障

```powershell
node tools\model-proxy\model-proxy.mjs --check    # 经代理对 target 发一次 GET
node tools\model-proxy\test.mjs                   # 本地假上游全量自测（不依赖外网）
node tools\model-proxy\test.mjs --tunnel socks5://127.0.0.1:10808 https://api.deepseek.com
```

- **401/418**：隧道通了，只是没带 API key——这是预期结果。
- **502 Bad Gateway**：上游代理没开、代理地址错，或目标主机不可达（看代理日志的 ✗ 行）。
- **`MODEL_PROXY_DEBUG=1`** 打开握手/TLS 调试日志。
- 换了代理：改 `$PROFILE` 里的 `MODEL_PROXY` 或 `install-profile.ps1 -Proxy <url>` 重装。

## 卸载

```powershell
pwsh -NoProfile -File tools\model-proxy\install-profile.ps1 -Uninstall          # 移除 $PROFILE 配置块
pwsh -NoProfile -File tools\model-proxy\install-profile.ps1 -Uninstall -UserScope
```

## 文件

| 文件 | 说明 |
|---|---|
| `model-proxy.mjs` | 代理本体（纯 Node 标准库，约 600 行） |
| `install-profile.ps1` | $PROFILE / 用户级变量 安装卸载 |
| `test.mjs` | 自测（假上游 + 可选真实隧道 e2e） |

## 备注

- 只监听 127.0.0.1，不对外暴露；`--host 0.0.0.0` 会把一个无鉴权代理暴露给局域网，谨慎。
- Node ≥ 18 即可运行（实测 v26.4）。
- Node 24+ 自带实验性 `--use-env-proxy`（让全局 fetch 读代理环境变量），但需要给
  后端进程注入启动参数，DSH 桌面端做不到；本工具的 relay 模式不依赖任何 Node 内部机制。
