// 门禁自证：verify-routes-sync 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-routes-sync.mjs'

const ROUTES_SRC = `export const ROUTE_PREFIX = '/whale-girl'
export const STATE_PATH = \`\${ROUTE_PREFIX}/state\`
export const INTERACT_PATH = \`\${ROUTE_PREFIX}/interact\`
export const CONFIG_PATH = \`\${ROUTE_PREFIX}/config\`
export const ASSETS_PATH = \`\${ROUTE_PREFIX}/assets\``

function makeTree({ routes = ROUTES_SRC, client = OK.client, node = OK.node, assets = OK.assets } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vrsync-'))
  const mk = (rel, content) => {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  mk('.dsh-plugin/src/routes.mjs', routes)
  mk('.dsh-plugin/client/index.mjs', client)
  mk('.dsh-plugin/index.mjs', node)
  mk('.dsh-plugin/src/assets.mjs', assets)
  return root
}

const IMPORT = "import { STATE_PATH } from '../src/routes.mjs'"
const OK = {
  client: `${IMPORT}\nconst x = 1`,
  node: "import { STATE_PATH } from './src/routes.mjs'\nconst x = 1",
  assets: "import { ASSETS_PATH } from './routes.mjs'\nconst x = 1",
}

test('接受：三个消费文件都 import 自 routes.mjs、无字面量', () => {
  const { ok, errors } = check(makeTree(OK))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：client 手写路由字面量（单一来源被破坏）', () => {
  const { ok, errors } = check(makeTree({ client: "const STATE_PATH = '/whale-girl/state'" }))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /client\/index\.mjs 手写路由前缀字面量/)
})

test('拒绝：index.mjs 未从 routes.mjs import（端点散落）', () => {
  const { ok, errors } = check(makeTree({ node: "export const STATE_PATH = '/whale-girl/state'" }))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /index\.mjs 未从 src\/routes\.mjs import|index\.mjs 手写路由前缀字面量/)
})

test('拒绝：src/routes.mjs 缺 ROUTE_PREFIX（单一来源缺失）', () => {
  const { ok, errors } = check(makeTree({ routes: 'export const x = 1' }))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /未定义 ROUTE_PREFIX/)
})
