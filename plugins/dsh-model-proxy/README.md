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
- `localhost` / `127.0.0.1` / `::1` 与 `NO_PROXY` 命中项恒直连；
- 卸载（dispose）时恢复原 dispatcher，无残留。

## 配置

插件配置（profile 的 cordis.yml 里给本插件配 config 即可），全部可选：

| 字段 | 含义 | 默认 |
|---|---|---|
| `proxy` | 上游代理 URL：`socks5://`、`socks5h://`、`http://`、`https://`（可带 `user:pass`），或 `direct` | 读环境变量 `MODEL_PROXY` → `ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY` |
| `noProxy` | 命中则直连的主机列表（追加到环境变量 `NO_PROXY` 之上） | `[]` |

环境变量示例（pwsh `$PROFILE`）：

```powershell
$env:MODEL_PROXY = 'socks5://127.0.0.1:10808'
```

留空或 `direct` 时插件不做任何事（直连）。代理 URL 非法时记 warning 并保持直连。

## 与 tools/model-proxy 的关系

- 本插件 = 进程内透明代理，只影响 DSH 自身进程的全局 fetch；
- `tools/model-proxy` = 独立本地转发代理（relay/CONNECT），给 curl、git 等
  任意客户端用，也可配合 `DEEPSEEK_BASE_URL` 给 DSH 用。
- 两者互不依赖；若同时使用，模型请求会先命中插件（loopback 直连）到本地
  relay 再转发，多一跳但可用。推荐二选一。

## 验证

```bash
pnpm --filter dsh-model-proxy run build
node --test plugins/dsh-model-proxy/tests/
```

测试含假 SOCKS5/HTTP 代理 + 假上游，真实走 undici 全局 dispatcher 断言
隧道路径与 NO_PROXY 直连路径（不依赖外网）。
