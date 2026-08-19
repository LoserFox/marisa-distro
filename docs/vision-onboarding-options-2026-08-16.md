# Marisa Vision 后端与首次启动方案（2026-08-16）

## 结论

普通用户的默认路线不应是 ModelScope、OpenCode Zen、MiMo Token Plan 或
ZCode 内部能力。建议按地区提供同一个模型的两条官方 API 路线：

- 中国大陆：智谱 BigModel `glm-4.6v-flash`。
- 其他地区：Z.AI `glm-4.6v-flash`。

两者都由官方标为完全免费，支持图像、视频、文本和文件输入，使用 OpenAI
Chat Completions 风格的多模态请求。中国站用 `+86` 手机短信登录/自动注册；
全球站可用邮箱以及 Google/GitHub（可用地区）。免费模型不要求先充值，但都
需要用户自己的账号和 API Key。

真正不注册、不把图片上传云端的路线只有本地推理。建议把
`Ollama + qwen3-vl:4b` 做成“本地私密”选项，而不是随 MSI 捆绑 3.3 GB 模型。

`MiMo-V2.5` 本身当然能看图，而且是很有价值的质量候选；问题在于小米官方云
API 不是免费 API。OpenCode Zen 当前提供免费的 `mimo-v2.5-free`，但明确是
限时活动，免费期数据可能用于改进模型，且限流和免卡注册边界不透明。因此它
适合实验选项，不适合唯一默认。

## 方案对比

| 方案 | 图像输入 | 免费性质 | 注册摩擦 | OpenAI 兼容 | 稳定性/隐私边界 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| BigModel `glm-4.6v-flash` | 是；另支持视频、文件 | 官方价格表输入/输出/缓存均免费 | `+86` 手机短信；未注册手机号自动建号；无需先绑卡 | Chat Completions 兼容 | 账号级动态限流；云端处理 | 中国大陆默认 |
| Z.AI `glm-4.6v-flash` | 是；另支持视频、文件 | 官方标为 Completely Free | 邮箱；可用地区支持 Google/GitHub；免费模型无需充值 | Chat Completions 兼容 | 无公开固定限流/SLA；API DPA 较清楚 | 全球默认 |
| ModelScope API-Inference | 是；当前模型表含 Qwen3-VL/Qwen3.5 | 免费体验，但按“魔粒”扣减，额度/并发动态调整，不是无限免费 | 手机注册，还必须绑定阿里云账号并完成实名认证 | LLM/视觉 Chat Completions 兼容 | 官方明确非商业化、无 SLA，原则上保障单并发 | 已有阿里云实名用户的备选 |
| 小米 MiMo-V2.5 API | 原生图像/视频/音频 | **不免费**；按量或 Token Plan | 小米账号；邮箱/手机号/小米 ID，也支持部分第三方登录；使用 API 需余额/订阅 | 官方提供常见工具接入，需按官方 API 配置 | 云端处理；价格低但不是零成本 | 付费质量候选 |
| OpenCode Zen `mimo-v2.5-free` | 是；官方模型目录列 text/image/audio/video | **限时免费** | GitHub/Google；标准 Zen 开户流程包含 billing details，官方未承诺免费模型可跳过 | `POST /zen/v1/chat/completions` | 免费期数据可用于改进模型；美国托管；无固定限流/SLA | 明示风险后的实验选项 |
| ZCode 五日试用 | ZCode 客户端可接图片 | 新用户 5 天试用，不是持续 API 免费额度 | Z.ai/BigModel 登录或自己的 API Key | 不构成可复用后端 | 客户端会依据 provider/model/protocol 决定是否保留图片 | 不能作为 Marisa 后端 |
| Z.AI Vision MCP | 是；8 个视觉工具 | **不免费**；Coding Plan 专属 | 购买个人 Coding Plan，配置自己的 `Z_AI_API_KEY` | MCP，不是普通 Chat Completions | 套餐条款限制支持工具、共享、代理和下游应用 | 高级个人 MCP，不得共享套餐 Key |
| Ollama `qwen3-vl:4b` | 是 | 本地运行，无调用费 | 不注册；需安装 Ollama 并下载约 3.3 GB 模型 | 本地 `/v1/chat/completions` 支持 Vision | 图片不离机；性能取决于硬件 | 本地私密选项 |

## ModelScope：仍免费，但不适合普通用户默认

ModelScope 官方文档仍写明 API-Inference 面向注册用户免费提供，也给出了视觉
模型的 OpenAI Chat Completions 请求和 Base64 图片示例。当前无需凭证访问
`GET https://api-inference.modelscope.cn/v1/models` 会返回 200；2026-08-16
探测的模型表中包含 `Qwen/Qwen3-VL-8B-Instruct`、
`Qwen/Qwen3-VL-235B-A22B-Instruct` 和 Qwen3.5 多模态模型。

但“免费”已经是受控的社区体验：

- 使用前必须绑定阿里云账号并完成实名认证。
- 每次调用按模型档位扣 0.5、1 或 2 魔粒；余额足够才能继续调用。
- 并发会随平台压力动态变化，官方只以保障单并发为原则。
- 官方明确说它是非商业化、非盈利服务，不适合需要高并发或 SLA 的线上任务。
- 较老模型可能下架。

因此 ModelScope 很适合已经有阿里云实名账号的中国开发者，不适合让第一次安装
Marisa 的普通用户完成“手机号注册 -> 阿里云绑定 -> 实名认证 -> Token”四步
流程，也不应作为后台静默兜底。

来源：

- [API-Inference 介绍](https://www.modelscope.cn/docs/model-service/API-Inference/intro)
- [API-Inference 使用限制](https://www.modelscope.cn/docs/model-service/API-Inference/limits)
- [ModelScope 注册流程](https://www.modelscope.cn/docs/accounts/registration)
- [ModelScope Access Token](https://modelscope.cn/my/myaccesstoken)

## GLM-4.6V-Flash：最适合普通用户的云端免费默认

智谱官方将 `GLM-4.6V-Flash` 定义为 GLM-4.6V 的免费版本：9B、128K 上下文，
支持图像、视频、文本、文件、思考模式、流式输出与 Function Calling。中国站
价格页把输入、输出、缓存存储和缓存命中都列为“免费”。官方示例使用：

```text
POST https://open.bigmodel.cn/api/paas/v4/chat/completions
model = glm-4.6v-flash
content = [{ type: image_url, ... }, { type: text, ... }]
```

中国站的注册页当前只需 `+86` 手机验证码，未注册手机号自动创建账号，并显示
新用户体验包；调用免费模型不要求先填写信用卡。本次无 Key 探测
`GET /api/paas/v4/models` 正常到达官方服务并返回 401/错误码 1001，证明端点
活跃且强制 Bearer Key，没有匿名共享入口。

限流不是一个可写死的公开数字。智谱按账户权益和模型分别限制并发，并会在高峰
期动态保护；1302 表示用户限流，1305 表示平台过载。Marisa 必须实现队列、退避
和可见的降级提示，不能把“价格为零”解释成 SLA。

全球用户应走 Z.AI 的同名公共 API，而不是借用 ZCode 登录态。Z.AI 官方同样将
`GLM-4.6V-Flash` 标为 Lightweight, Completely Free，提供公开 API Key 和
OpenAI SDK 接入，并在 API 附加条款中允许集成进下游应用。全球站一般在新加坡
处理；API DPA 表示 Input/Output 实时处理、不保存且不用于模型改进，除非用户
明确同意。FAQ 同时提示缓存功能可能缓存部分请求，因此 Marisa 应默认关闭可关闭
的服务端缓存，并在隐私说明中披露。

来源：

- [中国站 GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash)
- [中国站 API 价格](https://bigmodel.cn/pricing)
- [智谱速率限制](https://docs.bigmodel.cn/cn/api/rate-limit)
- [智谱隐私政策](https://docs.bigmodel.cn/cn/terms/privacy-policy)
- [全球站 GLM-4.6V](https://docs.z.ai/guides/vlm/glm-4.6v)
- [全球站价格](https://docs.z.ai/guides/overview/pricing)
- [全球站快速开始](https://docs.z.ai/guides/overview/quick-start)
- [Z.AI API 条款和数据处理附录](https://docs.z.ai/legal-agreement/terms-of-use)

## MiMo-V2.5：模型可以，免费后端不稳定

小米官方资料确认 `MiMo-V2.5` 是原生全模态模型，支持文本、图像、视频、音频，
总参数 310B、激活参数 15B，最长 1M 上下文。官方公布了视觉、文档、视频和多模态
Agent 基准，但没有与 `GLM-4.6V-Flash` 做同一套独立 A/B，因此不能仅凭厂商榜单
断言哪一个在 Marisa 的截图、OCR、UI 定位任务上更好。

小米公共 API 当前价格为：

- `mimo-v2.5`：国内未命中缓存输入 1 元/百万 tokens，输出 2 元/百万 tokens；
  海外分别为 0.14/0.28 美元。
- Token Plan 最低档是付费订阅；页面没有持续免费的 API 档。
- 开源权重可以自行部署，但 310B 总参数不属于普通 PC 的开箱即用方案。

OpenCode Zen 是当前唯一值得关注的免费 MiMo 云入口。OpenCode 官方 Zen 文档和
官方维护的 models.dev 目录都确认 `mimo-v2.5-free` 接受 image 输入、价格为 0，
并走 OpenAI Chat Completions。无图片探测也确认 `/zen/v1/models` 当前列出该
模型。但它有三个不可忽略的条件：

1. 官方明确写“limited time”。
2. 免费期收集的数据可能用于改进模型，不适合敏感截图。
3. 匿名纯文本探测已经返回 429；标准开户文档包含 billing details，官方没有承诺
   仅使用免费模型时一定能免信用卡。

所以 `mimo-v2.5-free` 应显示“实验 / 限时 / 可能用于改进模型”徽标，不进入静默
fallback，更不能内置共享 Zen Key。

来源：

- [MiMo-V2.5 官方模型说明](https://mimo.xiaomi.com/mimo-v2-5)
- [MiMo 按量 API 价格](https://mimo.mi.com/docs/price/pay-as-you-go)
- [MiMo Token Plan](https://platform.xiaomimimo.com/token-plan)
- [OpenCode Zen](https://opencode.ai/docs/zen/)
- [OpenCode 官方模型目录 API](https://models.dev/api.json)

## ZCode 与 Vision MCP：不是免费公共后端

ZCode 是一个客户端/ADE。它的新用户试用是首次使用后的 5 天权益，不是可以给
Marisa 调用的持续免费 API。ZCode 能接收图片，但官方说明它会根据 provider、
model catalog、内置规则和 API protocol 判断图片是否受支持；不支持时会删除
图片并插入文本说明。因此不存在一个可以从 ZCode 中“抽出来”的统一内部 Vision
API，登录 ZCode 获得的 OAuth/试用额度也不应被 Marisa 复用。

智谱真正公开的视觉工具层叫 Vision MCP，npm 包为 `@z_ai/mcp-server`。它基于
GLM-4.6V，包含 UI-to-code、OCR、报错截图分析、图表、UI diff、通用图像/视频
分析等 8 个工具，可供标准 MCP 客户端使用。但它属于 GLM Coding Plan；套餐从
付费档开始，调用按 credits 计费。订阅条款还限制支持的工具、SDK/第三方集成、
应用/机器人/SaaS、公共代理和额度共享。

可允许高级用户在自己的机器上、用自己的合规套餐配置 Vision MCP；不得把维护者
或整合包的 Coding Plan Key 放进 Marisa，也不得把它代理给所有用户。

来源：

- [ZCode 欢迎页与五日试用](https://zcode.z.ai/en/docs/welcome)
- [ZCode provider 与图片判定](https://zcode.z.ai/en/docs/configuration)
- [ZCode MCP 服务](https://zcode.z.ai/en/docs/mcp-services)
- [智谱 Vision MCP](https://docs.bigmodel.cn/cn/coding-plan/mcp/vision-mcp-server)
- [Coding Plan 订阅条款](https://docs.z.ai/legal-agreement/subscription-terms)

## 本地路线：真正零账号，但不是零安装

Ollama 官方 OpenAI 兼容接口支持 `/v1/chat/completions` 的图片 URL 和 Base64
图片，示例直接使用 `qwen3-vl:8b`。`qwen3-vl:4b` 当前约 3.3 GB，支持 Text +
Image 和 256K 上下文；`8b` 约 6.1 GB。它没有云 API Key 和每次调用费用，图片
不离开本机，但首次下载、磁盘、内存和推理速度都需要在向导里明确说明。

来源：

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [Ollama qwen3-vl](https://ollama.com/library/qwen3-vl)

## 建议的首次启动向导

### 第 1 屏：只让用户选择隐私/便利性

显示三个选择，不先暴露 provider 术语：

1. **云端免费（推荐）**：速度快，需要注册；图片会发送给所选服务商。
2. **本地私密**：无需账号；需要安装 Ollama 和下载约 3.3 GB 模型。
3. **我已有其他账号**：ModelScope、OpenCode Zen、小米 MiMo、自定义 OpenAI。

根据系统区域只改变推荐链接：中国大陆默认 BigModel，其他地区默认 Z.AI。不要用
IP 强制分流，用户必须能手动切换。

### 第 2 屏：把云端注册压缩为三个动作

中国大陆：

1. “注册智谱”打开官方登录页；手机号验证码会自动注册。
2. “创建 API Key”打开官方 Key 管理页。
3. 用户粘贴 Key；Marisa 存入 DSH Credential 服务，不写配置明文、不进日志。

全球：

1. “注册 Z.AI”打开官方注册页（邮箱/Google/GitHub）。
2. “创建 API Key”打开官方 Key 管理页。
3. 粘贴 Key并安全保存。

向导必须写清“免费模型无需充值”，同时避免承诺“永久免费”；显示“价格状态最后
核验：2026-08-16”，后续通过签名的远程 provider registry 更新状态和下线提示。

### 第 3 屏：自动验证，但不上传用户图片

1. 用模型列表或纯文本请求验证 Base URL、Key 和模型是否存在。
2. 只有用户选择“测试视觉”后，发送整合包自带的无隐私棋盘格测试图；按钮旁明确
   写“将测试图发送给服务商，不会发送你的文件或剪贴板内容”。
3. 成功后才启用自动粘贴图片。验证结果记录错误码和耗时，不记录 Key、请求正文、
   图片或完整响应。

### 正常使用时的隐私文案

首次真正发送用户图片前显示一次、之后可在设置里查看：

> 这张图片将发送至 {服务商} 的云端模型进行分析。图片可能包含账号、路径、聊天
> 内容或个人信息。请先裁剪或遮挡敏感区域。Marisa 不会在不同云服务之间自动转发
> 图片，除非你单独开启“允许云端备用服务”。

OpenCode Zen 追加：

> 此免费模型为限时活动。服务商说明免费期数据可能用于改进模型，请勿提交个人或
> 机密信息。

ModelScope 追加：

> 该服务是动态额度的社区体验，不提供高并发或 SLA；调用会消耗魔粒。

## Fallback 和错误恢复

默认顺序应是“同 provider 内恢复”，而不是悄悄把图片发给另一家公司：

1. 当前云 provider：单并发队列，网络超时只重试一次。
2. `429`、GLM 1302：指数退避并提示排队；不要立即切服务商。
3. GLM 1305/平台过载：提示稍后重试，并显示用户已经启用的备用项。
4. `401/403`：停止重试，打开“更新 API Key”；绝不回退到共享匿名端点。
5. `model_not_found`：刷新签名 provider registry，提示模型已下线或改名。
6. 图片过大/格式错误：在本地缩放、转码后再询问是否重发。
7. 只有用户事先开启“允许把图片发送给备用云服务”，才按其明确排序切换；每次切换
   在对话里显示目标服务商。Zen 这种会收集训练数据的免费服务永不自动进入 fallback。
8. 本地 Ollama 已安装且模型就绪时，可以在不泄露图片的情况下自动回退到本地；
   未安装时只给安装入口，不自动下载数 GB 文件。

建议默认 fallback：

- 中国大陆：BigModel `glm-4.6v-flash` -> 本地 Ollama（若已就绪）。
- 全球：Z.AI `glm-4.6v-flash` -> 本地 Ollama（若已就绪）。
- ModelScope、Zen MiMo、付费 MiMo 只在用户明确配置并排序后参与。

## 发布前必须验证

不要仅凭厂商 benchmark 决定 GLM 与 MiMo。用同一组无敏感测试图片、同一提示词，
对 BigModel/Z.AI GLM-4.6V-Flash、MiMo-V2.5、Zen MiMo 和 Ollama Qwen3-VL 做：

- 普通截图问答、中文 OCR、长截图、图表、报错截图、UI grounding、UI diff。
- 首次成功率、任务正确率、P50/P95、429/5xx 比例、token/credits、重试次数。
- Windows 真实 GUI 粘贴、超大图、透明图、中文路径、代理网络、断网恢复。
- 账号注册到首张图片成功的总步骤与耗时。
- 7 天连续 soak；免费状态变化、模型下线和限流必须能被远程 registry 禁用。

在这套测试完成前，可以说 `GLM-4.6V-Flash` 注册和集成最适合普通用户，不能说它
一定比 MiMo-V2.5 质量更高。MiMo 是质量候选，GLM 是当前更可靠的免费产品方案。

## 本次无用户图片探测

- `GET https://api-inference.modelscope.cn/v1/models`：200，返回当前模型表并包含
  多个视觉模型；实际推理仍需 Token、阿里云绑定和实名。
- `GET https://open.bigmodel.cn/api/paas/v4/models`：401，错误码 1001，官方端点
  活跃并强制 Bearer Key。
- `GET https://opencode.ai/zen/v1/models`：200，列出 `mimo-v2.5-free`。
- Zen 无 Authorization 的纯文本请求：429 `FreeUsageLimitError`，没有公开的
  `Retry-After` 或 rate-limit header；不能把匿名路径当成产品承诺。
- 当前机器未安装 Ollama，因此没有执行本地模型推理；模型规格取自 Ollama 官方页。

本报告没有读取仓库中已有研究报告；只使用上述官方文档、官方维护的模型目录、
官方 API/注册页面和不含用户图片的端点探测。
