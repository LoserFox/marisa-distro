/** 桌面壳注入的后端环境事实（MARISA_INSTALL_FORM / MARISA_VERSION）。 */

export interface BackendEnv {
  /** 安装形态：'msi' | 'standalone' | 'dev'（未知值按 '' 处理，等同 dev）。 */
  readonly installForm: string
  /** 归一化后端版本；dev 形态为空串。 */
  readonly version: string
}

/** 读取壳注入的环境；缺省时从 process.env 读取。 */
export function readBackendEnv(env: Record<string, string | undefined> = process.env): BackendEnv {
  const installForm = env.MARISA_INSTALL_FORM ?? ''
  return {
    installForm: installForm === 'msi' || installForm === 'standalone' || installForm === 'dev' ? installForm : '',
    version: env.MARISA_VERSION ?? '',
  }
}
