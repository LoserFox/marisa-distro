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
- **与 dsh-better-sidebar 面板互斥**（panel mutex）：两个面板同时打开会互相挤压布局（better-sidebar 挤 `#root` 宽度、sidechain 是 360px fixed 右栏）。协议 = 一对 window CustomEvent：
  - sidechain 打开（`openSidechainPanel` / `revealChild` 首次打开）→ `dsh:better-sidebar:collapse`，better-sidebar 收起；
  - better-sidebar 展开 → `dsh:sidechain:close`，sidechain 关闭。
  - 实现：`panel-state.ts` 广播 + `index.tsx` 监听（`typeof window` 守卫，node 测试环境跳过）；`tests/panel-state.spec.ts` 新增 5 例互斥用例。
- `lib/client.js` 由修补后的 `src/` 重建（tsdown）。

## 验证

- `pnpm --dir plugins/dsh-sidechain run build`：通过（lib/index.js 12.8 kB + client bundle）。
- `pnpm --dir plugins/dsh-sidechain test`：8 文件 112 测试全过（含 5 例互斥用例）。
- better-sidebar 侧互斥补丁见 `docs/plugins/dsh-better-sidebar.md`；其 0.14.0 发布包不带 tsconfig/vitest 配置，src 与 lib/client.js 双处同步补丁，lib 经 `node --check` 语法验证。
- 深色模式与互斥的实机效果待构建发行版后确认。

## 同步动作

1. 上游若改用 DSH 语义 token（或提供自身变量定义），删除本映射补丁。
2. 同步上游新版本时重放映射段与互斥段（panel-style.ts 头部 / panel-state.ts / index.tsx / 对应测试）。

## 2026-08-23 依赖区间迁移

0.1.1-rc.2 迁移收敛的一部分：`@deepseek-ai/*` 依赖区间从 `^0.1.0-rc.6`/`^0.1.0-rc.8` 统一改为 `workspace:^`（workspace 成员）或 `^0.1.1-rc.2`（registry 包）。机械替换，无代码改动；解析目标从 registry rc.8 副本树切换到 workspace rc.2 树。反馈上游：待同步窗口。

## 2026-08-23 补记（二轮）

遗漏的 13 处 `0.1.0-rc.7` 精确钉版同样收敛为 `workspace:^`（第一轮正则只扫了 rc.6/rc.8 字面量）；连同 dsh-mygo 4 处 `^0.1.0-rc.2` 旧家族区间。收敛后 lockfile 旧家族引用归零：包 1665→1468、peer 变体键 464→88。
