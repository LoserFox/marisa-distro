<p align="center">
  <img src="docs/assets/marisa.png" alt="Marisa（魔理沙）" width="152">
</p>

<h1 align="center">Marisa DSH（魔理沙发行版）</h1>

<p align="center">
  把公开版 DSH、桌面程序、常用插件和 MyGO 插件市场组合好的社区发行版。
</p>

<p align="center">
  <a href="https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64.msi"><img alt="下载 Windows MSI" src="https://img.shields.io/badge/Windows-下载_MSI-0078D4?style=for-the-badge&logo=windows11&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1"><img alt="Release v0.1.1" src="https://img.shields.io/badge/Release-v0.1.1-2DA44E?style=flat-square"></a>
  <img alt="DSH 0.1.0-rc.6" src="https://img.shields.io/badge/DSH-0.1.0--rc.6-6F42C1?style=flat-square">
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-0078D4?style=flat-square&logo=windows11&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-24292F?style=flat-square"></a>
</p>

> **一句话说明：** Marisa 不是另一套 DSH，也不是 DeepSeek 官方稳定版。它基于公开的 DeepSeek Harness / DSH `0.1.0-rc.6`，把运行环境、桌面壳和一组插件打包成可以直接安装的 Windows 应用。

## 📥 下载

### Windows 10 / 11 x64

**推荐：[直接下载 MSI 安装包](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64.msi)**

MSI 会按当前用户安装 Marisa，并在首次启动时准备随包运行环境。需要免安装版本时，也可以下载 [便携版 EXE](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64-standalone.exe)。

| 下载项 | 适合谁 | 状态 |
|---|---|---|
| [🪄 MSI 安装包](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64.msi) | 大多数 Windows 用户 | **推荐** |
| [🧳 便携版 EXE](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64-standalone.exe) | 不希望安装、需要放在自定义目录的用户 | 首次运行自解压 |
| [🔐 SHA256SUMS.txt](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/SHA256SUMS.txt) | 校验下载文件是否完整 | 推荐校验 |

> Windows 产物目前没有代码签名，SmartScreen 可能提示“未知发布者”。请只从本仓库 Release 下载。

### Linux 与 macOS

这些构建目前只用于试验，不建议作为主力环境：

- [🐧 Linux x64 tar.gz](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-linux-x64-experimental.tar.gz)：依赖系统 DSH、GTK 与 WebKit。
- [🍎 macOS Apple Silicon app.zip](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-macos-arm64-experimental.app.zip)：未签名、未公证，可能无法直接运行。

[查看 v0.1.1 的完整发布说明](https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1)

## ✨ Marisa 帮你省掉什么？

| | 特点 | 直观地说 |
|---|---|---|
| 🖥️ | **桌面化安装** | 不必自己拼 Node、DSH 后端和桌面启动器，Windows 下载 MSI 后即可开始配置。 |
| 🧩 | **常用插件预组合** | 发行版已经选择、固定并验证了一组插件；[完整插件清单](docs/plugins.md)可查。 |
| 🛍️ | **MyGO 插件市场** | 可在设置页按需浏览和安装额外插件，不会在后台自动塞入。 |
| 🔎 | **来源和差异可审计** | Harness、桌面壳和 vendored 插件都固定到明确版本；fork 修改有差异记录。 |
| 🧭 | **更新有边界** | `main` 跟随已验证的 DSH rc，维护线只接收必要修复，不直接分发未经验证的上游变更。 |

换成一个公式就是：

```text
公开版 DSH + Windows 桌面壳 + 已筛选插件 + MyGO 插件市场 + 发行验证 = Marisa
```

## 👤 适合谁？

**适合：** 想在 Windows 上快速体验 DSH、希望省掉手工安装插件和运行环境、同时仍在意代码来源与版本记录的用户。

**暂不适合：** 需要官方稳定版本、完整离线包、企业级支持，或准备把 Linux / macOS 当作主力平台的用户。

## 🚧 当前状态

- 当前发行版：`v0.1.1`（预发布）
- DSH 基线：公开版 `0.1.0-rc.6`
- 主要支持：Windows 10 / 11 x64
- 实验支持：Linux x64、macOS Apple Silicon
- 已知限制：Windows 未代码签名；首次使用仍需按页面提示配置模型服务

所有 `v0.x` Release 都属于预发布版本。Marisa 不替代 DSH 与插件上游，它提供的是经过组合、打包和桌面验收的默认体验。

## 💬 使用与反馈

- 使用交流：[GitHub Discussions](https://github.com/omdsh-dev/marisa-distro/discussions) 或 QQ 群 `956471685`
- 可复现的发行版缺陷：[提交 Issue](https://github.com/omdsh-dev/marisa-distro/issues/new/choose)
- 插件自身问题：优先反馈到对应插件上游

维护者不承诺一对一使用支持。无法复现、发错位置、重复灌水、骚扰或辱骂的 Issue 可能被关闭、锁定或封禁。

## 📚 深入了解

- [项目文档入口](docs/README.md)
- [插件清单与来源](docs/plugins.md)
- [DSH 上游差异](docs/upstream-diff.md)
- [打包与发布流程](docs/packaging.md)
- [版本策略](docs/versioning.md)

本仓库自有代码采用 [MIT License](LICENSE)；vendored 组件仍遵循各自许可证与授权。顶部魔理沙头像来自 [`dsh-external/marisa`](https://github.com/dsh-external/marisa)，按 [MIT License](docs/assets/marisa-icon.LICENSE) 使用。
