# dsh-model-proxy

让 DSH 的模型/联网搜索/文件上传请求透明地走本地 SOCKS5/HTTP 代理。

原理：harness 的 LLM 适配器（`llm-deepseek` 等）直接调用全局 `fetch`。Node 18+
的全局 fetch 由 undici 提供、遵循 undici 全局 dispatcher（7.x 用
`Symbol.for('undici.globalDispatcher.2')`，`.1` 是 legacy）。本插件在
`apply()` 时把该 dispatcher 换成自定义 `undici.Agent`，其 `connect`（回调
契约）先建立到上游代理的 SOCKS5 / HTTP(S) CONNECT 隧道，https 目标再由
connector 自行完成 TLS，于是所有全局 fetch 透明走代理——

- 不需要改 `DEEPSEEK_BASE_URL`，不需要本地转发进程；
- 模型请求、`DEEPSEEK_SEARCH_BASE_URL` 联网搜索、文件上传一起覆盖；
- Agent 通过 tool call 启动的 `pwsh` / `bash` 子进程继承同一个 `HTTP_PROXY`；
- `localhost` / `127.0.0.1` / `::1` 与 `NO_PROXY` 命中项恒直连；
- 卸载（dispose）时恢复原 dispatcher，无残留。

## 配置

插件配置（profile 的 cordis.yml 里给本插件配 config 即可），全部可选：

| 字段 | 含义 | 默认 |
|---|---|---|
| `proxy` | 上游代理 URL：`socks5://`、`socks5h://`、`http://`、`https://`（可带 `user:pass`），或 `direct` | 读 `HTTP_PROXY` → `HTTPS_PROXY` → `ALL_PROXY`；都没有时用 `http://127.0.0.1:10808` |
| `noProxy` | 命中则直连的主机列表（追加到环境变量 `NO_PROXY` 之上） | `[]` |

环境变量示例（pwsh `$PROFILE`）：

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:10808'
```

显式配置 `direct` 时插件不做任何事。代理 URL 非法时记 warning 并保持直连。
插件不会设置或改写 `DEEPSEEK_BASE_URL`：DeepSeek endpoint 始终由适配器保持为
`https://api.deepseek.com`（除非用户自己在模型设置中覆盖）。

插件会把最终解析出的代理写入宿主进程的 `HTTP_PROXY`，因此 DSH 的本地
subprocess seam 会把它保留给 Agent 发起的 `pwsh` / `bash` tool call。插件卸载时
恢复原环境值。代理 URL 可能携带认证信息，因此启用该行为意味着模型启动的
本地子进程可以读取该代理配置；它不会得到模型 API key。

## 验证

```bash
pnpm --filter dsh-model-proxy run build
node --test plugins/dsh-model-proxy/tests/
```

测试含假 SOCKS5/HTTP 代理 + 假上游，真实走 undici 全局 dispatcher 断言
隧道路径与 NO_PROXY 直连路径，并断言子进程继承 `HTTP_PROXY`、
`DEEPSEEK_BASE_URL` 不被改写（不依赖外网）。
