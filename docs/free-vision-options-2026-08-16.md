# Marisa 免费 Vision 方案独立核查

日期：2026-08-16（Asia/Shanghai）

## 结论

有免费方案，但应区分三种完全不同的“免费”：

1. **真正本地免费**：Ollama 或 PaddleOCR 在用户机器上推理，没有 API 调用费，图片不离开本机；代价是模型下载、内存、GPU、耗时和电费。
2. **官方免费额度/免费模型**：需要账号和 API key；额度、限流、地区、数据使用政策可能变化。当前可核实的实用选项是智谱 `glm-4.6v-flash` 和 Gemini API Free Tier。
3. **匿名公共端点**：`dsh-vision-router` 内置的 OVHcloud endpoint 不要 key，但严格限流、图片外发、没有整合包可依赖的 SLA。只能做最后兜底，不能称为稳定免费后端。

给 Marisa 的推荐顺序：

| 优先级 | 组合 | 费用与数据边界 | 判断 |
| --- | --- | --- | --- |
| 1 | `dsh-open-eyes` + Ollama + `qwen3-vl:4b` | 无 API 费；图片留在本机 | 默认免费档首选 |
| 2 | 同上，检测到较强硬件后切 `qwen3-vl:8b` | 无 API 费；质量更高，资源更重 | 本地质量档 |
| 3 | `dsh-open-eyes` + `glm-4.6v-flash` | 官方称完全免费；需智谱账号/key；图片外发 | 中国网络环境下的云端免费备选 |
| 4 | `dsh-open-eyes` 或 `modlens` + Gemini Free Tier | 免费额度；需 Google 账号/key；免费层数据可用于改进产品 | 非敏感图片备选 |
| 5 | `dsh-vision-router` 内置 OVH 匿名链 | 无账号/key；图片外发；2 RPM/IP/model | 仅紧急兜底 |
| 专项 | 本地 PaddleOCR | 无 API 费；只解决文字/版面，不是通用看图 | OCR 前置加速层 |

因此，不应把一个远程“免费端点”硬编码成整合包唯一默认。更稳妥的产品形态是：默认探测本机 Ollama；没有本地后端时，引导用户选择智谱/Gemini key；匿名 OVH 明示隐私与限流后才允许启用。

## 1. 真正本地免费：Ollama

Ollama 本身采用 MIT License，官方 Windows 文档支持 Windows 10 22H2 及以上，原生支持 NVIDIA 和 AMD GPU。它提供 OpenAI 兼容的 `/v1/chat/completions`，官方兼容文档明确给出了带 `image_url` 的视觉请求，因此无需为 Marisa 自创协议。

一手来源：

- [Ollama LICENSE](https://github.com/ollama/ollama/blob/main/LICENSE)
- [Ollama Windows](https://docs.ollama.com/windows)
- [OpenAI compatibility，含 Vision 示例](https://docs.ollama.com/api/openai-compatibility)
- [Context length 与显存默认规则](https://docs.ollama.com/context-length)

### 可选本地模型

下表下载体积来自 Ollama 官方模型标签页。它们是默认/常用 Q4 量化文件体积，不等于完整运行内存，也不代表普通机器会自动得到模型页面写出的最大上下文。

| 模型 | 官方 Ollama 标签体积 | 许可证 | Marisa 用途 |
| --- | ---: | --- | --- |
| [Qwen3-VL](https://ollama.com/library/qwen3-vl/tags) | 2B 1.9 GB；4B 3.3 GB；8B 6.1 GB | Apache-2.0 | 4B 默认；8B 质量档 |
| [Qwen2.5-VL](https://ollama.com/library/qwen2.5vl/tags) | 3B 3.2 GB；7B 6.0 GB | Apache-2.0 | 成熟旧版回退 |
| [Ministral 3](https://ollama.com/library/ministral-3/tags) | 3B 3.0 GB；8B 6.0 GB；14B 9.1 GB | Apache-2.0 | 第二引擎/A-B 对照 |
| [Granite 3.2 Vision](https://ollama.com/library/granite3.2-vision) | 2B 2.4 GB | Apache-2.0 | 表格、图表、文档理解 |
| [Gemma 3](https://ollama.com/library/gemma3/tags) | 4B 3.3 GB；12B 8.1 GB；27B 17 GB | Gemma Terms | 可选，但分发义务比 Apache 复杂；270M/1B 不是视觉模型 |
| [Moondream2](https://ollama.com/library/moondream/tags) | 1.8B 1.7 GB | Apache-2.0 | 极低配描述/分类兜底，只有 2K 上下文 |
| [Llama 3.2 Vision](https://ollama.com/library/llama3.2-vision/tags) | 11B 7.8 GB；90B 55 GB | Llama 3.2 Community | 不建议默认：署名、大规模用户和欧盟多模态许可约束更复杂 |

Qwen3-VL、Qwen2.5-VL、Ministral 3、Granite 的发布方模型卡也确认了 Apache-2.0：

- [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)
- [Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
- [Ministral-3-8B-Instruct-2512](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512)
- [Granite Vision 3.2 2B](https://huggingface.co/ibm-granite/granite-vision-3.2-2b)
- [Gemma Terms](https://ai.google.dev/gemma/terms)
- [Llama 3.2 Community License](https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct/blob/main/LICENSE.txt)

### 硬件门槛

Ollama/模型发布方没有给每个量化标签统一的“最低 RAM/VRAM”，所以不能把下面的工程估算冒充官方要求：

- 2B–4B Q4：建议 16 GB 系统内存；6–8 GB VRAM 可明显提速。
- 7B–8B Q4：建议 16–24 GB 内存；8–12 GB VRAM。
- 11B–14B Q4：建议 24–32 GB 内存；12–16 GB VRAM。
- 没有独显可走 CPU，但交互延迟通常会明显增加。

模型标签写的 128K/256K 是上限，不是默认。Ollama 官方当前按 VRAM 设置默认 context：低于 24 GiB 为 4K，24–48 GiB 为 32K，至少 48 GiB 才默认 256K；扩大 context 还会继续消耗内存。

### 与 Marisa/DSH 的接法

`dsh-open-eyes` 是现有候选中最干净的本地接入面：其源码支持 `openai-chat-completions`、loopback HTTP 和 `authMode: none`，因此可以直连 `http://127.0.0.1:11434/v1`，无需伪造 API key。

参考配置形状：

```yaml
providers:
  - id: ollama-local
    protocol: openai-chat-completions
    baseUrl: http://127.0.0.1:11434/v1
    model: qwen3-vl:4b
    authMode: none
defaultProvider: ollama-local
```

一手源码：

- [`dsh-open-eyes` README](https://github.com/Hyp6666/dsh-open-eyes/blob/bafcf5314acb4735b5aef8644bd45b9b4036442f/README.md)
- [`authMode: none` 与 loopback HTTP 校验](https://github.com/Hyp6666/dsh-open-eyes/blob/bafcf5314acb4735b5aef8644bd45b9b4036442f/src/config.ts)

注意：该插件的 Web 粘贴桥明确绑定 DSH rc.6 的内部接缝。集成前仍需跑 Marisa 的 Windows 真实 GUI 测试，DSH 升级时要重新审计。

`dsh-vision-proxy` 也能自动探测 `http://localhost:11434/v1`，但不能原样放入 Marisa：其 `package.json` 含仓库规则禁止的 `postinstall`。此外它只用模型 id 的 `/vl|vision/i` 判断视觉模型；若 Ollama 中只有名称不含这两个词的视觉模型（例如 `gemma3`），可能误选模型列表第一项。若采用它，必须 fork：删除安装脚本、改为读取 Ollama capability，或强制填写 `localOllamaModel`。

- [`dsh-vision-proxy` README](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/679b0efc4719ac80b14ebf9630a6e7be474ef45b/README.md)
- [Ollama 探测实现](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/679b0efc4719ac80b14ebf9630a6e7be474ef45b/lib/index.js)
- [`postinstall` 声明](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/679b0efc4719ac80b14ebf9630a6e7be474ef45b/package.json)

不应把模型权重打进 MSI。整合包只应提供 Ollama 探测、模型选择和按需下载引导，否则安装包体积、升级和许可审计都会失控。

## 2. 官方云端免费模型/免费额度

### 智谱 GLM-4.6V-Flash

智谱官方模型文档明确把 `GLM-4.6V-Flash` 标为“完全免费”，支持图像、视频、文本、文件输入和 128K context；官方调用示例使用 `https://open.bigmodel.cn/api/paas/v4/chat/completions` 和 Bearer API key。它不是匿名服务，仍需注册并获取 key。

- [智谱 GLM-4.6V 官方文档](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v)

这比匿名 OVH 更适合作为中国用户的免费云端后端：身份、模型和官方文档清楚，但“完全免费”仍可能随厂商政策变化，Marisa 应把它做成可替换 provider，而不是硬编码永久承诺。

### Gemini API Free Tier

Google 官方定价页当前把 `gemini-3.6-flash`、`gemini-2.5-flash`、`gemini-2.5-flash-lite` 等标准请求的 Free Tier 输入/输出列为免费，并明确覆盖 image input。官方还提供 OpenAI compatibility endpoint，可被 `dsh-open-eyes` 或 `modlens` 接入：

```text
https://generativelanguage.googleapis.com/v1beta/openai/
```

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini OpenAI compatibility，含 image_url 示例](https://ai.google.dev/gemini-api/docs/openai)

关键隐私边界：官方定价表明确写明 Free Tier 的内容会用于改进 Google 产品，Paid Tier 则为 No。因此它不应默认处理未征得同意的私密截图。免费额度和 rate limit 也按模型、项目和账号层级变化，应在设置页链接官方用量页，不应在代码中写死固定次数。

## 3. 匿名公共端点：OVHcloud

`dsh-vision-router` 当前把五个 OVHcloud 模型作为最终匿名 fallback，源码/README 给出的 endpoint 是：

```text
https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
```

插件声明每 IP、每模型 2 RPM，五个模型的限额彼此独立。2026-08-16 的独立无 key 探测得到：

- `GET /v1/models`：HTTP 200；
- `POST /v1/chat/completions`：当时为 HTTP 429；
- 响应头包含 `x-ratelimit-limit-minute: 2`、`x-ratelimit-remaining-minute: 0`、`Retry-After: 5`。

这验证了“无需 key”和 2 RPM bucket，也直接说明它不稳定：共享出口 IP 或高峰期可能在第一次用户请求前就已经耗尽。`/models` 返回的 pricing metadata 也不是永久匿名免费承诺。

- [`dsh-vision-router` README](https://github.com/ysr666/dsh-vision-router/blob/6f3bd5392417800f9d1a1b00967fa7b49ec2b7f8/README.zh.md)
- [内置 OVH fallback 源码](https://github.com/ysr666/dsh-vision-router/blob/6f3bd5392417800f9d1a1b00967fa7b49ec2b7f8/index.js)
- [OVH endpoint 的实时 model catalog](https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models)

风险：图片完整外发；没有 key 不等于没有日志、保留或策略变化；严格限流；公共端点可被滥用或关闭；Marisa 无法为它提供 SLA。因此只允许显式 opt-in，并在 UI 中显示 endpoint、隐私告知和当前限流错误。

## 4. `modlens` 的 Antigravity CLI 不是合规免费后端

`modlens` README 把 Antigravity CLI 描述为免费、无 key、浏览器登录的后端，并宣称约 15–45 秒一次读取：

- [`modlens` README](https://github.com/liustack/modlens/blob/767dfe556f5dfdf011891320c3da4bc573f0e91a/README.md)

但 Google Antigravity 官方 FAQ 明确写明：使用第三方软件、工具或服务访问 Antigravity 违反服务条款，可能导致账号暂停或终止；需要在第三方 coding agent 使用 Gemini 时，官方建议使用 Vertex 或 AI Studio API key。Antigravity 个人版虽为 `$0/month`，只有 basic weekly rate limits，但不能据此授权 `modlens` 复用登录。

- [Antigravity FAQ](https://antigravity.google/docs/faq)
- [Antigravity pricing](https://antigravity.google/pricing)

结论：Marisa 不应默认启用或宣传 `modlens + Antigravity CLI`。可以使用 `modlens + Gemini API key` 或合规的 OpenAI-compatible endpoint，但这与“复用免费 Antigravity 登录”是两件事。

## 5. PaddleOCR：免费 OCR 层，不是通用 Vision 替代

PaddleOCR 官方项目为 Apache-2.0，已经适配 Windows；本地 Python/C++ 推理均可用。对于截图中文字、票据、表格和长文档，先做 OCR 再把文本交给 DeepSeek，通常比让通用 VLM 重复抄字更可控，也可以减少远程图片调用。

- [PaddleOCR 官方仓库](https://github.com/PaddlePaddle/PaddleOCR)
- [PaddleOCR 安装](https://www.paddleocr.ai/latest/en/version3.x/installation.html)
- [PaddleOCR Windows/Mac FAQ](https://github.com/PaddlePaddle/PaddleOCR/blob/2661c7c0ef5c613e8f93c6e93b2e052399f0f854/docs/FAQ.en.md)
- [PaddleOCR License](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)

但 `omdsh-dev/dsh-paddle-ocr` 不是本地推理封装。它需要星河社区 token，并把文件发到 `paddleocr.aistudio-app.com`/`aistudio-app.com` 的远程接口；README 还指出队列饱和是常态。它可以是有免费额度的文档服务插件，但不能算“图片不出本机”的本地免费方案。

- [`dsh-paddle-ocr` README](https://github.com/omdsh-dev/dsh-paddle-ocr/blob/6e4e1282f9b545ddbfedead45ccdf4f5d227c53c/README.md)
- [远程 API client](https://github.com/omdsh-dev/dsh-paddle-ocr/blob/6e4e1282f9b545ddbfedead45ccdf4f5d227c53c/src/api.ts)

如果 Marisa 要真正本地 OCR，需要自维护一个小 sidecar/工具，直接调用本地 PaddleOCR；不要复用上述远程插件的网络 client。OCR 结果应作为专用工具输出，而不能代替一般图片理解、图形关系、界面状态和视觉定位。

## 6. 建议的 Marisa 产品方案

### 默认能力

1. 集成/维护 `dsh-open-eyes` 作为轻量视觉委派层。
2. 启动时只探测 loopback Ollama，不自动联网下载。
3. 发现 `qwen3-vl:4b` 时直接作为本地默认；硬件和模型均满足时允许用户选择 8B。
4. 没有模型时展示按需下载动作，不把权重装进 MSI。
5. 可选安装本地 PaddleOCR，OCR 密集图先 OCR，通用问题再交给 VLM。

### 云端免费备选

1. 中国用户优先展示 `glm-4.6v-flash`，明确“需要账号/key，官方当前标为完全免费，政策可变”。
2. Gemini Free Tier 仅在用户接受其数据使用条款后启用。
3. OVH 匿名链默认关闭或排在最后，明确显示图片外发和 2 RPM/IP/model。
4. 禁止 Antigravity 登录复用。

### 最低验收

在成为 Marisa 默认前，至少用 Windows 真实 GUI 对下列固定任务比较 `qwen3-vl:4b`、`qwen3-vl:8b`、`glm-4.6v-flash` 和当前 vision toolkit：

- 中文密集截图 OCR；
- 表格/图表读数；
- UI 故障定位与控件关系；
- 自然图片描述；
- 长截图；
- 断网、Ollama 未启动、模型未下载、显存不足、远程 429。

记录成功率、P50/P95、首 token、总耗时、CPU/GPU 峰值、内存、VLM 调用次数、图片是否外发和错误恢复。公开模型卡和 README 不能替代 Marisa 自己的固定图集 A/B。

## 范围与方法

本报告未读取仓库中的既有研究报告。证据只来自插件上游源码/README、模型发布方资料、Ollama/PaddleOCR 官方资料、厂商官方定价/条款，以及一次不含用户图片的 OVH endpoint 探测。免费政策与模型目录会变化，集成时应固定版本，并在发布前重新核查链接和条款。
