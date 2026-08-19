/** 代理 dispatcher 选择：任一代理环境变量非空 → EnvHttpProxyAgent，否则直连。 */
import { describe, expect, it } from 'vitest'
import { proxyAgentForEnv } from '../src/proxy.ts'

describe('proxyAgentForEnv', () => {
  it('returns undefined without any proxy environment variable', () => {
    expect(proxyAgentForEnv({})).toBeUndefined()
    expect(proxyAgentForEnv({ NO_PROXY: '*' })).toBeUndefined()
  })

  it('returns an EnvHttpProxyAgent when HTTPS_PROXY is set', () => {
    const agent = proxyAgentForEnv({ HTTPS_PROXY: 'http://127.0.0.1:10808' })
    expect(agent).toBeDefined()
    expect(agent?.constructor.name).toBe('EnvHttpProxyAgent')
  })

  it('honors lowercase keys', () => {
    expect(proxyAgentForEnv({ http_proxy: 'http://127.0.0.1:10808' })).toBeDefined()
  })

  it('honors ALL_PROXY', () => {
    expect(proxyAgentForEnv({ ALL_PROXY: 'socks5://127.0.0.1:1080' })).toBeDefined()
  })

  it('treats empty-string values as unset', () => {
    expect(proxyAgentForEnv({ HTTPS_PROXY: '', HTTP_PROXY: '', ALL_PROXY: '' })).toBeUndefined()
  })
})
