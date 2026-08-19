/**
 * Phase C webui 接入 spike（design-r5 §7）：三路线可自动化子集固化。
 * T50 = 路线 2 API 子集（npm rc.1 profile + mygo panel：装载/install/plan 重复/
 * 静态账/BOM）；T51 = 路线 3 调用链坐实（0811 webui 官方插件配置窗口 bundle 零
 * mygo 引用 + settings 写操作 + mygo 状态不变）。
 * 浏览器点击渲染不在本环境能力内（无 headless browser），如实标注为断点。
 * 子进程继承回归的 NODE_OPTIONS 无网拦截；仅访问 127.0.0.1。
 * @module @r05en1cu/dsh-mygo-cli/tests/webui-spike
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const CHECKOUT = process.env.DSH_CHECKOUT ?? '/home/rosen/workspace/dsh_dev/test-r05En1cU-0811'
// mygo 仓库根（P3 自包含 workspace；mygo 三包与面板以仓库为准，不再经 checkout 同步）。
const MYGO_REPO = fileURLToPath(new URL('../../../..', import.meta.url))
const NPM_RC1 = process.env.DSH_NPM_RC1 ?? '/home/rosen/.npm/_npx/f78199ae95006ae9/node_modules/@deepseek-ai'
const RC1_BIN = join(NPM_RC1, 'dsh', 'lib', 'bin.js')
const C811_BIN = join(CHECKOUT, 'apps', 'cli', 'lib', 'bin.js')
const ENV_OK = existsSync(RC1_BIN) && existsSync(C811_BIN) && existsSync(CHECKOUT)

const homes: string[] = []
const children: ChildProcess[] = []

afterAll(() => {
  for (const child of children) child.kill()
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

function spikeHome(tag: string): string {
  const home = mkdtempSync(join(tmpdir(), `mygo-spike-${tag}-`))
  homes.push(home)
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  mkdirSync(join(home, 'profiles', 'node_modules', '@deepseek-ai'), { recursive: true })
  mkdirSync(join(home, 'profiles', 'node_modules', '@r05en1cu'), { recursive: true })
  mkdirSync(join(home, 'profiles', 'node_modules', '@dsh-external'), { recursive: true })
  mkdirSync(join(home, 'storages'), { recursive: true })
  return home
}

function writeProfile(home: string): void {
  writeFileSync(join(home, 'profiles', 'web', 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2) + '\n')
  writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
    '# mygo spike wiring',
    '- id: storage-domain',
    '  config:',
    '    backend: json',
    '    routes:',
    '      plugin_registry_web: sqlite',
    '- insert:',
    "    - id: storage-sqlite",
    "      name: '@deepseek-ai/dsh-storage-sqlite'",
    '      config:',
    "        path: !!js dshHomePath('storages/registry.sqlite')",
    '        journalMode: wal',
    "    - id: dsh-mygo",
    "      name: '@r05en1cu/dsh-mygo'",
    '      config:',
    '        profile: web',
    "    - id: dsh-mygo-panel",
    "      name: '@r05en1cu/dsh-mygo-ext-panel'",
    '      config: {}',
    '',
  ].join('\n'))
  writeFileSync(join(home, 'profiles', 'web', 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
}

function linkMygo(home: string): void {
  const pairs: readonly [string, string][] = [
    // 新 scope（P2 迁移后 mygo 三包）。
    [join(home, 'profiles', 'node_modules', '@r05en1cu', 'dsh-mygo'), join(MYGO_REPO, 'packages', 'cordis', 'mygo')],
    [join(home, 'profiles', 'node_modules', '@r05en1cu', 'dsh-mygo-api'), join(MYGO_REPO, 'packages', 'core', 'mygo-api')],
    [join(home, 'profiles', 'node_modules', '@r05en1cu', 'dsh-mygo-cli'), join(MYGO_REPO, 'packages', 'cordis', 'mygo-cli')],
    [join(home, 'profiles', 'node_modules', '@r05en1cu', 'dsh-mygo-ext-panel'), join(MYGO_REPO, 'packages', 'extensions', 'mygo-panel')],
    // 宿主侧包（storage-sqlite 等）仍链接 0811 checkout。
    [join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-storage-sqlite'), join(CHECKOUT, 'packages', 'storage', 'storage-sqlite')],
  ]
  for (const [link, target] of pairs) {
    try {
      symlinkSync(target, link, 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

async function freePort(): Promise<number> {
  const net = await import('node:net')
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address !== null && typeof address === 'object') {
        const port = (address as { port: number }).port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('no port')))
      }
    })
  })
}

async function waitHttp(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return
    } catch {
      // boot in progress
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`web 未在 ${timeoutMs}ms 内就绪（port ${port}）`)
}

async function bootWeb(bin: string, home: string, port: number): Promise<void> {
  const child = spawn(process.execPath, [bin, 'web', '--port', String(port)], {
    cwd: '/tmp',
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stderr?.on('data', chunk => process.stderr.write(`[spike:${port}] ${String(chunk)}`))
  await waitHttp(port)
}

async function rpc<T>(port: number, method: string, payload: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `spike-${Math.random()}`, method, payload }),
  })
  const json = await response.json() as { result: T }
  return json.result
}

async function getJson<T>(port: number, path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  return await response.json() as T
}

async function postJson<T>(port: number, path: string, payload: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await response.json() as T
}

describe.skipIf(!ENV_OK)('Phase C webui spike（T50/T51）', () => {
  it('T50 路线 2：npm rc.1 profile + mygo panel 装载/install/plan 重复/静态账/BOM', async () => {
    const home = spikeHome('t50')
    writeProfile(home)
    linkMygo(home)
    const port = await freePort()
    await bootWeb(RC1_BIN, home, port)

    const root = await fetch(`http://127.0.0.1:${port}/`)
    expect(root.ok).toBe(true)
    const html = await root.text()
    expect(html).toContain('/plugins/@r05en1cu/dsh-mygo-ext-panel/client.js')

    const planPayload = {
      method: 'folder',
      path: join(MYGO_REPO, 'packages', 'cordis', 'mygo-cli'),
      installDeps: false,
    }
    const plan1 = await postJson<{ ok: boolean; id: string; plan: { accepted: boolean } }>(port, '/api/mygo/install-plan', planPayload)
    const plan2 = await postJson<{ ok: boolean; id: string; plan: { accepted: boolean } }>(port, '/api/mygo/install-plan', planPayload)
    expect(plan1).toEqual(plan2)
    expect(plan1).toMatchObject({ ok: true, id: 'dsh-mygo-cli', plan: { accepted: true } })

    const installed = await postJson<{ ok: boolean; id: string; message: string }>(port, '/api/mygo/install', planPayload)
    expect(installed.ok, JSON.stringify(installed)).toBe(true)
    expect(installed.id).toBe('dsh-mygo-cli')

    const plugins = await getJson<{ ok: boolean; plugins: readonly { id: string; status: string }[] }>(port, '/api/mygo/plugins')
    expect(plugins.plugins.some(item => item.id === 'dsh-mygo-cli' && item.status === 'enabled')).toBe(true)

    const patch = await import('node:fs/promises').then(fs => fs.readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8'))
    expect(patch).toContain('dsh-mygo-cli-mygo')
    expect(patch).toContain("name: '@r05en1cu/dsh-mygo-cli-mygo'")

    const again = await postJson<{ ok: boolean; error: string }>(port, '/api/mygo/install', planPayload)
    expect(again.ok).toBe(false)
    expect(again.error).toContain('已安装')

    const bom = await postJson<{ ok: boolean; jsonPath: string; mdPath: string }>(port, '/api/mygo/bom/export', {})
    expect(bom.ok).toBe(true)
    expect(existsSync(bom.jsonPath)).toBe(true)
    expect(existsSync(bom.mdPath)).toBe(true)
  }, 90_000)

  it('T51 路线 3：0811 官方插件配置窗口调用链 — settings 面、零 mygo 引用、写操作不影响 mygo', async () => {
    const home = spikeHome('t51')
    writeProfile(home)
    linkMygo(home)
    const port = await freePort()
    await bootWeb(C811_BIN, home, port)

    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text()
    const bundleMatch = /\/plugins\/@deepseek-ai\/dsh-client-ui-plugin-config\/client\.js\?rev=[a-f0-9]+/.exec(html)
    expect(bundleMatch).not.toBeNull()
    const bundle = await (await fetch(`http://127.0.0.1:${port}${bundleMatch?.[0] ?? ''}`)).text()
    expect(bundle).toContain('settings.plugin.item')
    expect(bundle).not.toContain('pluginManager')
    expect(bundle).not.toContain('/api/mygo')

    const describe = await rpc<{ ok: boolean; value: { namespaces: readonly { ns: string; value?: unknown; revision: number }[] } }>(port, 'settings.describe', {})
    expect(describe.ok).toBe(true)
    const agentLoop = describe.value.namespaces.find(item => item.ns === 'agent-loop')
    expect(agentLoop).toBeDefined()
    const before = agentLoop?.revision ?? 0

    const beforePlugins = await getJson<{ ok: boolean; plugins: readonly unknown[] }>(port, '/api/mygo/plugins')
    const replace = await rpc<{ ok: boolean }>(port, 'settings.replace', {
      ns: 'agent-loop',
      section: { maxParallelToolCalls: 10 },
    })
    expect(replace.ok).toBe(true)
    const describeAfter = await rpc<{ ok: boolean; value: { namespaces: readonly { ns: string; revision: number }[] } }>(port, 'settings.describe', {})
    const afterRevision = describeAfter.value.namespaces.find(item => item.ns === 'agent-loop')?.revision
    expect(afterRevision).toBe(before + 1)

    const afterPlugins = await getJson<{ ok: boolean; plugins: readonly unknown[] }>(port, '/api/mygo/plugins')
    expect(afterPlugins).toEqual(beforePlugins)
  }, 90_000)
})
