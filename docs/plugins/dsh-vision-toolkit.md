# dsh-vision-toolkit

> **⚠️ 已退役（2026-08-22）**：Marisa 组合已移除本插件，由 [`@liustack/modlens`](modlens.md) 取代（无 Python 运行时、纯 JS、跨平台；默认匿名 Zen MiMo 端点沿用 `https://opencode.ai/zen/v1` + `mimo-v2.5-free`，由 modlens fork 首启 seed 预置）。下方内容保留为历史记录。决策与迁移过程见 `docs/RESEARCH-modlens-vision-switch-20260822.md`。

## 基线

- 上游仓库：`https://github.com/Anionex/dsh-vision-toolkit.git`（agent-vision-toolkit 壳仓库的 npm 包子模块；2026-08-13 上游重构，原 dsh-external 镜像 URL 作废）
- 基线提交：`a4344e441b3786ce45868608a17383317ce63c9e`（v0.1.32，2026-08-19 同步自 8d35621）
- 维护模式：`fork`（authMode 匿名模式 + Zen/GLM 预设是 vendored 上游源码的本地差异；组合默认值在 marisa-bundle patch）

> **2026-08-20 评估：0.1.36（a79d5405）同步推迟**。0.1.36 上游代码的类型面引用 rc8 事件词汇（`skill-invocation`、`tool/code-dispatch` 等），在 rc7 harness 下 `tsc -p tsconfig.json` 不通过（TS2367/TS2339）。保持 0.1.32 作为 rc7 兼容基线；**随 rc8 harness 换树时再同步 0.1.36+**（届时 authMode none + Zen/GLM/custom 预设补丁按 2026-08-20 研究文档附录 B.1 的方式重放）。

## 分叉动机

Marisa 面向普通桌面用户，需要一个安装后无需注册、无需 API Key 即可尝试的视觉入口，同时保留国内正式服务的可恢复路径。上游配置只支持 Credential 鉴权，不能表达匿名 OpenAI-compatible 服务，也没有面向普通用户的服务预设和开户引导。

## 发行版修改

- 为视觉 Provider 增加 `authMode: none | credential`。匿名模式不读取或保存用户密钥；给上游 Python 适配层传入非秘密占位值 `public`。
- Marisa bundle 默认配置 `https://opencode.ai/zen/v1` 与 `mimo-v2.5-free`，开箱即可使用 OpenCode Zen 的匿名免费 Vision。
- 设置页增加 Zen、智谱 GLM 与自定义 OpenAI-compatible 服务三个预设。
- GLM 预设配置 `https://open.bigmodel.cn/api/paas/v4`、`glm-4.6v-flash` 和 Credential 引用 `ZHIPU_API_KEY`，并提供注册及创建 API Key 的入口。
- 设置页明确提示：Zen 免费服务限时提供，免费期数据可能用于改进模型，不应上传敏感图片。
- vendored 上游清单校验仅在 CRLF 归一化后仍与记录的字节数和 SHA-256 完全一致时接受该文件，避免 Windows checkout 误报且不放宽内容校验。

## 2026-08-19 同步（8d35621 → v0.1.32，188 commits）

- 上游吸收：`webServer` 路由注入（rc7 补丁删除）、client 远程事件特性检测双通道（更健壮，本地补丁删除）、Python 3.13.15 自举（win32-x64/arm64，sha256+size 校验、`$DSH_HOME/cache` 落点）、Windows CI、MAX_PATH 缓存修复、NO_ADAPTER 自愈、粘贴多图、image-input variants、Anthropic Messages 协议、skill 改名 vision-tools → vision-skills。
- 重放：authMode none（config/runtime/web/client 四处）+ Zen/GLM/custom 预设 UI + 相关测试迁移。
- 包名：上游 `@anionex/dsh-vision-toolkit` → 本地保持 `@dsh-external/dsh-vision-toolkit`（bundle 依赖、client ModuleLoader id、文档零 ripple；上游源码中的名字面量已全部改回）。
- 上游默认值收紧（timeout 30s、maxImageBytes 4MiB、内置免费服务 vision.anionex.me）；Marisa bundle patch 仍覆盖为 Zen 匿名默认。
- 新增 6 个 peerDeps（dsh-api-remotes、dsh-attachment、dsh-client-ui-conversation、dsh-client-ui-input-trigger、dsh-llm、dsh-session），rc7 包面齐全。

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
