/**
 * 整合包安装卡片（r7.3 预留）：独立于插件安装的整合包（mygo-pack 单文件）
 * 安装入口。当前仅预留位——安装能力后续版本提供（届时接入
 * dsh mygo restore 等价面）；预留期间提示走 CLI。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/PackInstallCard
 */
import css from './Panel.module.css'

/** 整合包安装卡片（预留态：输入与按钮禁用，仅说明格式与 CLI 路径）。 */
export function PackInstallCard(): JSX.Element {
  return (
    <div className={css.installCard}>
      <div className={css.rowInline}>
        <div className={css.installTitle}>整合包安装</div>
        <span className={css.badge + ' ' + css.badgeOff}>
          <span className={css.badgeDot} />
          预留
        </span>
      </div>
      <div className={css.fieldHint}>
        mygo-pack 整合包：dsh mygo pack -o out.mygo-pack 产出（插件清单 / 配置 /
        bundle 引用的单文件分发形态）。面板安装入口为预留位，后续版本提供；
        当前请使用 CLI：dsh --profile &lt;profile&gt; mygo restore out.mygo-pack。
      </div>
      <div className={css.fieldGroup}>
        <div className={css.fieldLabel}>整合包文件</div>
        <input
          className={css.input}
          placeholder="预留：/绝对/路径/out.mygo-pack"
          disabled
        />
      </div>
      <div className={css.rowInline}>
        <button className={css.btn} disabled>
          安装（预留）
        </button>
      </div>
    </div>
  )
}
