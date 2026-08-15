export function choosePath(name: string, candidates: readonly string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid', placeItems: 'center',
      padding: '24px', background: 'rgb(15 23 42 / 35%)',
    })
    const panel = document.createElement('div')
    Object.assign(panel.style, {
      width: 'min(680px, 100%)', maxHeight: 'min(560px, 80vh)', overflow: 'auto',
      background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px',
      boxShadow: '0 18px 48px rgb(15 23 42 / 28%)', padding: '20px',
      font: '14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif',
    })
    const title = document.createElement('h2')
    title.textContent = `选择 ${name} 的原始路径`
    Object.assign(title.style, { margin: '0 0 14px', fontSize: '16px', letterSpacing: '0' })
    panel.append(title)

    const finish = (path?: string): void => { backdrop.remove(); resolve(path) }
    for (const path of candidates) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = path
      Object.assign(button.style, {
        display: 'block', width: '100%', margin: '8px 0', padding: '10px 12px', textAlign: 'left',
        border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', color: '#0f172a',
        cursor: 'pointer', overflowWrap: 'anywhere', letterSpacing: '0',
      })
      button.addEventListener('click', () => { finish(path) })
      panel.append(button)
    }
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    Object.assign(cancel.style, {
      marginTop: '10px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px',
      background: '#fff', color: '#334155', cursor: 'pointer', letterSpacing: '0',
    })
    cancel.addEventListener('click', () => { finish() })
    panel.append(cancel)
    backdrop.addEventListener('click', event => { if (event.target === backdrop) finish() })
    backdrop.append(panel)
    document.body.append(backdrop)
  })
}
