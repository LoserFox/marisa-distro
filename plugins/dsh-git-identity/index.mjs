/**
 * git-identity — registry 插件：让 DSH 内产生的所有 git 提交使用环境自身的作者身份。
 *
 * 背景：DSH 的 agent 会话通过 bash 工具执行 `git commit`。git 解析作者身份的优先级是
 * `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`
 * 环境变量 > `-c user.name=...` > repo-local > global 配置。历史上一旦某个会话用
 * `-c user.name="DSH Agent"` 或改了配置提交，后续提交就会带着错误的作者。
 *
 * 本插件在加载时（DSH 每次启动、每次 HMR 重载）做两件事：
 * 1. 把解析到的环境身份写入 `process.env` 的四个 GIT_* 变量。DSH 的 subprocess 层
 *    在 spawn 每个 bash 子进程时都会带上 `process.env`（仅剔除凭据），因此 DSH 内
 *    任何路径发起的 git 提交都必然使用该身份，即使某次会话显式传了 `-c user.name=...`
 *    之外的 repo-local/global 配置也无法覆盖（env 变量优先级最高）。
 * 2. 顺带把身份同步回 `git config --global`，让插件进程外的普通终端提交也保持一致
 *    （幂等：只有当 global 配置缺失或被改错时才写回）。
 *
 * 身份解析优先级（高 → 低，每个来源必须同时给出 name 与 email）：
 *   a. 插件配置 `{ name, email }`（用户显式钉死，最稳）；
 *   b. gh CLI 的登录账号（`gh api user`）：name 取 login，email 取 GitHub 的
 *      noreply 地址 `<id>+<login>@users.noreply.github.com` —— 环境里"自己"的
 *      权威来源，提交到 GitHub 才能正确挂到账号名下；
 *   c. 启动 DSH 时的 `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` 环境变量
 *      （忽略插件上一次自己注入的值，避免重载时把自身输出当成外部输入）；
 *   d. `git config --global user.name` / `user.email`（兜底）。
 * 全部解析不到时只告警、不注入，绝不凭空编造身份。
 */

import { execFileSync } from 'node:child_process'

/** gh api user 的调用超时：gh 未登录或网络异常时快速失败，不拖慢 DSH 启动。 */
const GH_TIMEOUT_MS = 8000

/** 插件上一次注入的身份；用于区分"启动环境的 GIT_AUTHOR_*"与"插件自己的注入"。 */
const INJECTED_MARKER = '__dshGitIdentityInjected'

/** 读一条 git 全局配置；缺失或 git 不可用时返回 undefined。 */
function gitConfigGet(key) {
  try {
    const value = execFileSync('git', ['config', '--global', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return value === '' ? undefined : value
  } catch {
    return undefined
  }
}

/** 写一条 git 全局配置；失败时返回 false。 */
function gitConfigSet(key, value) {
  try {
    execFileSync('git', ['config', '--global', key, value], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * 读 gh CLI 的登录身份；未登录、gh 缺失或超时均返回 undefined。
 * @returns `{ name, email }`，email 为 GitHub noreply 地址 `<id>+<login>@users.noreply.github.com`。
 */
function ghIdentity() {
  try {
    const raw = execFileSync('gh', ['api', 'user', '--jq', '{ login, id }'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GH_TIMEOUT_MS,
    }).trim()
    const { login, id } = JSON.parse(raw)
    if (typeof login !== 'string' || login === '' || !Number.isInteger(id)) return undefined
    return { name: login, email: `${id}+${login}@users.noreply.github.com` }
  } catch {
    return undefined
  }
}

/** 启动环境的 GIT_AUTHOR_*（排除插件自己上一次的注入）。 */
function launchEnvIdentity() {
  const injected = globalThis[INJECTED_MARKER]
  const name = process.env.GIT_AUTHOR_NAME
  const email = process.env.GIT_AUTHOR_EMAIL
  if (name === undefined || email === undefined) return undefined
  if (injected !== undefined && name === injected.name && email === injected.email) return undefined
  return { name, email }
}

/** 解析环境身份；解析不到返回 undefined（绝不编造）。 */
function resolveIdentity(config) {
  const explicit = config.name !== undefined || config.email !== undefined
    ? { name: config.name, email: config.email }
    : undefined
  const gh = explicit === undefined ? ghIdentity() : undefined
  const env = explicit === undefined && gh === undefined ? launchEnvIdentity() : undefined
  const git = explicit === undefined && gh === undefined && env === undefined
    ? { name: gitConfigGet('user.name'), email: gitConfigGet('user.email') }
    : undefined

  if (explicit !== undefined && explicit.name !== undefined && explicit.email !== undefined) {
    return { identity: explicit, source: '插件配置' }
  }
  if (gh !== undefined) return { identity: gh, source: 'gh CLI 登录账号' }
  if (env !== undefined) return { identity: env, source: '启动环境 GIT_AUTHOR_*' }
  if (git !== undefined && git.name !== undefined && git.email !== undefined) {
    return { identity: git, source: 'git config --global' }
  }
  return undefined
}

export default {
  name: 'git-identity',
  // 不需要任何服务依赖，启动即挂载。
  inject: [],

  /**
   * 插件主体：解析环境身份并固定到进程环境与 git 全局配置。
   * @param ctx - Cordis 插件上下文（仅用 logger 输出诊断）。
   * @param config - 可选钉死配置 `{ name, email }`，来自 registry 的插件配置。
   */
  apply(ctx, config = {}) {
    const resolved = resolveIdentity(config)
    if (resolved === undefined) {
      ctx.logger.warn(
        '[git-identity] 无法解析环境自身的 git 身份（需 gh 登录、GIT_AUTHOR_NAME/GIT_AUTHOR_EMAIL 或 git config --global user.name/user.email），跳过注入',
      )
      return
    }
    const { identity, source } = resolved

    // 固定进进程环境：DSH 的每个 bash 子进程都会继承，git 提交必用它。
    process.env.GIT_AUTHOR_NAME = identity.name
    process.env.GIT_AUTHOR_EMAIL = identity.email
    process.env.GIT_COMMITTER_NAME = identity.name
    process.env.GIT_COMMITTER_EMAIL = identity.email
    globalThis[INJECTED_MARKER] = { name: identity.name, email: identity.email }

    // 幂等同步回 global 配置（含"被改错后改回"的场景）；写不进去只告警，不影响进程内注入。
    if (gitConfigGet('user.name') !== identity.name && !gitConfigSet('user.name', identity.name)) {
      ctx.logger.warn(`[git-identity] 无法写回 git config --global user.name=${identity.name}`)
    }
    if (gitConfigGet('user.email') !== identity.email && !gitConfigSet('user.email', identity.email)) {
      ctx.logger.warn(`[git-identity] 无法写回 git config --global user.email=${identity.email}`)
    }

    ctx.logger.info(`[git-identity] git 提交身份固定为 ${identity.name} <${identity.email}>（来源：${source}）`)
  },
}
