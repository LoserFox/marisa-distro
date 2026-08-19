/**
 * profile LoaderAdapter（P5）：把 profile 安装执行面收敛为 mygo-api
 * LoaderAdapter 契约实现。`id: 'profile'`；resolve 接受四种 spec——
 * npm 包名（可带区间）、git spec（git+https / https / github: 钉 commit）、
 * tarball（.tgz/.tar.gz，可 file: 前缀）、本地目录（file: / 相对 / 绝对
 * 路径）；install 落 pnpm + dsh.bundle 对账（face.ts）。
 * 本 adapter 是所有其他 loader 的最终执行面：来源适配器（hub 等）把外部
 * spec 翻译为 pnpm intent 后由本 adapter 执行。
 * @module @r05en1cu/dsh-mygo-loader-profile/adapter
 */

import type {
  InstallIntent,
  InstallReceipt,
  InstallTarget,
  LoaderAdapter,
} from '@r05en1cu/dsh-mygo-api'
import { profileInstall, profileSetEnabled, profileUninstall } from './face.ts'
import type { ProfileExecResult } from './face.ts'

/** profile adapter 的安装回执（InstallReceipt + profile 执行面事实）。 */
export interface ProfileInstallReceipt extends InstallReceipt {
  readonly profile?: string
  /** 对账后的 dsh.profile.bundles 列表。 */
  readonly bundles?: readonly string[]
  /** 本次自动放行的构建脚本键（P7-A1 一键写白名单）。 */
  readonly allowedBuilds?: readonly string[]
  /** r7：新装/变更的包由 live rail 受管块在管（运行期重放生效）。 */
  readonly live?: boolean
}

/**
 * profile LoaderAdapter：LoaderAdapter 契约 + uninstall/setEnabled 扩展面
 * （契约只覆盖 install；卸载/启停是 profile 执行面自有语义，CLI 经本
 * 扩展面调用）。
 */
export interface ProfileLoaderAdapter extends LoaderAdapter {
  readonly id: 'profile'
  install(intent: InstallIntent, target: InstallTarget): Promise<ProfileInstallReceipt>
  uninstall(name: string, target: InstallTarget): ProfileExecResult
  setEnabled(id: string, enabled: boolean, target: InstallTarget): ProfileExecResult
}

const GIT_SPEC_RE = /^(?:git\+https:\/\/|https:\/\/\S+\.git(?:#|$)|github:)[^\s]+$/
const TARBALL_RE = /^(?:file:)?\S+\.(?:tgz|tar\.gz)$/
const PATH_SPEC_RE = /^(?:file:|\.{1,2}[\\/]|\/|[A-Za-z]:[\\/])/
const NPM_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

/** npm 包名 spec（name 或 name@range；range 段非空即可，合法性交给 pnpm）。 */
function isNpmSpec(spec: string): boolean {
  const at = spec.startsWith('@') ? spec.indexOf('@', 1) : spec.indexOf('@')
  const name = at === -1 ? spec : spec.slice(0, at)
  const range = at === -1 ? '' : spec.slice(at + 1)
  return NPM_NAME_RE.test(name) && (at === -1 || range !== '')
}

/**
 * spec 分类（确定性；零 I/O——本地目录存在性由 pnpm 在安装时判定）。
 * 不识别返回 null（交给下一个适配器）。
 */
export function resolveProfileSpec(spec: string): InstallIntent | null {
  if (typeof spec !== 'string' || spec.trim() !== spec || spec === '') return null
  if (GIT_SPEC_RE.test(spec) || TARBALL_RE.test(spec) || PATH_SPEC_RE.test(spec) || isNpmSpec(spec)) {
    return { kind: 'pnpm', spec }
  }
  return null
}

/** 构造 profile LoaderAdapter（内置执行面；无状态，可重复构造）。 */
export function createProfileLoaderAdapter(): ProfileLoaderAdapter {
  return {
    id: 'profile',
    resolve: resolveProfileSpec,
    install(intent: InstallIntent, target: InstallTarget): Promise<ProfileInstallReceipt> {
      if (intent.kind !== 'pnpm') {
        return Promise.resolve({
          ok: false,
          error: {
            code: 'package-not-resolvable',
            message: `profile loader 只执行 pnpm intent（收到 ${intent.kind}）`,
          },
        })
      }
      const outcome = profileInstall(intent.spec, {
        profile: target.profile,
        home: target.home,
        ...(target.env === undefined ? {} : { env: target.env }),
      })
      if (!outcome.ok) {
        return Promise.resolve({
          ok: false,
          error: { code: 'package-not-resolvable', message: outcome.error ?? 'pnpm 失败' },
          profile: outcome.profile,
        })
      }
      return Promise.resolve({
        ok: true,
        profile: outcome.profile,
        bundles: outcome.bundles ?? [],
        activated: outcome.live === true ? 'live' : 'pending-restart',
        ...(outcome.live === undefined ? {} : { live: outcome.live }),
        ...(outcome.allowedBuilds === undefined ? {} : { allowedBuilds: outcome.allowedBuilds }),
      })
    },
    uninstall(name: string, target: InstallTarget): ProfileExecResult {
      return profileUninstall(name, {
        profile: target.profile,
        home: target.home,
        ...(target.env === undefined ? {} : { env: target.env }),
      })
    },
    setEnabled(id: string, enabled: boolean, target: InstallTarget): ProfileExecResult {
      return profileSetEnabled(id, enabled, { profile: target.profile, home: target.home })
    },
  }
}
