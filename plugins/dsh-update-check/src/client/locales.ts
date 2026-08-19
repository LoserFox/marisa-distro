/** `update-check` 命名空间字典（zh 为 key 源，en 与其键集逐项对齐）。 */

export const zh = {
  'card.title': '检查更新',
  'card.description': '定期检查 GitHub Releases，发现新版本时在设置页与启动横幅提示（仅检查与通知，不下载不安装）',
  'card.current': '当前版本',
  'card.latest': '最新版本',
  'card.upToDate': '已是最新版本',
  'card.hasUpdate': '有新版本可用',
  'card.noRelease': '暂无发布信息',
  'card.changelog': '更新内容',
  'card.checkNow': '立即检查',
  'card.checking': '检查中…',
  'card.autoCheck': '自动检查更新',
  'card.download': '下载',
  'card.checkFailed': '检查失败：{message}',
  'card.checkTooFrequent': '检查太频繁，请 30 秒后再试',
  'card.lastChecked': '上次检查：{time}',
  'banner.text': '发现新版本 {latest}（当前 {current}）',
  'banner.view': '查看',
  'banner.download': '下载',
  'banner.close': '关闭',
} satisfies Record<string, string>

export type UpdateCheckKey = keyof typeof zh

export const en = {
  'card.title': 'Check for updates',
  'card.description': 'Periodically checks GitHub Releases and notifies in the settings page and at startup (check and notify only — no download, no install)',
  'card.current': 'Current version',
  'card.latest': 'Latest version',
  'card.upToDate': 'Up to date',
  'card.hasUpdate': 'Update available',
  'card.noRelease': 'No release info yet',
  'card.changelog': 'Changelog',
  'card.checkNow': 'Check now',
  'card.checking': 'Checking…',
  'card.autoCheck': 'Check automatically',
  'card.download': 'Download',
  'card.checkFailed': 'Check failed: {message}',
  'card.checkTooFrequent': 'Checked too recently — retry in 30 seconds',
  'card.lastChecked': 'Last checked: {time}',
  'banner.text': 'New version {latest} available (current {current})',
  'banner.view': 'View',
  'banner.download': 'Download',
  'banner.close': 'Close',
} satisfies Record<UpdateCheckKey, string>
