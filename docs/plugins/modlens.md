# modlens

## 基线

- npm 包：`@liustack/modlens`，版本 `3.22.1`（2026-08-20 发布，SLSA provenance）
- 上游仓库：`https://github.com/liustack/modlens.git`（纯 JS/TS；运行时依赖仅 `commander` + `undici`；无 Python、无原生二进制、无本地代理进程）
- 维护模式：`fork`（npm 快照 + 本地 seed 补丁；`prepublishOnly` 按 vendoring 规则移除）
- 取代对象：`dsh-vision-toolkit`（2026-08-22 退役，强制 Python 3.11+/35 MB 自举，跨平台无法保证；决策见 `docs/RESEARCH-modlens-vision-switch-20260822.md`）

## 分叉动机

1. **零配置默认与现状一致**：vision-toolkit 的默认是匿名 OpenCode Zen（`https://opencode.ai/zen/v1` + `mimo-v2.5-free`）。modlens 上游在 `~/.modlens/config.json` 缺失时回退到 `antigravity-cli`——但 Google Antigravity 条款禁止第三方软件访问，Marisa 不能依赖该回退。因此 fork 在首启时把同一个匿名 Zen 端点 seed 进共享配置文件，保持「装完即用」。
2. **模块加载形态**：modlens 的 dsh 插件入口（`dsh/index.js`）是随包发布的 ESM，dsh 侧零构建；npm 快照按仓库规则移除安装期生命周期脚本（本包仅 `prepublishOnly`，发布期产物 `dist/` 已随包分发）。

## 发行版修改（fork 增量）

- **`dsh/index.js`：首启 seed 匿名 Zen 默认**。
  - 新增 `seedZenDefault(configPath, seed, { force })`：`~/.modlens/config.json` 不存在时写入 `{ provider: 'openai', providers: { openai: { baseUrl: 'https://opencode.ai/zen/v1', apiKey: 'public', model: 'mimo-v2.5-free' } }, seededBy: 'marisa-modlens-zen-default@1' }`（0600；`seededBy` 为未知顶层键，modlens 忽略）。用户已有配置绝不覆盖；`force` 仅在测试中使用。
  - `apply()` 在 `config.seedDefault !== false` 时调用（profile 行可设 `seedDefault: false` 关闭）。写入失败不阻断插件启动（设置卡仍可引导手动配置）。
- **`package.json`**：新增 `"test:seed": "node --test tests/"`；移除 `prepublishOnly`。
- **`tests/seed-config.spec.mjs`**：4 项 node:test 单测（缺失时 seed / 已有配置不覆盖 / force 覆盖 / 写入失败返回 false）。

## 权限影响（PR 声明）

- 默认方案把用户主动提交给视觉工具的图片与提示词发送到 `https://opencode.ai/zen/v1`（OpenCode Zen 匿名服务，占位 key `public`，不发用户凭据；免费期数据可能用于改进模型，设置页文案需提示敏感图片勿传）。
- 回环 `/modlens/paste` 路由（仅回环地址、magic byte 校验、25 MB 上限）承接浏览器粘贴，落私有临时文件。
- `~/.modlens/config.json` 文件读写（0600）；用户切换 GLM/自定义 OpenAI 兼容端点时图片外发到对应端点。
- 不新增进程常驻、任意文件读取或密钥获取能力。

## 验证

- `node --test tests/`：4/4 通过（seed 行为）。
- **Zen 握手实测（2026-08-22）**：`GET /v1/models`、文本与带图 `POST /v1/chat/completions` 均 200（`Authorization: Bearer public` + 1×1 PNG data URL），确认占位 key 被 Zen 网关接受、`mimo-v2.5-free` 支持图片输入。
- `pnpm install --frozen-lockfile` / `pnpm test` / PR 边界检查：见分支验收记录。
- 待人工验收：rc7 真机 boot（设置→插件→插件配置出现 ModLens 卡、`modlens_read_image` 工具可达、纯文本模型粘贴接管时序）；rc8 换树后回归（设置卡 live-apply、`/goal /plan` 参考图信封）。
