/**
 * dsh-auth — DSH WebUI 登录系统（Marisa 发行）
 *
 * 为 DSH WebUI 增加认证层：/auth/* 登录路由 + /api 硬门（经 gateway
 * guard 缝线，官方 harness 无 auth 时零影响）+ tapIndex 登录门软门。
 *
 * 设计依据：/root/research/reports/dsh-plugins/dsh-auth-design.md
 *   - webServer 无中间件：路由是叶子，/api 的 interceptor 位被官方
 *     gateway 占用 → 魔理沙本地 patch gateway 增加可选 guard 缝线
 *     （dshAuth 服务缺失时原样转发，官方语义不变）
 *   - 会话：HttpOnly Cookie + 服务端随机 token（可即时撤销）
 *   - 用户表：JSON 文件（scrypt 加盐哈希，恒定时间比较，原子写）
 *   - UI 门：tapIndex 注入自包含脚本（软门）+ 服务端渲染登录页
 *
 * 纯 ESM，零依赖（Node 内置 crypto/fs/http），无构建步骤。
 *
 * @module dsh-auth
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

/** Stable Cordis plugin name. */
export const name = 'dsh-auth'

/** Required services: the web server (for /auth routes + tapIndex). */
export const inject = ['webServer']

const DEFAULTS = {
  usersFile: join(homedir(), '.dsh', 'auth', 'users.json'),
  sessionTtlMinutes: 720,
  cookieName: 'dsh_sid',
  cookieSecure: false,
  protectApi: true,
  protectUi: true,
  seedAdmin: true,
  whitelist: ['/auth/login', '/auth/session', '/auth/logout'],
}

/** Resolve config with defaults. */
function resolveConfig(config = {}) {
  return { ...DEFAULTS, ...config }
}

// ---------------------------------------------------------------------------
// users store (JSON, scrypt-hashed passwords, atomic writes)
// ---------------------------------------------------------------------------

function loadUsers(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function saveUsers(file, users) {
  const tmp = `${file}.tmp-${randomBytes(4).toString('hex')}`
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(tmp, JSON.stringify(users, null, 2))
  renameSync(tmp, file)
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = scryptSync(password, salt, 64)
    const expected = Buffer.from(expectedHash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// session store (in-memory; token -> { userId, exp })
// ---------------------------------------------------------------------------

function createSessionStore(ttlMs) {
  const sessions = new Map()
  return {
    create(userId) {
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { userId, exp: Date.now() + ttlMs })
      return token
    },
    get(token) {
      const s = sessions.get(token)
      if (!s) return null
      if (Date.now() > s.exp) {
        sessions.delete(token)
        return null
      }
      return s
    },
    revoke(token) {
      sessions.delete(token)
    },
  }
}

// ---------------------------------------------------------------------------
// cookie helpers
// ---------------------------------------------------------------------------

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
  }
  return out
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

// ---------------------------------------------------------------------------
// login page (server-rendered, self-contained; works even if client plugins
// fail to load)
// ---------------------------------------------------------------------------

function loginPageHtml(cfg) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · dsh</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f1115; color: #e6e6e6;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #171a21; border: 1px solid #2a2f3a; border-radius: 12px; padding: 40px 36px;
          width: 340px; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
  h1 { font-size: 20px; margin-bottom: 6px; }
  p.sub { color: #8b93a3; font-size: 13px; margin-bottom: 24px; }
  label { display: block; font-size: 13px; color: #aab2c0; margin: 14px 0 6px; }
  input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2f3542;
          background: #0f1115; color: #e6e6e6; font-size: 14px; outline: none; }
  input:focus { border-color: #4c8dff; }
  button { width: 100%; margin-top: 24px; padding: 11px; border-radius: 8px; border: none;
           background: #4c8dff; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
  button:hover { background: #3d7ae8; }
  .error { color: #ff6b6b; font-size: 13px; margin-top: 14px; min-height: 18px; }
  .hint { color: #5c6472; font-size: 12px; margin-top: 18px; text-align: center; }
</style>
</head>
<body>
  <form class="card" id="f">
    <h1>dsh WebUI 登录</h1>
    <p class="sub">请使用管理员分配的账号登录</p>
    <label for="u">用户名</label>
    <input id="u" name="username" autocomplete="username" autofocus required>
    <label for="p">密码</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">登 录</button>
    <div class="error" id="err"></div>
    <div class="hint">登录后自动进入工作区</div>
  </form>
  <script>
    const f = document.getElementById('f');
    const err = document.getElementById('err');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const r = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: f.username.value, password: f.password.value }),
        });
        const d = await r.json();
        if (d.ok) {
          const ret = new URLSearchParams(location.search).get('returnUrl') || '/';
          location.href = ret;
        } else {
          err.textContent = d.error || '登录失败';
        }
      } catch (ex) {
        err.textContent = '网络错误';
      }
    });
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// plugin apply
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  const users = loadUsers(cfg.usersFile)
  const sessions = createSessionStore(cfg.sessionTtlMinutes * 60_000)

  // ---- seed admin ----------------------------------------------------------
  if (cfg.seedAdmin && !users.admin) {
    const password = randomBytes(9).toString('base64url')
    users.admin = { role: 'admin', ...hashPassword(password) }
    saveUsers(cfg.usersFile, users)
    console.log(`[dsh-auth] 初始管理员已创建: admin / ${password}（请尽快修改）`)
  }

  // ---- auth helpers ---------------------------------------------------------
  function currentUser(req) {
    const token = parseCookies(req.headers.cookie)[cfg.cookieName]
    if (!token) return null
    const s = sessions.get(token)
    if (!s) return null
    const u = users[s.userId]
    return u ? { name: s.userId, role: u.role } : null
  }

  function isWhitelisted(pathname) {
    return cfg.whitelist.some((w) => pathname === w || pathname.startsWith(`${w}/`))
  }

  // ---- /auth/* routes --------------------------------------------------------
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/auth',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname
      const method = req.method

      if (method === 'GET' && path === '/auth/login') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(loginPageHtml(cfg))
        return
      }

      if (method === 'POST' && path === '/auth/login') {
        const body = await readBody(req)
        const { username, password } = body
        const user = typeof username === 'string' ? users[username] : undefined
        if (!user || !verifyPassword(String(password ?? ''), user.salt, user.hash)) {
          sendJson(res, 401, { ok: false, error: '用户名或密码错误' })
          return
        }
        const token = sessions.create(username)
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `${cfg.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${cfg.cookieSecure ? '; Secure' : ''}`,
        })
        res.end(JSON.stringify({ ok: true, user: { name: username, role: user.role } }))
        return
      }

      if (method === 'POST' && path === '/auth/logout') {
        const token = parseCookies(req.headers.cookie)[cfg.cookieName]
        if (token) sessions.revoke(token)
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `${cfg.cookieName}=; Path=/; HttpOnly; Max-Age=0${cfg.cookieSecure ? '; Secure' : ''}`,
        })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (method === 'GET' && path === '/auth/session') {
        const user = currentUser(req)
        sendJson(res, 200, user ? { authenticated: true, user } : { authenticated: false })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not found' })
    },
  }), 'dsh-auth: /auth routes')

  // ---- /api hard gate (HTTP layer, consumed by the rpc-host seam) -------------
  ctx.provide('dshAuth', {
    checkHttp: (req) => {
      if (!cfg.protectApi) return true
      // Whitelisted paths bypass the gate (e.g. future public endpoints).
      const url = new URL(req.url, 'http://localhost')
      if (isWhitelisted(url.pathname)) return true
      return currentUser(req) !== null
    },
  })

  // ---- UI soft gate (tapIndex) ------------------------------------------------
  if (cfg.protectUi) {
    ctx.effect(() => ctx.webServer.tapIndex((html) => {
      const script = `<script>
(function () {
  fetch('/auth/session', { credentials: 'same-origin' })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (!d.authenticated) {
        location.replace('/auth/login?returnUrl=' + encodeURIComponent(location.pathname + location.search));
      }
    })
    .catch(function () {});
})();
</script>`
      return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : html + script
    }), 'dsh-auth: tapIndex login gate')
  }
}
