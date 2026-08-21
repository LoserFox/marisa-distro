# VENDOR.md — dsh-ego-browser（vendored 第三方插件）

## 来源与版本

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/Fisfzy/dsh-ego-browser |
| 固定 commit | `09b6fb3`（master HEAD，2026-08-21，83 提交） |
| 包名/版本 | `@dsh-external/ego-browser` 0.8.0（`private: true`，不发布 npm/公共 registry） |
| tarball SHA-256 | `3F6CC9BD82A62FB378AB47C13121B29671DDB09798E1D11014BB1A9BB06F4E14` |
| vendoring 日期 | 2026-08-23 |
| 内容 | `lib/`（host+client 预构建 bundle）、`bin/ego-cast-worker.mjs`、`runtime/`（vendored ego-lite，纯 JS）、`cordis.patch.yml`、`package.json`、`README.md` —— 即上游 `files` 字段分发内容，**不含 node_modules、不含原生二进制** |

## 分发授权

作者已于 2026-08-23（QQ）确认同意：随 marisa-distro（私有发行版）MSI 分发固定 commit tarball 并预装。上游 README 要求：不发布 npm/公共 registry、不创建用于分发的公开 fork/镜像——本目录为私有仓库内 vendored 副本，非公开镜像；如需转载请注明出处。

## 本地改动

**无。** 本目录内容与上游 `09b6fb3` 的 `files` 字段打包产物逐字节一致（除本 VENDOR.md）。升级方式：上游新 tag → 重新打包 → 整体替换本目录内容 → 更新本表。

## 依赖与运行时

- dependencies：仅 `@deepseek-ai/schemastery: link:../dsh/vendor/schemastery`（编译期类型用；tarball/workspace 安装时 pnpm 仅警告，已验证 2026-08-23）。
- peers：8 个 `@deepseek-ai/*` 全 optional、钉 `0.1.0-rc.8`（marisa rc.8 基线匹配；0.1.1-rc.2 换树后需复测）。
- 运行时：`ego_*` 工具经 `ctx.subprocess` 调 vendored ego CLI（`runtime/ego-linux`，来自 CitroLabs/ego-lite MIT + 未合并上游 PR #234 Linux 移植 + 本地 Windows 补丁，见 `runtime/PATCHES.md`）；浏览器 = 系统 Chrome/Chromium/Brave/Edge（Windows 自带 Edge，**不下载 Chromium**）。
- 可选下载：FFmpeg（观察窗 ffmpeg 后端，Windows 需含 `gfxcapture` 构建），按需下载至 `~/.dsh/cache/ego-browser/ffmpeg/`，SHA-256 固定，GPL-3.0-or-later 义务仅落在下载用户，发行版不内置。

## 许可证

- 插件本体：package.json 声明 MIT（上游仓库根无 LICENSE 文件，审计时以此声明 + `THIRD_PARTY_NOTICES.md` 为准）。
- 内置 ego-lite：MIT（见 `THIRD_PARTY_NOTICES.md`）。
- 可选 FFmpeg：GPL-3.0-or-later（不内置）。

## 已知上游未合并项（影响评估见 docs/RESEARCH-dsh-ego-browser-20260823.md）

- PR #13：Windows 稳定性整合（nav 路由/hasDisplay/gateway 缺键）未合并；
- PR #1：任务空间 Cookie 持久化；PR #2：headless 指纹；#5：`ref=@N` 文档 bug；
- 无 CI（无 .github/）。

## 相关文档

- 调研：docs/RESEARCH-dsh-ego-browser-20260823.md
- 集成计划：docs/PLAN-dsh-ego-browser-integration-20260823.md
