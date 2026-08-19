/** fetch dispatcher 选择：存在代理环境变量时用 undici EnvHttpProxyAgent。 */

import { EnvHttpProxyAgent } from 'undici'

/** 触发代理的键（大小写两套都认）。EnvHttpProxyAgent 自身还会读 NO_PROXY 做直连豁免。 */
const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy'] as const

/**
 * 任一代理环境变量非空时返回 EnvHttpProxyAgent（它按进程环境解析代理与
 * NO_PROXY），否则返回 undefined（走直连）。代理配置只来自继承的环境，
 * 与 harness 的代理策略一致。
 */
export function proxyAgentForEnv(env: Record<string, string | undefined> = process.env): EnvHttpProxyAgent | undefined {
  const hasProxy = PROXY_ENV_KEYS.some(key => {
    const value = env[key]
    return value !== undefined && value !== ''
  })
  return hasProxy ? new EnvHttpProxyAgent() : undefined
}
