# Marisa DSH（魔理沙发行版）

Marisa 是面向日常生产力的 DSH 社区发行版：把经过筛选的插件、MyGO 插件市场和桌面体验组合成开箱即用的应用。

> 当前版本基于 DSH `0.1.0-rc.6`，所有 `v0.x` Release 均为预发布版本。Windows 是主要支持平台；Linux 与 macOS 构建仍处于实验阶段。

## 下载

**Windows 用户请优先安装 [MSI 安装包（v0.1.1）](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64.msi)。** 它会完成按用户安装，并在首次启动时准备好随包运行时。

当前预发布版本为 [`v0.1.1`](https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1)。所有二进制包均可直接下载：

| 平台 | 下载 | 状态 |
|---|---|---|
| Windows 10/11 x64 | [MSI 安装包（推荐）](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64.msi) | 推荐 |
| Windows 10/11 x64 | [便携版 EXE](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-windows-x64-standalone.exe) | 首次运行自解压 |
| Linux x64 | [实验性 tar.gz](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-linux-x64-experimental.tar.gz) | 实验性；依赖系统 DSH/GTK/WebKit |
| macOS Apple Silicon | [实验性 app.zip](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/Marisa-DSH-macos-arm64-experimental.app.zip) | 实验性；未签名、未公证，可能无法运行 |

Windows 产物目前没有代码签名，Windows Defender SmartScreen 可能显示未知发布者。请只从本仓库 Release 下载，并使用 [SHA256SUMS.txt](https://github.com/omdsh-dev/marisa-distro/releases/download/v0.1.1/SHA256SUMS.txt) 校验下载文件。

## 为什么选择魔理沙作为 DSH 发行版？

- **开箱即用**：常用插件、Windows PowerShell 通道和桌面壳已经组合并验证。
- **可选择**：MyGO 位于设置页，额外插件只有在用户点击后才下载。
- **可审计**：harness、desktop 和 vendored 插件源码全部由同一个仓库与 tag 固定；每个 fork 都有上游基线和差异账本。
- **稳健更新**：`main` 跟进最新已验证 DSH rc；稳定维护线只接收严重修复，不把未经验证的上游更新直接推给用户。
- **尊重上游**：纯镜像插件只通过同步流程更新；必要的兼容修改被隔离、记录，并优先回馈插件或 DSH 上游。

Marisa 不是离线包，也不会代替 DSH 与插件上游。它提供的是一套经过组合、打包和桌面验收的默认体验。

## 使用与反馈

使用交流请进入 [GitHub Discussions](https://github.com/omdsh-dev/marisa-distro/discussions) 或 QQ 群 `956471685`。维护者不承诺提供一对一使用支持。

[Issues](https://github.com/omdsh-dev/marisa-distro/issues/new/choose) 只接收可以完整复现的发行版缺陷；插件自身问题应优先反馈到对应插件上游。发错位置的内容会被关闭并引导，重复灌水、骚扰或辱骂可能被锁定或封禁。

## 文档

维护者、贡献者和希望了解实现细节的用户请从 [docs/README.md](docs/README.md) 开始。那里包含完整插件清单、上游差异、打包流程、版本策略和贡献规则。

本仓库自有代码采用 [MIT License](LICENSE)；vendored 组件仍遵循各自许可证与授权。
