/**
 * 源与凭据标签页（rc8）：profile `.npmrc` 受管块的 registry 映射管理 +
 * 凭据设/删（masked 输入；值只进实例凭据存储，界面只见 configured/
 * source/writable 徽标——官方 credentials 语义，任何响应不携带值）。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/RegistriesPanel
 */
import { useCallback, useEffect, useState } from 'react'
import css from './Panel.module.css'
import { api, ApiError, type RegistryRow } from './api'

export interface RegistriesPanelProps {
  readonly onError: (message: string, details?: Readonly<Record<string, unknown>>) => void
  readonly onNotice: (message: string) => void
}

export function RegistriesPanel(props: RegistriesPanelProps): JSX.Element {
  const { onError, onNotice } = props
  const [rows, setRows] = useState<readonly RegistryRow[] | null>(null)
  const [credentialsAvailable, setCredentialsAvailable] = useState(true)
  const [scope, setScope] = useState('')
  const [registry, setRegistry] = useState('')
  const [authRef, setAuthRef] = useState('')
  const [secretValues, setSecretValues] = useState<Readonly<Record<string, string>>>({})
  const [busy, setBusy] = useState(false)

  const reportError = useCallback((caught: unknown): void => {
    if (caught instanceof ApiError) onError(caught.message, caught.details)
    else onError(caught instanceof Error ? caught.message : String(caught))
  }, [onError])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await api.registries()
      setRows(result.registries)
      setCredentialsAvailable(result.credentialsAvailable)
    } catch (caught) {
      reportError(caught)
    }
  }, [reportError])

  useEffect(() => { void refresh() }, [refresh])

  const run = useCallback(async (action: () => Promise<{ readonly message: string }>): Promise<void> => {
    setBusy(true)
    try {
      const result = await action()
      onNotice(result.message)
      await refresh()
    } catch (caught) {
      reportError(caught)
    } finally {
      setBusy(false)
    }
  }, [onNotice, refresh, reportError])

  const addRegistry = (): void => {
    if (scope.trim() === '' || registry.trim() === '') {
      onError('请填写 scope 与 registry URL')
      return
    }
    void run(() => api.saveRegistry(
      scope.trim(),
      registry.trim(),
      authRef.trim() === '' ? undefined : authRef.trim(),
    )).then(() => {
      setScope('')
      setRegistry('')
      setAuthRef('')
    })
  }

  return (
    <div className={css.toolbar}>
      <div className={css.list}>
        {rows === null && <div className={css.skeletonRow} />}
        {rows !== null && rows.length === 0 && (
          <div className={css.listEmpty}>
            <div className={css.emptyTitle}>暂无自定义 registry</div>
            <div className={css.emptyText}>
              添加后写入 profile .npmrc 的 mygo 受管块（只携带 {'${REF}'} 占位，不携带机密）。
            </div>
          </div>
        )}
        {(rows ?? []).map(row => (
          <div key={row.scope} className={css.card}>
            <div className={css.cardBody}>
              <div className={css.cardMain}>
                <div className={css.cardTitleRow}>
                  <div className={css.cardTitle}>{row.scope}</div>
                  <div className={css.cardBadges}>
                    {row.authRef !== undefined && row.credential !== undefined && (
                      <span className={css.badge + ' ' + (row.credential.configured ? css.badgeOk : css.badgeOff)}>
                        <span className={css.badgeDot} />
                        {row.credential.configured
                          ? `凭据已配置（${row.credential.source ?? 'store'}）`
                          : '凭据未配置'}
                      </span>
                    )}
                    {row.authRef !== undefined && row.credential !== undefined && !row.credential.writable && (
                      <span className={css.badge + ' ' + css.badgeWarn}>
                        <span className={css.badgeDot} />
                        被环境遮蔽
                      </span>
                    )}
                  </div>
                </div>
                <div className={css.cardMeta}>
                  <span className={css.metaChip}>{row.registry}</span>
                  {row.authRef !== undefined && (
                    <>
                      <span className={css.metaChip}>·</span>
                      <span className={css.metaChip}>{'${' + row.authRef + '}'}</span>
                    </>
                  )}
                </div>
                {row.authRef !== undefined && (
                  <div className={css.rowInline}>
                    <input
                      className={css.input}
                      type="password"
                      placeholder={`设置 ${row.authRef} 的值（存入实例凭据存储）`}
                      disabled={busy || !credentialsAvailable || row.credential?.writable === false}
                      value={secretValues[row.authRef] ?? ''}
                      onChange={(event) => setSecretValues(current => ({ ...current, [row.authRef ?? '']: event.target.value }))}
                    />
                    <button
                      className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                      disabled={busy || !credentialsAvailable || row.credential?.writable === false
                        || (secretValues[row.authRef] ?? '') === ''}
                      onClick={() => {
                        const ref = row.authRef ?? ''
                        void run(() => api.setCredential(ref, secretValues[ref] ?? ''))
                          .then(() => setSecretValues(current => ({ ...current, [ref]: '' })))
                      }}
                    >
                      保存凭据
                    </button>
                    <button
                      className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                      disabled={busy || !credentialsAvailable || row.credential?.writable === false
                        || row.credential?.configured !== true}
                      onClick={() => void run(() => api.unsetCredential(row.authRef ?? ''))}
                    >
                      删除凭据
                    </button>
                  </div>
                )}
              </div>
              <div className={css.cardActions}>
                <button
                  className={css.btn + ' ' + css.btnDanger + ' ' + css.btnSm}
                  disabled={busy}
                  onClick={() => void run(() => api.removeRegistry(row.scope))}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className={css.installCard}>
        <div className={css.fieldGroup}>
          <div className={css.fieldLabel}>添加 registry 映射</div>
          <input
            className={css.input}
            placeholder="scope，如 @my-scope"
            value={scope}
            disabled={busy}
            onChange={(event) => setScope(event.target.value)}
          />
          <input
            className={css.input}
            placeholder="registry URL，如 https://npm.example.com"
            value={registry}
            disabled={busy}
            onChange={(event) => setRegistry(event.target.value)}
          />
          <input
            className={css.input}
            placeholder="凭据引用名（可选），如 MY_SCOPE_TOKEN"
            value={authRef}
            disabled={busy}
            onChange={(event) => setAuthRef(event.target.value)}
          />
          <div className={css.fieldHint}>
            .npmrc 只写 {'${REF}'} 占位；凭据值经下方 masked 输入存入 $DSH_HOME/.credentials.yaml，
            安装时按操作解析进 pnpm 子进程环境，轮换无需改配置、无需重启。
            {!credentialsAvailable && '（宿主 credentials 服务不可达：只能维护映射，凭据设/删不可用）'}
          </div>
        </div>
        <div className={css.rowInline}>
          <button className={css.btn} disabled={busy} onClick={addRegistry}>
            添加
          </button>
        </div>
      </div>
    </div>
  )
}
