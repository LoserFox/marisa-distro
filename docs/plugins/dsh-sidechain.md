# dsh-sidechain fork

上游：`dsh-external/dsh-sidechain`（@dsh-external/dsh-sidechain v0.6.5）。本地 fork 化于 2026-08-22：深色模式适配补丁。

## 本地差异

- **深色模式适配**：面板内联样式消费 Arco Design 风格的 `--ds-color-*` 变量（`--ds-color-bg-1`、`--ds-color-text-1`、`--ds-color-surface-2` 等），而 DSH 主题（ui-theme）只定义 `--dsw-alias-*` 语义 token，不定义 `--ds-*` 命名——面板因此全部落到浅色 fallback（`#ffffff`/`#f2f3f5`/`#1d2129`），深色模式下面板保持白底黑字。
- 补丁内容：`src/client/panel-style.ts` 注入的 `SIDECHAIN_STYLE_CSS` 增加 `:root` 级映射：

  ```css
  --ds-color-bg-1:      var(--dsw-alias-bg-module-platform, #ffffff);
  --ds-color-bg-2:      var(--dsw-alias-bg-layer-2, #f2f3f5);
  --ds-color-surface-2: var(--dsw-alias-bg-layer-1, #f2f3f5);
  --ds-color-text-1:    var(--dsw-alias-label-primary, #1d2129);
  --ds-color-text-2:    var(--dsw-alias-label-secondary, #4e5969);
  --ds-color-text-3:    var(--dsw-alias-label-caption, #9ca3af);
  --ds-color-hover:     var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06));
  --ds-color-border-1:  var(--dsw-alias-border-l1, rgba(0,0,0,0.12));
  --ds-color-primary:   var(--dsw-alias-state-business-primary, #3370ff);
  --ds-color-danger:    var(--dsw-alias-state-error-primary, #f53f3f);
  ```

  DSH 页面本身从不定义 `--ds-*` 命名，`:root` 映射实际只有 sidechain 面板消费；浅色模式值与上游 fallback 一致，深色模式自动跟随 DSH 主题。
- `lib/client.js` 由修补后的 `src/` 重建（tsdown）。

## 验证

- `pnpm --dir plugins/dsh-sidechain run build`：通过（lib/index.js 12.8 kB + client bundle）。
- `pnpm --dir plugins/dsh-sidechain test`：8 文件 107 测试全过。
- 深色模式实机效果待构建发行版后确认（面板背景/文字/边框/主色跟随主题）。

## 同步动作

1. 上游若改用 DSH 语义 token（或提供自身变量定义），删除本映射补丁。
2. 同步上游新版本时重放映射段（panel-style.ts 的 `SIDECHAIN_STYLE_CSS` 头部）。
