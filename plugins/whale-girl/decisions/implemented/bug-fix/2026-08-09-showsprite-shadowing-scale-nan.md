# Decision: showSprite 参数遮蔽修复——scale NaN 致尺寸/flip 双回归

Status: implemented

## Problem

配置系统重构（2026-08-09-config-system）把 `SPRITE_MAX`（数值 110）改为 `cfg.size` 后，`showSprite(name, cfg)` 的参数 `cfg` **遮蔽**了模块级客户端配置 `cfg`（`let cfg = { ...CFG_DEFAULTS }`）——调用点传入的是 manifest 状态集（`{sheet, frames, fps, loop, motion}`，无 `size` 字段），`cfg.size` 恒为 `undefined` → `scale = Math.min(NaN, NaN, 1) = NaN` → `transform: scale(NaN) scaleX(flip)` 非法被浏览器整条丢弃。结果两个用户可见 bug：① sprite 以素材原始尺寸（256px）渲染，溢出 110px 舞台——宠物尺寸变大；② `scaleX(flip)` 永不生效——drag/walk 方向不跟随鼠标。两个 bug **同源**（同一行 NaN）。

## Decision

- **`showSprite` 参数改名 `cfg` → `anim`**：解除对模块级客户端配置 `cfg` 的遮蔽（调用点全部传 manifest 状态集，改名零风险）。
- **目标尺寸改用宿主实际盒**：`const target = host.offsetWidth || 110`——配置 size 走 CSS 变量 `--pet-size` 生效（`applyClientConfig`），manifest 状态集本就无 `size` 字段；`scale = min(target/frameW, target/size.h, 1)` 用宿主实际值，语义正确。
- **冒烟补强**：`verify-client-smoke` 断言 sprite `transform` 为合法有限 `scale(...)` 数值（此前只断言元素存在，NaN 静默穿过所有门禁——本次漏网根因）。

## Alternatives considered

**A：给 manifest 每个状态补 `size` 字段。** 与配置系统设计矛盾（size 是插件级配置，经 `--pet-size` 生效，不进状态条目）；要改 15 状态 + 门禁 + 文档——弃。

**B：仅防 NaN（transform 三元兜底）。** `Number.isFinite(scale) ? scale... : scaleX(flip)`——翻转恢复但缩放仍丢（sprite 以 256px 原尺寸渲染），治标不治本——弃。

## Consequences

- 宠物尺寸正确缩放到舞台盒（scale 0.43 = 110/256）；drag/walk 方向翻转恢复（scaleX 生效）。
- 冒烟新增 transform 合法性断言，此类回归（NaN 毒化 CSS）下次必被拦。
- 教训：参数名遮蔽模块级变量是高风险模式，重构改常量引用时须核对作用域。
