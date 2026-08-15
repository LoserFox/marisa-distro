# Decision: Node half 加固批次（路由错误码 / CSRF / assets 穿越 / pet_status / contributes 门禁）

Status: implemented

## Problem

审查（P3 批次）在 Node half 发现一组健壮性与契约问题：畸形/非对象 body 走 500 而非 400、readBody 无上限、/state 无缓存防护且不守卫方法、/interact 写端点无跨源校验（恶意网页可喂宠物/刷经验）、assets 路由在 Windows 上可被 `%5c` 编码穿越（`\` 段未净化）、模型只有动作工具没有只读状态工具（决策前无法看状态）、contributes 与注册工具的一致性只在宿主 enable 时兜底（本地无门禁）、tick 时钟回拨会二次计数、feed/play 依赖"宿主必须先 tick"的脆弱契约。

## Decision

- **路由错误码收口**：`/state` 仅 GET（否则 405 + `allow: GET`）、响应 `cache-control: no-store`（轮询端点禁启发式缓存）；`/interact` 仅 POST（405 + `allow: POST`）、body 上限 1KB（超限 413）、`JSON.parse` 失败 400（invalid JSON body）、非对象 body 400、成功响应 no-store。
- **CSRF 面**：`isCrossOrigin(headers, host)`（src/interact.mjs 纯函数）——`Sec-Fetch-Site` 优先（非 same-origin/none 拒绝），其次 `Origin`（host 不匹配拒绝），无头（非浏览器客户端）视为同源；跨源 403。
- **assets 加固**：`sanitizeAssetPath` 拒绝含 `\` 的段（Windows 分隔符穿越）；`decodeURIComponent` 移入 try（畸形编码 400 而非无响应）；响应 `cache-control: no-cache`（替换同名 sheet 后浏览器重新校验）。
- **pet_status 只读工具**：结构化输出（hunger/mood/level/xp object schema + 中文 render），模型决策前可查状态；`contributes.tools` 同步。
- **contributes 一致性门禁**：新增 `scripts/gates/verify-contributes.mjs`（限定 `defineTool({ ... name: '...' })` 范围的正则扫描 + 自证测试），加入本地门禁组——工具面漂移在 enable 前被拦。
- **状态机契约强化**：`feed`/`play` 内部先吸收流逝衰减（传 stale 状态也安全，宿主不再必须先 tick）；`tick` 的 `updatedAt` 单调不减（时钟回拨保持锚点，恢复后不二次计数）。

## Alternatives considered

**跨源校验仅查 Origin。** 无 Origin 的旧浏览器/隐私模式会漏判；Sec-Fetch-Site 优先、Origin 兜底、无头视为同源的三级策略覆盖面更全，且 curl 等本地工具不被误伤。

**contributes 门禁用完整 JS 解析。** 无零依赖方案可用（仓库零 npm 依赖纪律）；限定 `defineTool({` 范围的正则配合自证测试（含"普通对象字面量 name 字段不误匹配"用例）足够可靠。

**feed/play 保持"宿主必须先 tick"。** 契约脆弱且无强制；内部吸收 tick 在 elapsed≈0 时是恒等，宿主即使仍先 tick 也幂等安全（组合测试锁定）。

**pet_status 不做。** 模型只能动作后从字符串反推状态；结构化只读工具是决策前置，收益明确。

## Consequences

- 错误码语义正确（4xx 与 5xx 不再混用）；轮询不会读到冻结状态；跨源写被拒；Windows 宿主下 assets 越界读被堵。
- 工具面一致性从"enable 时宿主兜底"提前到本地门禁 + CI；pet_status 进入工具面（模型可编程消费数值状态）。
- feed/play 对外 API 自洽（任意调用时序安全）；时钟回拨语义明确（宠物暂停而非倒走）。
- 已知未覆盖（后续批次）：状态持久化（独立 feature）、`visibilitychange` 轮询节流、a11y 与 reduced-motion（P1 批次）。
