# DSH 多媒体 WebUI 输入支持

简体中文 | [English](README.md)

![DSH Multimedia WebUI Input：文件与文件夹发送、模型读写和安全清理](promo/assets/dsh-multimedia-webui-input-demo.gif)

这是面向当前 DeepSeek Harness Web 客户端的独立社区插件。它在不修改官方
DSH 源码的前提下，为对话输入框增加文件/文件夹选择和拖放。

**Workspace Attachments（工作区附件）** 是当前的实现机制，不是另一个产品名：
WebUI 中选择的资源只会在发送时复制到当前 Agent 工作区，随后 Agent 就能通过
普通工作区工具读取、修改和验证它们。

选择附件时只把浏览器 `File` 对象留在内存；真正点击发送后，DSH 的异步引用
序列化器才通知 Host，把内容流式复制到当前会话工作区：

```text
<cwd>/.dsh/tmp/attachments/<session>/<send>/
```

如果准备失败，消息不会提交，草稿和附件仍可重试。设置页的“多媒体输入与文件管理”可以
按需统计并清理当前会话或当前工作区全部会话；两种删除都要在页面内再次确认，
并且只删除带插件所有权标记的已提交目录。

## 安装与卸载

当前只通过获授权的私有、带分发指纹的仓库交付。先 clone 分配给你的仓库，
然后在仓库根目录运行：

```sh
./install.sh
```

Windows PowerShell：

```powershell
.\install.ps1
```

如果 PowerShell 执行策略拦截脚本，或 ZIP 下载丢失了 shell 可执行位，可直接使用
同一个跨平台安装器，不增加依赖：

```sh
node scripts/install.mjs install
```

脚本默认使用 `PATH` 中已有的 `dsh`。如果 DSH 源码位置不能自动反查，可显式
指定，不需要修改插件：

```sh
DSH_EXECUTABLE=/path/to/dsh DSH_CHECKOUT=/path/to/dsh-source ./install.sh
```

安装器会：

1. 检查目标 DSH 是否仍提供所需 UI Slot、异步引用序列化和 Host 路由能力；
2. 对最新版 DSH，把插件快照复制到 `~/.dsh/community-plugins`，再通过官方
   `dsh plugin --profile web` 注册原生 profile bundle；
3. 对旧版 DSH，自动回退到稳定 resolver root 和带标记的个人配置桥接；
4. 用真实 composed config 和 `dsh --profile web --dump-config` 验证；
5. 任一步失败都回滚配置和插件包。

它不修改或重建 DSH，也不要求先安装社区 registry。最新版路径复用 DSH 自己已经
要求的 pnpm/profile 管理器，不新增运行时依赖或安装器。

卸载：

```sh
./install.sh uninstall
```

```powershell
.\install.ps1 uninstall
```

通用卸载入口：

```sh
node scripts/install.mjs uninstall
```

卸载只移除配置与运行包，已复制到工作区的附件默认保留，避免不可逆数据丢失。

## 实现边界

这不是 DOM hook，也不劫持聊天气泡。插件使用 DSH 的正式 Cordis/Web 接口：

- `conversation.input.left`：附件按钮；
- `conversation.input.overlay`：空白新会话的完整附件条；
- `conversation.input.dock`：正式会话附件条；
- 异步 reference serializer：发送瞬间复制，失败阻止提交；
- `settings.section`：统计和清理；
- 同源 Host HTTP 路由：流式上传、提交、统计和删除。

DSH 原生紧凑引用位显示“回形针＋文件名开头”，完整文件/文件夹名、数量和大小
显示在附件条。发送后的用户消息会列出实际相对文件名；完整原始路径到安全路径
映射保存在 `.dsh-workspace-attachments.json`。

## 与现有社区安装生态的关系

私有 [`deepseek-harness-distro`](https://github.com/dsh-external/deepseek-harness-distro)
提供用于扩展开发和契约测试的零依赖 SDK，但它不是终端用户安装器。

私有 [`plugin-registry`](https://github.com/dsh-external/plugin-registry) 已转向复用
DSH 官方 bundle 与 repository-plugin 格式。它的薄控制台可直接从根
`package.json` 识别本插件：`dsh.bundle` 表示可安装的 profile bundle，
`dsh.client` 表示 WebUI half。旧 `dsh.plugin.json` 已是归档机制，当前 registry
代码不再读取，因此本插件不会为了表面兼容增加一个无人消费的清单。

因此继续保留 clone-local 一键脚本作为私有分发入口；在最新版上，它内部直接调用
DSH 原生 profile 插件管理，不再写已废弃的 `~/.dsh/config.yaml`。registry
薄控制台可作为可选的第二管理入口，但不是安装依赖；附件协议、目录和清理规则不
绑定某个安装器。

## 当前状态与宣传素材

当前基线：`snapshots/20260810T155924Z-8ec407cd64`（`5f8768c5`）。最新版通过
`dsh.client` 发现 WebUI half；同时保留与其内容一致的 legacy `dshClient` 字段，
继续兼容 0806 扫描器，并由回归测试防止两份声明漂移。兼容性按能力探测，不按
仓库 URL、分发指纹或本机路径分支。

## 致谢

感谢 [@vlln](https://github.com/vlln) 提交
[#1](https://github.com/dsh-external/dsh-multimedia-webui-input/issues/1) 和
[#2](https://github.com/dsh-external/dsh-multimedia-webui-input/issues/2)。两项反馈促使
我们补齐 0810 的 `dsh.client` 兼容，并重新核对 registry 当前的官方 bundle 路径，
没有照搬其已经退役的独立清单机制。

- GIF 演示已直接展示在本 README 顶部
- [MP4 演示](promo/assets/dsh-multimedia-webui-input-demo.mp4)
- [架构与兼容合同](docs/architecture.zh.md)

演示来自隔离的真实 DSH 发送/模型读写/设置清理流程，不是 mock，也没有给产品
加入自动演示模式。
