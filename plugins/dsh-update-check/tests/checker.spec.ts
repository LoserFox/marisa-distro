/**
 * 集成测试：apiBase 指向本地 http mock server，跑通 检查 → state 负载 →
 * dismiss 全流程；覆盖缓存窗口、隐身模式与资产形态选择。
 */
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UpdateChecker, MANUAL_CHECK_WINDOW_MS } from '../src/checker.ts'

interface MockRelease {
  tag_name: string
  draft?: boolean
  prerelease?: boolean
  body?: string
  html_url?: string
  assets?: Array<{ name: string; browser_download_url: string }>
}

let server: Server
let baseUrl: string
let requested: string[] = []
let releases: MockRelease[]

const MSI = { name: 'Marisa-DSH-windows-x64.msi', browser_download_url: 'https://example.test/marisa.msi' }
const EXE = { name: 'Marisa-DSH-windows-x64-standalone.exe', browser_download_url: 'https://example.test/marisa.exe' }

beforeEach(async () => {
  requested = []
  releases = [
    { tag_name: 'v0.1.7', draft: true, prerelease: true, body: 'draft notes' },
    {
      tag_name: 'v0.1.6', draft: false, prerelease: true, body: 'six fixes', html_url: 'https://example.test/r6',
      assets: [MSI, EXE],
    },
  ]
  server = createServer((req, res) => {
    requested.push(req.url ?? '')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(releases))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

function checker(overrides: Partial<ConstructorParameters<typeof UpdateChecker>[0]> = {}): UpdateChecker {
  return new UpdateChecker({
    repo: 'omdsh-dev/marisa-distro',
    apiBase: baseUrl,
    statePath: join(mkdtempSync(join(tmpdir(), 'dsh-update-check-')), 'state.json'),
    currentVersion: '0.1.5',
    installForm: 'standalone',
    ...overrides,
  })
}

describe('UpdateChecker integration (mock GitHub)', () => {
  it('runs check → state payload → dismiss end to end', async () => {
    const check = checker()
    const outcome = await check.check()

    expect(outcome.checked).toBe(true)
    expect(outcome.state).toMatchObject({
      currentVersion: '0.1.5',
      latest: '0.1.6',
      hasUpdate: true,
      changelog: 'six fixes',
      assets: {
        msi: 'https://example.test/marisa.msi',
        standalone: 'https://example.test/marisa.exe',
        download: 'https://example.test/marisa.exe',
      },
      dismissedVersion: null,
    })
    expect(outcome.state.lastCheckAt).not.toBeNull()
    expect(requested).toEqual([`/repos/omdsh-dev/marisa-distro/releases?per_page=5`])

    // state 负载从缓存构建，不再打网络。
    const state = await check.payload()
    expect(state).toEqual(outcome.state)

    // dismiss 记录版本；payload 携带 dismissedVersion。
    await check.dismiss('0.1.6')
    const after = await check.payload()
    expect(after.dismissedVersion).toBe('0.1.6')
    expect(requested).toHaveLength(1) // 仍然只有一次网络往返

    // 同版本重复 dismiss 幂等。
    await check.dismiss('0.1.6')
    expect((await check.payload()).dismissedVersion).toBe('0.1.6')
  })

  it('selects the MSI asset for the msi install form', async () => {
    const outcome = await checker({ installForm: 'msi' }).check()
    expect(outcome.state.assets.download).toBe('https://example.test/marisa.msi')
  })

  it('links to the release page for the dev form', async () => {
    const outcome = await checker({ installForm: 'dev' }).check()
    expect(outcome.state.assets.download).toBe('https://example.test/r6')
  })

  it('skips drafts and treats an all-draft list as no release', async () => {
    releases = [{ tag_name: 'v0.1.9', draft: true }]
    const outcome = await checker().check()
    expect(outcome.state.latest).toBeNull()
    expect(outcome.state.hasUpdate).toBe(false)
    expect(outcome.state.changelog).toBe('')
  })

  it('enforces the manual check cache window against state.json', async () => {
    const statePath = join(mkdtempSync(join(tmpdir(), 'dsh-update-check-')), 'state.json')
    const check = checker({ statePath })
    const first = await check.check()
    expect(first.checked).toBe(true)
    // lastCheckAt 刚写入：窗口内。
    expect(await check.lastCheckWithin(Date.now(), MANUAL_CHECK_WINDOW_MS)).toBe(true)
    // 新实例（重启模拟）从磁盘读缓存：窗口仍生效。
    const restarted = checker({ statePath })
    expect(await restarted.lastCheckWithin(Date.now(), MANUAL_CHECK_WINDOW_MS)).toBe(true)
  })

  it('reports outside-window after a fresh state file (time-traveled)', async () => {
    const check = checker({ now: () => Date.parse('2026-01-01T00:00:00Z') })
    await check.check()
    expect(await check.lastCheckWithin(Date.parse('2026-01-02T00:00:00Z'), MANUAL_CHECK_WINDOW_MS)).toBe(false)
  })

  it('is inert in hidden mode (empty current version): no network, no cache write', async () => {
    const hidden = checker({ currentVersion: '', installForm: 'dev' })
    const outcome = await hidden.check()
    expect(outcome.checked).toBe(false)
    expect(outcome.state).toMatchObject({ currentVersion: '', latest: null, hasUpdate: false, autoCheck: true })
    expect(requested).toHaveLength(0)
    await hidden.dismiss('0.1.6') // no-op，不抛
    await expect(hidden.lastCheckWithin(Date.now(), MANUAL_CHECK_WINDOW_MS)).resolves.toBe(false)
  })

  it('propagates GitHub API failures to the caller', async () => {
    const check = checker({ apiBase: 'http://127.0.0.1:1' })
    await expect(check.check()).rejects.toThrow()
  })
})
