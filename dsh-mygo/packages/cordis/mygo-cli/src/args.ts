/**
 * mygo CLI 最小参数解析器（design-r5 §2；任务书 §0 允许手写最小实现）。
 * 零第三方依赖；确定性输出；用法错误与帮助不触发任何 I/O 之外的副作用。
 * @module @r05en1cu/dsh-mygo-cli/args
 */

/** 一条已解析的 mygo 子命令。 */
export type CliCommand =
  | {
    readonly kind: 'pack'
    readonly output: string
    readonly includeCommunityDeps: boolean
    /** P8：引用式成员（id 列表或 'all'；缺省全内嵌）。 */
    readonly references?: 'all' | readonly string[]
    readonly json: boolean
  }
  | {
    readonly kind: 'restore'
    readonly pack: string
    readonly targetProfile?: string
    /** P8：restore 后自动注册进目标 profile（缺省 true；--no-register 关闭）。 */
    readonly register: boolean
    readonly json: boolean
  }
  | {
    readonly kind: 'init'
    readonly name: string
    readonly id?: string
    readonly dir?: string
    readonly json: boolean
  }
  | {
    readonly kind: 'install'
    readonly spec: string
    readonly json: boolean
  }
  | {
    readonly kind: 'uninstall'
    readonly name: string
    readonly json: boolean
  }
  | {
    readonly kind: 'enable' | 'disable'
    readonly id: string
    readonly json: boolean
  }
  | {
    readonly kind: 'instances'
    readonly json: boolean
  }
  | {
    readonly kind: 'adopt'
    readonly home: string
    readonly json: boolean
  }
  | {
    readonly kind: 'clone'
    readonly from: string
    readonly to: string
    readonly plugin: string
    readonly json: boolean
  }
  | {
    readonly kind: 'hub'
    readonly verb: 'search' | 'info' | 'install' | 'collections'
    /** search 的 query / info+install 的 id[@release]。 */
    readonly arg?: string
    /** 本地快照路径（file:// 或文件路径）；给出时不拉远程。 */
    readonly snapshot?: string
    /** 跳过摘要/验签（仅本地快照生效）。 */
    readonly insecureNoVerify: boolean
    readonly json: boolean
  }
  | {
    readonly kind: 'config'
    readonly id: string
    /** 浅合并进整行 config 的 JSON 对象（缺省 = 只读展示）。 */
    readonly set?: string
    readonly json: boolean
  }
  | {
    readonly kind: 'registry'
    readonly verb: 'list' | 'add' | 'remove'
    readonly scope?: string
    readonly registry?: string
    readonly authRef?: string
    readonly json: boolean
  }
  | {
    readonly kind: 'auth'
    readonly verb: 'status' | 'set' | 'unset'
    readonly ref?: string
    /** set 的值来源环境变量名（不回显；缺省交互隐藏输入）。 */
    readonly valueEnv?: string
    readonly json: boolean
  }

/** 解析结果：一条命令 / 帮助请求 / 用法错误。 */
export type CliParse =
  | { readonly kind: 'command'; readonly command: CliCommand }
  | { readonly kind: 'help'; readonly topic?: 'pack' | 'restore' | 'init' | 'install' | 'uninstall' | 'enable' | 'disable' | 'instances' | 'adopt' | 'clone' | 'hub' | 'config' | 'registry' | 'auth' }
  | { readonly kind: 'usage-error'; readonly message: string }

const COMMANDS = new Set(['pack', 'restore', 'init', 'install', 'uninstall', 'enable', 'disable', 'instances', 'adopt', 'clone', 'hub', 'config', 'registry', 'auth'])

/** npm 包名最小校验（手写；task 允许）：小写、URL 安全、非空段。 */
export function isValidNpmName(name: string): boolean {
  if (name.length === 0 || name.length > 214 || name !== name.toLowerCase()) return false
  if (name.startsWith('.') || name.startsWith('_')) return false
  if (name.includes(' ') || name.includes('\\') || name.includes(':')) return false
  if (name.startsWith('@')) {
    const slash = name.indexOf('/')
    if (slash <= 1 || slash === name.length - 1) return false
    const scope = name.slice(1, slash)
    const pkg = name.slice(slash + 1)
    return /^[a-z0-9][a-z0-9._-]*$/.test(scope) && /^[a-z0-9][a-z0-9._-]*$/.test(pkg)
  }
  return /^[a-z0-9][a-z0-9._-]*$/.test(name)
}

/** 包名末段 → manifest id（dsh-sdk 同款推导：小写 slug）。 */
export function slugId(name: string): string {
  const base = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function takeValue(
  argv: readonly string[],
  index: number,
  inline?: string,
): { readonly ok: true; readonly value: string; readonly next: number } | { readonly ok: false } {
  if (inline !== undefined && inline !== '') return { ok: true, value: inline, next: index + 1 }
  const value = argv[index + 1]
  if (value === undefined || value === '' || value.startsWith('-')) return { ok: false }
  return { ok: true, value, next: index + 2 }
}

/**
 * 解析 `mygo` 之后的内层参数。支持 `--flag value`、`--flag=value`、`-o value`、
 * 布尔旗标与 `--` 结束符；未知旗标/缺参/未知子命令 → usage-error。
 */
export function parseCliArgs(argv: readonly string[]): CliParse {
  const [head, ...rest] = argv
  if (head === undefined) return { kind: 'help' }
  if (head === '-h' || head === '--help') return { kind: 'help' }
  if (!COMMANDS.has(head)) {
    return { kind: 'usage-error', message: `未知子命令 ${JSON.stringify(head)}（可用：pack / restore / init / install / uninstall / enable / disable / instances / adopt / clone / hub / config / registry / auth）` }
  }
  const command = head as 'pack' | 'restore' | 'init' | 'install' | 'uninstall' | 'enable' | 'disable' | 'instances' | 'adopt' | 'clone' | 'hub' | 'config' | 'registry' | 'auth'
  const positional: string[] = []
  let json = false
  let output = ''
  let includeCommunityDeps = true
  let targetProfile: string | undefined
  let id: string | undefined
  let dir: string | undefined
  let home: string | undefined
  let from: string | undefined
  let to: string | undefined
  let snapshot: string | undefined
  let set: string | undefined
  let authRef: string | undefined
  let valueEnv: string | undefined
  let register = true
  const refs: string[] = []
  let insecureNoVerify = false
  let index = 0
  let flagsEnded = false
  while (index < rest.length) {
    const token = rest[index]
    if (token === undefined) break
    if (flagsEnded || !token.startsWith('-') || token === '-') {
      positional.push(token)
      index += 1
      continue
    }
    if (token === '--') {
      flagsEnded = true
      index += 1
      continue
    }
    if (token === '-h' || token === '--help') return { kind: 'help', topic: command }
    if (token === '--json') {
      json = true
      index += 1
      continue
    }
    if (token === '--no-community-deps') {
      if (command !== 'pack') {
        return { kind: 'usage-error', message: `--no-community-deps 仅 pack 支持` }
      }
      includeCommunityDeps = false
      index += 1
      continue
    }
    if (token === '--no-register') {
      if (command !== 'restore') {
        return { kind: 'usage-error', message: `--no-register 仅 restore 支持` }
      }
      register = false
      index += 1
      continue
    }
    if (token === '--insecure-no-verify') {
      if (command !== 'hub') {
        return { kind: 'usage-error', message: `--insecure-no-verify 仅 hub 支持` }
      }
      insecureNoVerify = true
      index += 1
      continue
    }
    const eq = token.indexOf('=')
    const flag = eq === -1 ? token : token.slice(0, eq)
    const inline = eq === -1 ? undefined : token.slice(eq + 1)
    if (command === 'pack' && (flag === '-o' || flag === '--output')) {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `${flag} 需要一个值` }
      output = taken.value
      index = taken.next
      continue
    }
    if (command === 'restore' && flag === '--profile') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--profile 需要一个值` }
      targetProfile = taken.value
      index = taken.next
      continue
    }
    if (command === 'init' && flag === '--id') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--id 需要一个值` }
      id = taken.value
      index = taken.next
      continue
    }
    if (command === 'init' && flag === '--dir') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--dir 需要一个值` }
      dir = taken.value
      index = taken.next
      continue
    }
    if (command === 'adopt' && flag === '--home') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--home 需要一个值` }
      home = taken.value
      index = taken.next
      continue
    }
    if (command === 'clone' && flag === '--from') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--from 需要一个值` }
      from = taken.value
      index = taken.next
      continue
    }
    if (command === 'clone' && flag === '--to') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--to 需要一个值` }
      to = taken.value
      index = taken.next
      continue
    }
    if (command === 'pack' && flag === '--ref') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--ref 需要一个值` }
      refs.push(taken.value)
      index = taken.next
      continue
    }
    if (command === 'config' && flag === '--set') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--set 需要一个值` }
      set = taken.value
      index = taken.next
      continue
    }
    if (command === 'hub' && flag === '--snapshot') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--snapshot 需要一个值` }
      snapshot = taken.value
      index = taken.next
      continue
    }
    if (command === 'registry' && flag === '--auth-ref') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--auth-ref 需要一个值` }
      authRef = taken.value
      index = taken.next
      continue
    }
    if (command === 'auth' && flag === '--value-env') {
      const taken = takeValue(rest, index, inline)
      if (!taken.ok) return { kind: 'usage-error', message: `--value-env 需要一个值` }
      valueEnv = taken.value
      index = taken.next
      continue
    }
    return { kind: 'usage-error', message: `${command} 不支持参数 ${JSON.stringify(token)}` }
  }

  if (command === 'hub') {
    const verb = positional.shift()
    if (verb === undefined || !['search', 'info', 'install', 'collections'].includes(verb)) {
      return { kind: 'usage-error', message: `hub 需要子命令（search / info / install / collections），实际：${verb ?? '（缺）'}` }
    }
    if (verb === 'collections' && positional.length > 0) {
      return { kind: 'usage-error', message: `hub collections 不接受位置参数：${positional.join(' ')}` }
    }
    const arg = positional.shift()
    if (verb !== 'collections' && (arg === undefined || arg === '')) {
      return { kind: 'usage-error', message: `hub ${verb} 需要一个${verb === 'search' ? '检索词' : '条目 id[@release]'}` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `hub ${verb} 只接受一个位置参数：${positional.join(' ')}` }
    }
    return {
      kind: 'command',
      command: {
        kind: 'hub',
        verb: verb as 'search' | 'info' | 'install' | 'collections',
        ...(arg === undefined ? {} : { arg }),
        ...(snapshot === undefined ? {} : { snapshot }),
        insecureNoVerify,
        json,
      },
    }
  }
  if (command === 'registry') {
    const verb = positional.shift()
    if (verb === undefined || !['list', 'add', 'remove'].includes(verb)) {
      return { kind: 'usage-error', message: `registry 需要子命令（list / add / remove），实际：${verb ?? '（缺）'}` }
    }
    const scope = positional.shift()
    if (verb !== 'list' && (scope === undefined || scope === '')) {
      return { kind: 'usage-error', message: `registry ${verb} 需要 scope（如 @my-scope）` }
    }
    const registry = verb === 'add' ? positional.shift() : undefined
    if (verb === 'add' && (registry === undefined || registry === '')) {
      return { kind: 'usage-error', message: 'registry add 需要 registry URL' }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `registry ${verb} 位置参数过多：${positional.join(' ')}` }
    }
    return {
      kind: 'command',
      command: {
        kind: 'registry',
        verb: verb as 'list' | 'add' | 'remove',
        ...(scope === undefined ? {} : { scope }),
        ...(registry === undefined ? {} : { registry }),
        ...(authRef === undefined ? {} : { authRef }),
        json,
      },
    }
  }
  if (command === 'auth') {
    const verb = positional.shift()
    if (verb === undefined || !['status', 'set', 'unset'].includes(verb)) {
      return { kind: 'usage-error', message: `auth 需要子命令（status / set / unset），实际：${verb ?? '（缺）'}` }
    }
    const ref = positional.shift()
    if (verb !== 'status' && (ref === undefined || ref === '')) {
      return { kind: 'usage-error', message: `auth ${verb} 需要引用名（如 MY_SCOPE_TOKEN）` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `auth ${verb} 位置参数过多：${positional.join(' ')}` }
    }
    return {
      kind: 'command',
      command: {
        kind: 'auth',
        verb: verb as 'status' | 'set' | 'unset',
        ...(ref === undefined ? {} : { ref }),
        ...(valueEnv === undefined ? {} : { valueEnv }),
        json,
      },
    }
  }
  if (command === 'config') {
    const target = positional.shift()
    if (target === undefined || target === '') {
      return { kind: 'usage-error', message: 'config 需要一个插件 id' }
    }
    if (!/^[a-z][a-z0-9-]*$/.test(target)) {
      return { kind: 'usage-error', message: `非法插件 id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(target)}` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `config 只接受一个插件 id：${positional.join(' ')}` }
    }
    if (set !== undefined) {
      try {
        const parsed: unknown = JSON.parse(set)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return { kind: 'usage-error', message: '--set 必须是 JSON 对象' }
        }
      } catch {
        return { kind: 'usage-error', message: '--set 不是合法 JSON' }
      }
    }
    return { kind: 'command', command: { kind: 'config', id: target, ...(set === undefined ? {} : { set }), json } }
  }
  if (command === 'instances') {
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `instances 不接受位置参数：${positional.join(' ')}` }
    }
    return { kind: 'command', command: { kind: 'instances', json } }
  }
  if (command === 'adopt') {
    if (home === undefined || home === '') {
      return { kind: 'usage-error', message: 'adopt 需要 --home <path>（目标实例的 $DSH_HOME）' }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `adopt 不接受位置参数：${positional.join(' ')}` }
    }
    return { kind: 'command', command: { kind: 'adopt', home, json } }
  }
  if (command === 'clone') {
    if (from === undefined || from === '') {
      return { kind: 'usage-error', message: 'clone 需要 --from <home>（源实例的 $DSH_HOME）' }
    }
    if (to === undefined || to === '') {
      return { kind: 'usage-error', message: 'clone 需要 --to <home>（目标实例的 $DSH_HOME）' }
    }
    const plugin = positional.shift()
    if (plugin === undefined || plugin === '') {
      return { kind: 'usage-error', message: 'clone 需要一个插件 id 位置参数' }
    }
    if (!/^[a-z][a-z0-9-]*$/.test(plugin)) {
      return { kind: 'usage-error', message: `非法插件 id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(plugin)}` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `clone 只接受一个插件 id：${positional.join(' ')}` }
    }
    return { kind: 'command', command: { kind: 'clone', from, to, plugin, json } }
  }
  if (command === 'pack') {
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `pack 不接受位置参数：${positional.join(' ')}` }
    }
    const refAll = refs.includes('all')
    const refIds = refs.filter(entry => entry !== 'all')
    if (refAll && refIds.length > 0) {
      return { kind: 'usage-error', message: '--ref=all 不能与其他 --ref 混用' }
    }
    for (const ref of refIds) {
      if (!/^[a-z][a-z0-9-]*$/.test(ref)) {
        return { kind: 'usage-error', message: `非法插件 id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(ref)}` }
      }
    }
    return {
      kind: 'command',
      command: {
        kind: 'pack',
        output,
        includeCommunityDeps,
        ...(refs.length === 0 ? {} : { references: refAll ? 'all' as const : refIds }),
        json,
      },
    }
  }
  if (command === 'restore') {
    const pack = positional.shift()
    if (pack === undefined || pack === '') {
      return { kind: 'usage-error', message: 'restore 需要一个 pack 路径' }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `restore 只接受一个 pack 路径：${positional.join(' ')}` }
    }
    return {
      kind: 'command',
      command: {
        kind: 'restore',
        pack,
        ...(targetProfile === undefined ? {} : { targetProfile }),
        register,
        json,
      },
    }
  }
  if (command === 'install' || command === 'uninstall') {
    const spec = positional.shift()
    if (spec === undefined || spec === '') {
      return { kind: 'usage-error', message: `${command} 需要一个${command === 'install' ? '安装 spec（包名/版本/tarball/路径）' : '包名'}` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `${command} 只接受一个位置参数：${positional.join(' ')}` }
    }
    return {
      kind: 'command',
      command: command === 'install' ? { kind: 'install', spec, json } : { kind: 'uninstall', name: spec, json },
    }
  }
  if (command === 'enable' || command === 'disable') {
    const id = positional.shift()
    if (id === undefined || id === '') {
      return { kind: 'usage-error', message: `${command} 需要一个插件 id` }
    }
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      return { kind: 'usage-error', message: `非法插件 id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(id)}` }
    }
    if (positional.length > 0) {
      return { kind: 'usage-error', message: `${command} 只接受一个位置参数：${positional.join(' ')}` }
    }
    return { kind: 'command', command: { kind: command, id, json } }
  }
  const name = positional.shift()
  if (name === undefined || name === '') {
    return { kind: 'usage-error', message: 'init 需要一个 npm 包名' }
  }
  if (positional.length > 0) {
    return { kind: 'usage-error', message: `init 只接受一个包名：${positional.join(' ')}` }
  }
  if (!isValidNpmName(name)) {
    return { kind: 'usage-error', message: `非法 npm 包名：${JSON.stringify(name)}` }
  }
  if (id !== undefined && !/^[a-z][a-z0-9-]*$/.test(id)) {
    return { kind: 'usage-error', message: `非法 manifest id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(id)}` }
  }
  return {
    kind: 'command',
    command: {
      kind: 'init',
      name,
      ...(id === undefined ? {} : { id }),
      ...(dir === undefined ? {} : { dir }),
      json,
    },
  }
}
