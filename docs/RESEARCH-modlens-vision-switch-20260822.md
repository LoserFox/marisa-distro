# ModLens 替换 dsh-vision-toolkit 的评估与迁移方案

日期：2026-08-22
状态：**方案定稿，未落地**（用户选定「先只出方案不动手」；落地窗口建议随 rc8 harness 换树）
目标：以 [`liustack/modlens`](https://github.com/liustack/modlens) 取代 `dsh-vision-toolkit` 成为 Marisa 默认视觉集成；同时评估并展开 rc8 原生视觉（#2724）作为互补通道。

## 决策背景（用户原话意图）

1. vision-toolkit 强制要求 Python（系统 3.11+ 或 35MB 自举下载 + pip pillow/numpy/vtracer）——不可接受。
2. 跨平台兼容无法保证（Python 生态 + 自举下载链路）。
3. rc8 原生视觉方案「也不错」，要求详细展开。

## 一手来源与方法

- ModLens GitHub 仓库 README/README.zh-CN、`package.json`、`cordis.patch.yml`、`docs/harness-setup.zh-CN.md`、`skills/modlens/references/configure.zh-CN.md`（2026-08-22 实测抓取）。
- npm registry packument `@liustack/modlens`（dist-tag latest = **3.22.1**，2026-08-20T14:20:07Z 发布；SLSA provenance 附着）。
- 本仓 `docs/RESEARCH-rc8-migration-20260820.md` 第 6 节与附录 B.1（rc8 原生多模态，源码级核实，事实截止 2026-08-19 23:11 +0800）。
- 本仓 `docs/RESEARCH-adam-awesome-plugin-audit-20260815.md`（modlens 初评：Optional 替代视觉后端）。

## 一、ModLens 核实结果（3.22.1）

| 项 | 核实值 | 结论 |
|---|---|---|
| 运行时 | 纯 JS/TS（vite 构建），`dependencies` 仅 `commander ^13.1.0` + `undici ^8.10.0`；`engines.node >=22.19` | **无 Python、无原生二进制、无本地代理进程**，戳中用户两大痛点 |
| 包体 | npm 解压 ~608 KB / 34 文件 | 对比 vision-toolkit：8 MB vendored 树 + 35 MB Python 自举 |
| 生命周期脚本 | `postinstall/preinstall/prepare/install` 均无；`prepublishOnly: pnpm build`（发布期，产物随包分发） | 符合 Marisa npm 快照插件政策（不得重新引入安装期脚本） |
| 授权 | MIT；npm 附 SLSA provenance；配置 `~/.modlens/config.json` 写入权限 0600；设置卡不回读已存密钥 | 合规、可审计 |
| Windows | 与 macOS/Linux 同一套 CI 矩阵（Node 22/24）；无 `ps` 时进程祖先检测跳过、退环境变量指纹；外部引擎（Antigravity/Claude CLI）仅在存在 Windows 版的平台运行 | 可靠通路是 HTTP provider（gemini-api / OpenAI 兼容端点），全平台一致 |
| DSH 接触面 | `modlens_read_image` 工具（schema 随每次请求抵达）+ `(modlens vision)` 模型变体（llm 适配层）+ 附件读取器 + 执行前钩子 + 客户端半边 `webServer` 回环 `/modlens/paste` 路由（仅回环地址、magic byte 校验、25 MB 上限）+ 设置页配置卡（设置→插件→插件配置） | 接触面刻意很小，接口变动时「大声报错而非无声退化」；`webServer` 服务名 rc7/rc8 均未变 |
| 引擎配置 | 6 内置 provider（gemini-api / openai / anthropic / antigravity-cli / claude-cli / kimi-cli）+ 复用本机 claude/codex/opencode/pi/grok 登录态；故障转移链；guard（allowModels/denyModels）；未配置时落 `antigravity-cli` | **非零配置**：至少需要一个引擎 |

### 引擎门槛（开箱权衡的核心）

| 引擎 | 成本 | 速度 | 说明 |
|---|---|---|---|
| `gemini-api`（免费 key） | 3 分钟注册，无需信用卡 | 5-10 秒 | 推荐默认；免费档 ~1500 次/天；数据可能被 Google 用于改进 |
| `antigravity-cli` | 装 CLI + 浏览器登录一次 | 15-45 秒 | 完全免 key；登录无法自动化 |
| `openai`（兼容端点） | key + baseUrl + model | 5-10 秒 | 任意 OpenAI 兼容视觉端点（qwen-vl/GLM/Ollama/自建网关） |
| 复用本机 CLI | 已有登录态 | 15-45 秒 | claude/codex/opencode/pi/grok，`modlens doctor` 探测，逐家授权 |

**关键差异（2026-08-22 修正 + 用户定案）**：vision-toolkit 现状是「匿名 Zen/GLM 零配置」；ModLens 包本身**不自带托管匿名服务**——但这不阻塞 Marisa 预配：`openai` provider 是万能 OpenAI 兼容适配器（baseUrl/apiKey/model 三键），Marisa 可在首启时预写 `~/.modlens/config.json` 指向匿名端点（做法与现在给 vision-toolkit 配匿名默认相同）。**用户定案：保留匿名 Zen MiMo 2.5 作为默认**（沿用 vision-toolkit 长期验证的 `https://opencode.ai/zen/v1` + `mimo-v2.5-free`），第三方免费服务的下线风险由降级链（GLM → OVH opt-in）管理，而不是放弃匿名默认。

### 匿名/免费端点候选（已核实，2026-08-16 核查 + 2026-08-22 复核；用户定案 08-22）

| 端点 | key | 实测/风险 | 定位 |
|---|---|---|---|
| `https://opencode.ai/zen/v1`（OpenCode Zen，模型 `mimo-v2.5-free`） | 匿名（占位 key，等价 authMode none） | **Marisa 现默认，vision-toolkit 长期验证**；限时免费、免费期数据可能用于改进、随时下线 | **默认（保留）**，预配进 ModLens `openai` provider |
| `https://vision.anionex.me/v1`（vision-toolkit 上游默认；OpenAI 兼容；`gemini-3.7-flash`） | `api_key=free`，300 次/机/天 | 第三方运营、随时下线；图片外发 | 备选匿名端点（不默认） |
| `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`（OVH 匿名） | 无 key | 实测 GET /models 200、POST 429；2 RPM/IP/model；共享出口 IP 高峰先耗尽；图片完整外发 | 仅显式 opt-in 兜底 |
| `https://open.bigmodel.cn/api/paas/v4`（智谱 GLM-4.6V-Flash） | 需注册 key，官方标「完全免费」 | 中国用户最优云端备选；政策可变 | 设置页可切换（免费 key 引导） |
| `https://generativelanguage.googleapis.com/v1beta/openai/`（Gemini Free Tier） | 需 Google 账号（约 3 分钟） | 免费档 ~1500 次/天；免费层数据用于改进产品 | 免费 key 引导（备选） |
| `http://127.0.0.1:11434/v1`（本地 Ollama `qwen3-vl`） | 无 | 图片不出本机；需装 Ollama + 下载模型 + 硬件门槛 | **不做默认探测**（用户定案：普通桌面用户不应承担安装负担）；仅作为用户主动选择的自定义 OpenAI 兼容端点 |
| `antigravity-cli`（复用登录） | 无 key | Google 官方 FAQ 禁止第三方软件访问，可能封号 | ⚠️ 不作为默认/宣传（合规红线） |

### 默认链（用户定案：保留 Zen 匿名默认，不搞本地 Ollama 探测）

ModLens 支持多 provider 故障转移链（配置的 API provider 先试、agent CLI 兜底、`meta.attempts` 记录每次尝试）：

1. **默认：匿名 Zen MiMo 2.5**（零配置，开箱即用）——预配 `openai.baseUrl=https://opencode.ai/zen/v1`、`openai.model=mimo-v2.5-free`、`openai.apiKey=占位值`（等价 vision-toolkit 的 authMode none 语义）。
2. **设置页可切换：智谱 GLM-4.6V-Flash**（中国网络、官方标免费，需 key）。
3. **兜底（opt-in）：OVH 匿名链**——用户显式勾选，UI 明示图片外发 + 2 RPM/IP 限流。

**为何不搞本地 Ollama 探测**（用户质询，2026-08-22）：Ollama 方案源自 2026-08-16 `free-vision-options` 的「隐私最优本地优先」取向，但那是 vision-toolkit 时代的旧建议，与 Marisa「普通桌面用户、装完即用」的产品立场冲突——探测/引导用户装 Ollama 意味着引擎安装 + 3.3 GB 模型下载 + 内存/显存门槛，把零配置卖点换成安装负担。而匿名 Zen 默认已被 vision-toolkit 长期验证，继续沿用并用降级链兜底，是更符合发行版定位的选择。

### 首启引导（Marisa 侧补，默认已配好，无需引导「去哪拿模型」）

ModLens 自带设置卡只管引擎切换。Marisa 首启默认**预配 Zen 匿名端点，零操作可用**；引导只针对备选路径：

| 场景 | 路径 | 说明 |
|---|---|---|
| 默认 | 无需任何操作 | Zen 匿名默认已预配，开箱即用 |
| 中国网络/需要更稳 | 智谱开放平台注册 → GLM-4.6V-Flash key | 设置页一键切换；官方标完全免费，政策可变 |
| 自带端点 | 任意 OpenAI 兼容视觉端点（baseUrl/key/model） | 设置页自定义；qwen-vl/自建网关等 |
| 复用本机 | `modlens doctor` 探测 Claude Code/Codex/OpenCode/Pi，逐家授权 | 已有登录态；每次复用 meta.warnings 明示额度 |
| 免注册 | Antigravity CLI | ⚠️ 条款风险，不作为默认/宣传 |

## 二、rc8 原生视觉展开（用户要求「仔细展开」）

来源：`docs/RESEARCH-rc8-migration-20260820.md` 第 6 节 + 附录 B.1（对照 rc8 树 `141eb6fef` 源码逐项核实）。

| 维度 | 实际情况 |
|---|---|
| 模型范围 | 仅 `deepseek-official` 适配器 + 显式声明 `inputModalities: [text, image]` 的模型；catalog 默认**不含** vision-exp（`deepseek-v4-flash-vision-exp` 不随目录公布，部署可自行启用）；未列出/未声明的模型仍仅文本 |
| 图片通路 | `ImageAttachmentRef` → 单次请求 `image_url` data URL；规范消息只存引用，Data URL 仅存在于单次请求；不支持外部 URL / Files API / 图片输出 |
| 格式与上限 | PNG/JPEG/WebP/GIF；`maxRequestImageBytes` 默认 20 MiB，超限从最老图片起替换为固定占位文本；413 归类 `INVALID_REQUEST`；准入含 `maxImageDimension` |
| Attachment wire | rc8 新增 `EncodedImageAttachment`（mediaType/data/name）与 `admitEncodedImages()` 批量准入；`saveImages()` 有 count/aggregate-byte 限额与 validate-all-before-save 顺序 |
| 命令信封 | `CommandDefinition.input.images: boolean`（缺省 false）；`commands/execute` 新增必填 `images` 参数；`/goal` `/plan` 支持参考图（#2623） |
| 图片来源 | user 与工具结果；system/assistant 历史图 `UNSUPPORTED_CONTENT` |
| 隐私 | 图片只到 DeepSeek 官方端点，不外发第三方 |
| 能力边界 | **无工具化能力**：没有 grounding 像素坐标、元素检测、crop、trace、pixel diff、长图 OCR |

**结论**：原生视觉是「收图通道」不是「视觉插件」。它免费、私密、零依赖，但默认目录没有视觉模型可用（vision-exp 不公布），且不含任何本地图像工程工具。定位与 ModLens（结构化证据转写）互补：原生 = 让 DeepSeek 视觉模型自己看原图；ModLens = 把图转成文本证据喂给纯文本模型。

## 三、三方对比

| 维度 | rc8 原生 | ModLens | dsh-vision-toolkit（现状） |
|---|---|---|---|
| 运行时依赖 | 无（harness 内建） | 纯 JS ~608 KB（commander+undici） | Node + Python 3.11+ 或 35 MB 自举 + pip |
| 开箱即用 | 默认无视觉模型（vision-exp 不公布） | 预配匿名 Zen 默认，零配置（同现状） | 匿名 Zen/GLM 零配置 |
| 模型范围 | 仅 DeepSeek 官方视觉模型 | 任意 OpenAI 兼容 / Anthropic / Gemini / 本机 CLI | 任意端点 + 文本模型变体 |
| 证据能力 | 模型自己看原图 | 全文转写 / 版面区块 / 实体关系（结构化证据） | 转写 + grounding 坐标 + 元素检测 |
| 本地图像工程 | 无 | 无 | crop / SVG trace / pixel diff / 主色 / 前景提取 / HTML 截图（6 项纯本地） |
| 隐私 | 只到官方端点 | 外发到所配引擎（复用额度在 meta.warnings 明示） | 外发 Zen/GLM 第三方 |
| 维护成本 | 随 harness | 上游极活跃（3.22.1 于 2026-08-20 发布） | 上游活跃但依赖 Python 环境 |
| 与对方共存 | — | 只接管被元数据确认纯文本的模型，声明图片模态的视觉模型保留原生贴图 | shouldWrapModel 对已声明 image 模态模型返回 false |

**原生 + ModLens 可叠加**（非二选一）：ModLens 的裁决在 host 侧按真实模型元数据（`inputModalities`）进行，元数据缺失绝不当作「已确认纯文本」，所以视觉模型保留原生通路。

## 四、迁移方案（未执行，待批准）

### 4.1 移除 dsh-vision-toolkit

- 删除 `plugins/dsh-vision-toolkit/`（含 vendored 上游快照）。
- `bundles/marisa-bundle/cordis.patch.yml`：删除 vision-toolkit 挂载行（`- id: vision-toolkit` / `name: '@dsh-external/dsh-vision-toolkit'`，约 80-86 行）。
- `bundles/marisa-bundle/package.json` 与根 `package.json`：删除 `@dsh-external/dsh-vision-toolkit` 依赖条目。
- `dsh-allinone/package.json`：删除引用（`legacy/` 不动）。
- `maintenance/upstreams.json`：移除 `dsh-vision-toolkit` fork 条目。
- `docs/plugins.md` 插件矩阵与 `docs/plugins/dsh-vision-toolkit.md`：删除或标注退役。
- **附带收益**：仓库内唯一一份 `UPSTREAM_MANIFEST.json` 哈希快照消失 → `desktop/bundle/make-bundle.ps1` 的 test-dir/`*.map` 裁剪不再有受害者，本次「packaged upstream file is missing: tests/test_vision_client.py」问题随移除一并根除；残留状态目录 `~/.dsh/cache/dsh-vision-toolkit` / 工作区 `.dsh-vision-toolkit/` 可清理。

### 4.2 接入 `@liustack/modlens@3.22.1`（npm 快照插件）

- 根 `package.json`：登记 `"@liustack/modlens": "workspace:^"`（或按 npm 快照既有模式）。
- `pnpm-workspace.yaml` → `minimumReleaseAgeExclude`：**必须**白名单 `@liustack/modlens@3.22.1`（2026-08-20 发布，默认冷却期会拦截；ModLens 作者在 harness-setup 文档里自己写明了 pnpm 11 minimumReleaseAge 的这个坑）。
- `bundles/marisa-bundle/cordis.patch.yml`：挂载 `- id: modlens` / `name: '@liustack/modlens'`（上游自带 cordis.patch.yml 即此形态）。
- `docs/plugins/modlens.md`（fork 文档规范：版本、补丁面、验收）与 `maintenance/upstreams.json`（mode: npm snapshot）。
- **预配匿名 Zen 默认（关键差异点）**：首启预写 `~/.modlens/config.json` 的 `providers.openai` = `{ baseUrl: 'https://opencode.ai/zen/v1', apiKey: '<非秘密占位值>', model: 'mimo-v2.5-free' }` 并设 `provider: 'openai'`，等价 vision-toolkit 的 `authMode: none` 匿名默认；写入权限 0600。占位 key 选择须兼容 Zen 网关（vision-toolkit 适配层传 `public` 已验证，ModLens 的 Authorization 头格式需真机确认）。
- 依赖核对：`undici ^8.10.0` 与 harness 现有 undici 版本（v6 风格 `EnvHttpProxyAgent`）的解析关系需在 `pnpm install --frozen-lockfile` 时确认无冲突。
- **权限影响（PR 必写）**：新增网络能力——图片外发到用户配置的视觉引擎（默认 `opencode.ai/zen/v1`，不发送用户 API Key）；回环 `/modlens/paste` 路由（仅回环地址，magic byte 校验，25 MB 上限）；`~/.modlens/config.json` 文件读写（0600）。不新增进程/密钥获取能力。

### 4.3 验收清单

- `pnpm install --frozen-lockfile`、`pnpm test`、PR 边界检查（`scripts/verify-pr-boundaries.mjs`）。
- rc7 真机：boot 无报错、设置→插件→插件配置出现 ModLens 卡、`modlens_read_image` 工具可达、粘贴接管时序（纯文本模型 → 路径接管；视觉模型 → 原生）。
- `modlens doctor` 体检（引擎探测、guard、复用授权）。
- rc8 换树后回归：设置卡 live-apply（#2613 store 重构）、粘贴接管、`/goal /plan` 参考图信封不冲突。
- 首启：默认预配 Zen 匿名端点（零操作）；设置页引导备选（GLM key / 自定义 OpenAI 兼容端点 / 复用本机 CLI）；**真机确认 ModLens→Zen 握手**（占位 key 的 Authorization 头被 `opencode.ai/zen/v1` 接受）。

## 五、风险与未决项

| 项 | 风险 | 处置 |
|---|---|---|
| 开箱引擎门槛 | ~~从「匿名零配置」回退为「一次引擎引导」~~（已消除） | 用户定案：**保留匿名 Zen MiMo 2.5 为默认**（预配进 ModLens `openai` provider，零配置同现状）；第三方免费服务下线风险由降级链管理（设置页 GLM → opt-in OVH 兜底）；不做本地 Ollama 探测（用户定案：普通用户不承担安装负担） |
| rc7 兼容性 | ModLens 文档明示「dsh 还在开发者预览阶段，插件接口可能变化」 | 真机 boot 验收；接口变化时插件「大声报错而非无声退化」 |
| 上游发布密度 | 3.22.1 之后版本迭代快，快照版本会落后 | 版本点名安装；npm 快照策略按既有流程升级 |
| undici 版本 | `undici ^8.10.0` 与工作区现有版本差异 | frozen-lockfile 解析确认，必要时 override |
| 与 rc8 迁移时序 | 迁移工作量与 rc8 换树叠加 | 建议随 rc8 换树同 PR 落地；vision-toolkit 0.1.36 本身卡 rc8 类型面，正好一并处理 |
| 当前部署后端报错 | 迁移落地前，`tests/test_vision_client.py` 缺失错误仍在当前 GUI | 若需在迁移前恢复，单独做最小修复（复制文件回部署树 + make-bundle.ps1 豁免）；用户已选定暂不落地，记录为未决 |

## 六、结论

1. ModLens 在「无 Python、跨平台、轻量」三个维度全部优于现状，且符合 Marisa npm 快照插件政策（无安装期脚本、MIT、SLSA provenance）。
2. 开箱体验**保持匿名 Zen 零配置**（用户定案）：ModLens 的 `openai` provider 预配 `https://opencode.ai/zen/v1` + `mimo-v2.5-free`（占位 key 等价 authMode none），与 vision-toolkit 现状一致；不做本地 Ollama 探测；第三方免费服务下线风险由降级链（GLM → opt-in OVH）管理；Antigravity CLI 复用因服务条款风险不作为默认。
3. 推荐组合：**ModLens（默认读图桥）+ rc8 原生（DeepSeek 视觉模型通道）**，两者按模型元数据自动分工，可叠加不冲突。
4. 落地窗口：随 rc8 harness 换树一并执行；当前仓库保持只读（2026-08-22 用户指示，有其他 agent 在工作）。
