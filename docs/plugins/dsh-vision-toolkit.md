# dsh-vision-toolkit

## 基线

- 上游仓库：`https://github.com/dsh-external/dsh-vision-toolkit.git`
- 基线提交：`8d35621cf955d10d9a76a02cd7b5b946fcc769ad`
- 维护模式：`fork`

## 分叉动机

Marisa 面向普通桌面用户，需要一个安装后无需注册、无需 API Key 即可尝试的视觉入口，同时保留国内正式服务的可恢复路径。上游配置只支持 Credential 鉴权，不能表达匿名 OpenAI-compatible 服务，也没有面向普通用户的服务预设和开户引导。

## 发行版修改

- 为视觉 Provider 增加 `authMode: none | credential`。匿名模式不读取或保存用户密钥；给上游 Python 适配层传入非秘密占位值 `public`。
- Marisa bundle 默认配置 `https://opencode.ai/zen/v1` 与 `mimo-v2.5-free`，开箱即可使用 OpenCode Zen 的匿名免费 Vision。
- 设置页增加 Zen、智谱 GLM 与自定义 OpenAI-compatible 服务三个预设。
- GLM 预设配置 `https://open.bigmodel.cn/api/paas/v4`、`glm-4.6v-flash` 和 Credential 引用 `ZHIPU_API_KEY`，并提供注册及创建 API Key 的入口。
- 设置页明确提示：Zen 免费服务限时提供，免费期数据可能用于改进模型，不应上传敏感图片。
- 修正插件 TypeScript 配置在 Marisa monorepo 中对 `harness/` 类型声明的路径，恢复可重复构建。
- vendored 上游清单校验仅在 CRLF 归一化后仍与记录的字节数和 SHA-256 完全一致时接受该文件，避免 Windows checkout 误报且不放宽内容校验。

## 权限影响

- 默认方案会把用户主动提交给视觉工具的图片和提示词发送到 `https://opencode.ai/zen/v1`，不发送用户 API Key。
- 用户选择 GLM 后，图片和提示词发送到 `https://open.bigmodel.cn/api/paas/v4`，请求使用 DSH Credential 服务解析的 `ZHIPU_API_KEY`；设置页面和日志不显示密钥值。
- 本次修改没有新增进程、任意文件读取或写入能力；原插件的 Python runtime、工作区图片读取和 Artifact 写入权限保持不变。
- 服务之间不会静默跨云回退。切换 Provider 必须由用户在设置页明确选择并保存。

## 验证

- `tests/config.spec.ts` 覆盖鉴权模式默认值、匿名配置和非法值。
- `tests/runtime.spec.ts` 覆盖匿名模式不解析 Credential，并生成 Zen 所需的环境配置。
- `pnpm install --frozen-lockfile`：通过。
- `pnpm --dir plugins/dsh-vision-toolkit run build`：通过，包括上游清单校验、服务器端和客户端 TypeScript 构建。
- 聚焦 Vitest：15 个配置、匿名 runtime 和 Web 后端用例通过；客户端 TypeScript 检查通过。
- `pnpm test`：通过（repository policy、开发命令和 Marisa profile 生成测试）。
- `go test -C desktop -tags installedbundle ./...` 与 `go test -C desktop -tags embeddedbundle ./...`：通过。
- PR 边界检查：通过，插件已登记为 fork 并关联本文档。
- Windows 上完整 runtime 测试仍有 30 个既有失败，原因是测试 Python 缺少 Pillow；客户端 Vitest worker 仍被既有 `jsdom` 的 `tough-cookie` 缺包阻断。
