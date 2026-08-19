/** Host 路由与负载类型（host 与 client 共享）。 */

/** 同源路由：host 经 ctx.webServer 注册，client 直接相对路径 fetch。 */
export const STATE_ROUTE = '/plugins/dsh-update-check/state'
export const CHECK_ROUTE = '/plugins/dsh-update-check/check'
export const DISMISS_ROUTE = '/plugins/dsh-update-check/dismiss'
export const SETTINGS_ROUTE = '/plugins/dsh-update-check/settings'

/** 一个 Release 的下载面：三个候选链接加按安装形态选出的主链接。 */
export interface ReleaseAssets {
  /** MSI 资产直链（Release 缺该资产时为 null）。 */
  readonly msi: string | null
  /** standalone EXE 资产直链（Release 缺该资产时为 null）。 */
  readonly standalone: string | null
  /** Release 的 GitHub 页面。 */
  readonly releasePage: string | null
  /** 当前安装形态的主下载链接：msi→MSI、standalone→EXE、dev/未知→Release 页。 */
  readonly download: string | null
}

/** state 路由负载：卡片与横幅渲染所需的全部信息。 */
export interface UpdateStatePayload {
  /** 当前后端版本（MARISA_VERSION；dev 形态为空串）。 */
  readonly currentVersion: string
  /** 最新 Release 的归一化版本号（尚无检查结果时为 null）。 */
  readonly latest: string | null
  /** latest 比 currentVersion 新（版本已知时的判定）。 */
  readonly hasUpdate: boolean
  /** 最新 Release 的 changelog（release body，截断到固定上界）。 */
  readonly changelog: string
  readonly assets: ReleaseAssets
  /** 上次检查时间（ISO 字符串；未检查过时为 null）。 */
  readonly lastCheckAt: string | null
  /** 自动检查开关（settings namespace 解析值）。 */
  readonly autoCheck: boolean
  /** 用户已忽略的版本（该版本不再弹横幅）。 */
  readonly dismissedVersion: string | null
}
