# dsh-auth — DSH WebUI 登录系统

为 DSH WebUI 增加认证层（Marisa 发行内插件）：

- **`/auth/*` 路由**：`GET /auth/login`（服务端渲染登录页）、`POST /auth/login`、`POST /auth/logout`、`GET /auth/session`
- **`/api` 硬门**：经 harness 本地缝线（`client-connection` 的 /api route handler 检查可选 `dshAuth` 服务）——未认证请求 401，认证后放行
- **UI 软门**：`tapIndex` 注入登录门脚本，未认证自动跳登录页
- **会话**：HttpOnly Cookie（`dsh_sid`）+ 服务端随机 token（可即时撤销）
- **用户表**：JSON 文件（scrypt 加盐哈希、恒定时间比较、原子写）；`seedAdmin` 首次启动生成随机密码打印到日志

## 配置（cordis.patch.yml insert 行 config）

| 键 | 默认 | 说明 |
|---|---|---|
| usersFile | `~/.dsh/auth/users.json` | 用户表路径 |
| sessionTtlMinutes | 720 | 会话有效期 |
| cookieName | `dsh_sid` | Cookie 名 |
| cookieSecure | false | 反代 TLS 下设 true |
| protectApi | true | /api 硬门 |
| protectUi | true | tapIndex 软门 |
| seedAdmin | true | 首次启动生成 admin 随机密码 |

## 依赖的 harness 本地缝线

`packages/client/connection/src/index.ts`（+ lib/index.js）的 /api route handler 增加：

```ts
const auth = ctx.get('dshAuth', false)
if (auth !== undefined && auth !== false && typeof auth.checkHttp === 'function') {
  const verdict = auth.checkHttp(req)
  if (verdict === false) { res.writeHead(401); res.end('unauthorized'); return }
}
```

未安装 dsh-auth 时 `ctx.get('dshAuth', false)` 返回 undefined → 原样转发（官方行为零影响）。

## 设计文档

`/root/research/reports/dsh-plugins/dsh-auth-design.md`（完整架构：三层组合、反代、风险）
