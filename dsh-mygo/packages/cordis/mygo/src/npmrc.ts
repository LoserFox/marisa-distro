/**
 * profile `.npmrc` 受管写入器（rc8 P1）：registry 映射 + auth 引用绑定。
 * 机密零携带——受管块内只写 `${REF}` 占位（POSIX 环境变量形状，官方
 * credentials 语义：配置只携带对机密的引用），值在 `$DSH_HOME/
 * .credentials.yaml`，spawn 时由 registry-auth 桥进子进程 env。
 *
 * 受管块形态（ini；.npmrc 无 YAML 数组占位坑，空文件合法但 mygo 删块
 * 后不留空文件）：
 *
 * ```
 * # >>> mygo registry auth
 * @my-scope:registry=https://npm.example.com
 * //npm.example.com/:_authToken=${MY_SCOPE_TOKEN}
 * # <<< mygo registry auth
 * ```
 *
 * 块外用户行逐字节不动；块内为 mygo 受管（用户手写内容在下次 upsert
 * 时被覆盖）。全部写盘原子（tmp+rename）。
 * @module @r05en1cu/dsh-mygo/src/npmrc
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 受管块标记（单事实源；测试与清理同口径）。 */
export const NPMRC_BLOCK_BEGIN = '# >>> mygo registry auth'
export const NPMRC_BLOCK_END = '# <<< mygo registry auth'

/** 一条 registry 绑定（scope → registry URL + 可选 auth 引用）。 */
export interface RegistryBinding {
  readonly scope: string
  readonly registry: string
  /** auth 引用名（credentials ref = POSIX 环境变量名；无 auth 为 undefined）。 */
  readonly authRef?: string | undefined
}

/** scope 形态（npm scope：`@` 前缀小写段）。 */
const SCOPE_RE = /^@[a-z0-9][a-z0-9._-]*$/
/** auth 引用名（credentials ref = POSIX 环境变量名）。 */
const AUTH_REF_RE = /^[A-Z_][A-Z0-9_]*$/
const REGISTRY_LINE_RE = /^(@[a-z0-9][a-z0-9._-]*):registry=(\S+)$/
const AUTH_LINE_RE = /^\/\/(\S+)\/:(_authToken|_auth|token|username|_password)=\$\{([A-Z_][A-Z0-9_]*)\}$/
const REF_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g

/** 读 profile .npmrc 文本（缺失按空文档计）。 */
export function readNpmrc(profileDir: string): string {
  const path = join(profileDir, '.npmrc')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/** 受管块行区间（无块 → undefined）。 */
function blockSpan(lines: readonly string[]): { readonly start: number; readonly end: number } | undefined {
  const start = lines.indexOf(NPMRC_BLOCK_BEGIN)
  if (start === -1) return undefined
  const end = lines.indexOf(NPMRC_BLOCK_END, start)
  return { start, end: end === -1 ? lines.length : end + 1 }
}

/** 解析受管块内的 registry 绑定（块外行不看）。 */
export function listRegistries(profileDir: string): readonly RegistryBinding[] {
  const lines = readNpmrc(profileDir).split('\n')
  const span = blockSpan(lines)
  if (span === undefined) return []
  const bindings: RegistryBinding[] = []
  for (const line of lines.slice(span.start + 1, span.end - 1)) {
    const registryMatch = REGISTRY_LINE_RE.exec(line.trim())
    if (registryMatch !== null) {
      bindings.push({ scope: registryMatch[1] ?? '', registry: registryMatch[2] ?? '' })
      continue
    }
    const authMatch = AUTH_LINE_RE.exec(line.trim())
    if (authMatch !== null && bindings.length > 0) {
      // auth 行归属最后一个绑定（host 匹配校验：不一致则不挂——写回时按
      // 绑定重建，松散行自然脱落）。
      const host = authMatch[1]
      const last = bindings[bindings.length - 1]
      if (last !== undefined && hostOf(last.registry) === host) {
        bindings[bindings.length - 1] = { ...last, authRef: authMatch[3] }
      }
    }
  }
  return bindings
}

/** 受管块内全部 `${REF}` 占位（出现序去重；env 桥收集用）。 */
export function collectAuthRefs(profileDir: string): readonly string[] {
  const lines = readNpmrc(profileDir).split('\n')
  const span = blockSpan(lines)
  if (span === undefined) return []
  const refs: string[] = []
  for (const line of lines.slice(span.start + 1, span.end - 1)) {
    for (const match of line.matchAll(REF_RE)) {
      const ref = match[1]
      if (ref !== undefined && !refs.includes(ref)) refs.push(ref)
    }
  }
  return refs
}

function hostOf(registry: string): string | undefined {
  try {
    return new URL(registry).host
  } catch {
    return undefined
  }
}

/** 受管块文本重建（绑定序保持；auth 行跟随其绑定）。 */
function renderBlock(bindings: readonly RegistryBinding[]): string[] {
  const lines: string[] = [NPMRC_BLOCK_BEGIN]
  for (const binding of bindings) {
    lines.push(`${binding.scope}:registry=${binding.registry}`)
    if (binding.authRef !== undefined) {
      lines.push(`//${hostOf(binding.registry) ?? ''}/:_authToken=\${${binding.authRef}}`)
    }
  }
  lines.push(NPMRC_BLOCK_END)
  return lines
}

/**
 * 受管写盘：读 → mutator 纯函数变换绑定列表 → 重建受管块（块外用户行
 * 不动）→ tmp+rename 原子写。变换结果为空且无块外内容时删除文件
 * （不留空 .npmrc）。返回是否实际写入/删除。
 */
export function mutateNpmrc(
  profileDir: string,
  mutator: (bindings: readonly RegistryBinding[]) => readonly RegistryBinding[],
): boolean {
  const path = join(profileDir, '.npmrc')
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = text.split('\n')
  const span = blockSpan(lines)
  const before = span === undefined ? [] : lines.slice(0, span.start)
  const after = span === undefined ? lines : lines.slice(span.end)
  const next = mutator(listRegistries(profileDir))
  const parts = [...before, ...(next.length === 0 ? [] : renderBlock(next)), ...after]
  const body = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (body === '') {
    if (!existsSync(path)) return false
    rmSync(path)
    return true
  }
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${body}\n`, 'utf8')
  renameSync(tmp, path)
  return true
}

/**
 * 新增/覆盖一条 registry 绑定（同 scope 整体替换）。registry 必须是合法
 * URL；authRef 必须是 POSIX 环境变量名（credentials ref 形状）。
 */
export function upsertRegistry(
  profileDir: string,
  scope: string,
  registry: string,
  authRef?: string,
): { readonly ok: boolean; readonly error?: string | undefined } {
  if (!SCOPE_RE.test(scope)) return { ok: false, error: `非法 scope：${scope}（应形如 @my-scope）` }
  if (hostOf(registry) === undefined) return { ok: false, error: `非法 registry URL：${registry}` }
  if (authRef !== undefined && !AUTH_REF_RE.test(authRef)) {
    return { ok: false, error: `非法 auth 引用名：${authRef}（应形如 MY_SCOPE_TOKEN）` }
  }
  mutateNpmrc(profileDir, (bindings) => {
    const kept = bindings.filter(binding => binding.scope !== scope)
    return [...kept, { scope, registry, ...(authRef === undefined ? {} : { authRef }) }]
  })
  return { ok: true }
}

/** 移除一条 registry 绑定（幂等；最后一个绑定移除后删块，文件无残留内容则删文件）。 */
export function removeRegistry(profileDir: string, scope: string): { readonly ok: boolean; readonly removed: boolean } {
  const existed = listRegistries(profileDir).some(binding => binding.scope === scope)
  if (!existed) return { ok: true, removed: false }
  mutateNpmrc(profileDir, bindings => bindings.filter(binding => binding.scope !== scope))
  return { ok: true, removed: true }
}
