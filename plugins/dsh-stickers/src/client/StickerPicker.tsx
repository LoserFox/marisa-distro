import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PUBLIC_STICKERS, stickerAssetUrl, type StickerVariant } from '../shared/catalog.ts'
import css from './StickerPicker.module.css'

type Props = PropsRuntime<'conversation.input.right'> & PropsLocale<'stickers'>

export function StickerPicker({ inputActions, t }: Props) {
  const [open, setOpen] = useState(false)
  const [variant, setVariant] = useState<StickerVariant>('blue')
  const send = (id: string): void => {
    inputActions.setDraft(variant === 'blue' ? `/sticker ${id}` : `/sticker ${id} ${variant}`)
    inputActions.submit()
    setOpen(false)
  }
  return <div className={css.root}>
    <button type="button" className={css.trigger} aria-label={t('picker.open')} onClick={() => setOpen(value => !value)}>{variant === 'blue' ? '🐋' : '🐳'}</button>
    {open && <div className={css.popover} role="dialog" aria-label={t('picker.title')}>
      <header>
        <strong>{t('picker.title')}</strong>
        <div className={css.variants} role="radiogroup" aria-label={t('picker.variant')}>
          <button type="button" role="radio" aria-checked={variant === 'blue'} className={variant === 'blue' ? css.active : ''} onClick={() => setVariant('blue')}>{t('picker.variant.blue')}</button>
          <button type="button" role="radio" aria-checked={variant === 'black'} className={variant === 'black' ? css.active : ''} onClick={() => setVariant('black')}>{t('picker.variant.black')}</button>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('picker.close')}>×</button>
      </header>
      <div className={css.grid}>{PUBLIC_STICKERS.map(sticker => <button key={sticker.id} type="button" onClick={() => send(sticker.id)} aria-label={sticker.text}><img src={stickerAssetUrl(sticker.file, variant)} alt="" /><span>{sticker.text}</span></button>)}</div>
    </div>}
  </div>
}
