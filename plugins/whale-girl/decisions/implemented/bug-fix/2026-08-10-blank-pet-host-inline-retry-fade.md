# Decision: 修复角色偶发空白——host 定位内联、素材加载重试、淡入 rAF 兜底

Status: implemented

## Problem

手测反馈「有时候角色不显示（变成空白）」。三个独立机制都会导致透明占位/不可见，且都带偶发性：

1. **host 基础定位依赖 CSS 注入**（环境事实系列漏网）：`[data-whale-girl]` 的 `position: fixed`/`right`/`bottom`/`width`/`height` 全部是注入的 CSS 类规则，host 创建时无内联——宿主清理/覆盖注入 style 标签（本项目反复发生的环境行为）时 host 变 static、无尺寸，掉出文档流不可见。此前 status/menu/hitarea/sprite/effects/heart/bubble 均已内联，唯独 host 基础定位未内联。
2. **素材加载失败静默且无重试**：`img.onerror = resolve` 一次性放弃——sheet 偶发加载失败（网络/缓存抖动）→ 该状态永久缺 sheet → `showPlaceholder` 透明占位；`loadAssets` 的 manifest 拉取失败同样静默返回 → 全部状态占位。
3. **状态切换淡入的 rAF 依赖可见性**：`stage.style.opacity='0'` + 双 `requestAnimationFrame` 恢复——页面在后台标签页时 rAF 不执行 → opacity 卡 0 → 宠物透明，直到下一次状态切换。

## Decision

- **host 基础定位/尺寸/层叠/字体 JS 内联**（apply 时 `host.style.cssText`）：`position: fixed; right/bottom; z-index; width/height: var(--pet-size); opacity: var(--pet-opacity)` 等——与既有「关键样式一律内联」环境事实纪律对齐；CSS 类规则保留作后备。
- **素材加载有限重试**：共享 `loadImageWithRetry(src, retries=3)`（onerror 递增退避 250ms×attempt 重试，耗尽 `resolve(null)`），`preload` 与 `switchCharacter` 共用；`loadAssets` 的 manifest 网络失败（fetch 非 2xx/异常）同样重试 3 次（500ms×attempt），坏 manifest（结构守卫失败）不重试——数据坏了重试也坏。
- **淡入 rAF 兜底**：双 rAF 恢复 opacity 之外加 `setTimeout(restore, 60)`——页面隐藏时 rAF 不跑也能恢复（后台 setTimeout 节流但不暂停），消除「切后台期间状态切换 → 回前台空白」。

## Alternatives considered

**A：只内联 host 定位（最小修复）。** 加载失败与 rAF 白屏是独立机制，用户「有时候空白」无法归因到单一机制——三项同批加固才覆盖全部已知白屏路径。

**B：加载失败后定时全量重试（loaded 缺项巡检）。** 复杂度高于 per-image 重试；per-image 重试覆盖「偶发失败」主场景，持续失败的 sheet 由 showPlaceholder 警告暴露（门禁保证仓库内素材全量）——弃巡检。

## Consequences

- 宿主清理 CSS 注入不再影响 host 可见性；偶发素材/manifest 加载失败会在 1s 内自愈；后台 tab 切换不再卡 opacity 0。
- 纯 client 层修复：重装 + 刷新即可生效，无需重启 web。
- 验证：build-client + 单测 + 本地门禁；验证站冒烟与行为探针回归。
