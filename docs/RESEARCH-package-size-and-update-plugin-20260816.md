# EAC / SnowSalt 包体与 Marisa 更新插件研究

> 研究日期：2026-08-16  
> 外部快照：EAC `74e3b4645177d650362971f4a557b6d380ff9755`，SnowSalt
> `878d4e97d718c6b46dd298a5556f0939b26680c3`  
> 本地对象：`desktop/bundle/backend.zip`（375,654,208 B）以及 v0.1.1 Release  
> 方法：源码、GitHub Release API/asset digest、7-Zip 26.02 只读拆包；没有运行外部 EXE，
> 没有下载 SnowSalt 的 1.31 GB portable。

## 结论

EAC 的 168 MB 是真实的自包含 Windows 成品，不是下载器，但它小的首要原因不是少做功能，
而是 **solid 7z/LZMA2 + 严格运行闭包白名单**。它实际解包约 693 MiB，甚至包含完整 Electron、
Node、npm、DSH、皮肤和一个约 117 MiB 的记忆插件，只是压缩效率和运行闭包控制明显优于 Marisa。

SnowSalt 的 99.6 MB Setup 不是可比对象：只读拆包只有 Electron 壳，`resources/app.asar`
仅 10,323 B；其 README 也要求旁置源码或指定 `DSH_BACKEND_DIR`。真正自包含的 SnowSalt
参照物是 1,309,911,871 B portable zip，反而是三者中最大的。

Marisa 的 382--388 MB Windows 成品主要被 375,654,208 B 的 `backend.zip` 决定。该 ZIP
解包约 929 MiB，其中根 `node_modules` 448.5 MiB、完整 Harness 工作区 232.8 MiB、插件工作区
147.6 MiB、Node 98.5 MiB。它同时携带源码、构建产物、source map、测试/文档和部分插件的
`file:` 运行副本；ZIP 又是逐文件 Deflate。把同一后端改用 solid 7z 重压，两次实验得到
244,004,120 B 和 244,004,289 B（约 233 MiB），无需删功能就少约 132 MB。这证明：

1. **先优化发行闭包，再选择 solid 压缩格式**，可把 Marisa 明显拉近 EAC；
2. 仓库继续保留完整 Harness fork 和插件源码，Release 不必原样携带整个开发工作区；
3. EAC 的更新交互值得吸收，但不能照搬其“npm 最新 DSH overlay”更新模型；
4. Marisa 更新能力应表现为一个定制插件，但插件负责 UI/策略，下载、验证、替换、安装和回滚
   必须由桌面宿主的窄接口执行；更新单元必须是经过验收的完整 Marisa Release。

## 三种大小不是同一种东西

| 发行物 | 字节 | 自包含程度 | 可比性 |
|---|---:|---|---|
| EAC v3.0.1 portable | 167,695,412 | Electron + Node + npm + DSH + 插件/皮肤 | 可与 Marisa standalone 比 |
| EAC v3.0.1 Setup | 167,939,832 | 同一应用闭包的 NSIS 安装版 | 可与 Marisa MSI 比 |
| SnowSalt v0.1.0 Setup | 99,628,451 | 仅 Electron 壳，依赖外部 Harness 源码/后端 | 不可比 |
| SnowSalt v0.1.0 portable zip | 1,309,911,871 | Release 中的自包含候选 | 可比，但无法由当前 Git tree 复现 |
| Marisa v0.1.1 standalone | 382,222,848 | Go/Wails 壳 + 内嵌 Node/Harness/profile/plugins | 可与 EAC portable 比 |
| Marisa v0.1.1 MSI | 387,715,072 | Go/Wails 壳 + `backend.zip` | 可与 EAC Setup 比 |

Release 元数据来源：
[EAC v3.0.1](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/tag/v3.0.1)、
[SnowSalt v0.1.0-salt](https://github.com/KYZHXL/deepseek-harness-snowsalt/releases/tag/v0.1.0-salt)、
[Marisa v0.1.1](https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1)。下载的 EAC portable
SHA-256 为 `7752356f42a155323757eaa52f0e0b8faaccdba5e84b3bc991c9740bdd56c489`，
SnowSalt Setup 为 `bbc61476d7baebb7d0fe833165ec8d3f0b1907abfa6a08e5843b25f0927f0951`，
均与 GitHub Release asset `digest` 一致。

## EAC 为什么能做到约 168 MB

### 1. 它不是省掉了运行时，而是把 693 MiB 压成了 160 MiB

EAC portable 外层 NSIS 几乎只是一个容器，主体是 167,311,758 B 的 `app-64.7z`。
该 7z 使用 `LZMA2:26 LZMA:20 BCJ2`、`Solid = +`，只有 2 个 solid block：

| EAC v3.0.1 内部 | 解包大小 |
|---|---:|
| Electron 主程序 `Deepseek Harness EAC.exe` | 215.09 MiB |
| `resources/app/node_modules` | 147.76 MiB |
| `resources/app/assets` | 146.34 MiB |
| 内置 `resources/node/node.exe` | 85.73 MiB |
| 内置 npm（含依赖、docs、man） | 11.48 MiB |
| Chromium/Electron 其余 DLL、pak、data | 约 86 MiB |
| 合计 | 693.39 MiB / 26,170 files |

因此不能把它概括成“薄壳 + 在线下载 DSH”。
[打包配置](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/electron-builder.yml)
明确把 Node 和 npm 作为 `extraResources`，并把 npm 的嵌套依赖在 `afterPack` 阶段恢复；
[Node 脚本](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/scripts/fetch-node.js)
直接复制构建机的 `node.exe`。

### 2. EAC 打包的是 npm 发布运行闭包，不是 Harness 开发仓库

EAC 桌面依赖固定为 `@deepseek-ai/dsh@0.1.0-rc.6` 和一组精确 rc6 包。
实际成品内 `@deepseek-ai/dsh/package.json` 的发布白名单只有 `lib/*.js` 与 `config`；
这与 Marisa 携带 `harness/packages/**/{src,lib,test,docs,...}` 的方式根本不同。
[EAC package.json](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/package.json)
以及官方 npm 包自己的 `files` 字段共同限定了运行闭包。

这也不是“功能少”造成的假象。EAC 的 `assets/plugins` 解包 120.45 MiB，其中：

| 内置插件 | 解包大小 |
|---|---:|
| `dsh-tdai-memory` | 117.01 MiB |
| `dsh-better-sidebar` | 2.93 MiB |
| 其余 11 个小插件合计 | 约 0.51 MiB |

皮肤另占 25.39 MiB。EAC 仓库为 `dsh-tdai-memory` 跟踪 2,469 个
`node_modules` 文件，所以其源码治理并不比 Marisa 干净；这里只说明成品闭包做得紧。

### 3. 白名单、语言裁剪和 afterPack 去重都是真实贡献

EAC 的 `electron-builder.yml`：

- `files` 是强白名单，不把整个桌面仓库带入成品；
- 先排除所有 Markdown，再只恢复 Agent 必需的 `SKILL.md`；
- Electron 只保留 `en-US`、`zh-CN` 两个 locale；实际仅 1.09 MiB；
- `asar: false` 保留 native module 的真实文件，但最终由 solid 7z 压缩；
- `afterPack` 删除同版本嵌套依赖、非 x64 native payload、深路径 source map，并做长路径审计。

来源：
[electron-builder.yml](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/electron-builder.yml)、
[after-pack.js](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/scripts/after-pack.js)。

作为对照，SnowSalt Setup 保留 55 个 Electron locale，解包 46.65 MiB；但它不含后端，
仍不具备横向大小比较价值。

## SnowSalt 的 99 MB 为什么“小”

只读拆包给出了比 README 更直接的答案：

| SnowSalt Setup 内部 | 值 |
|---|---:|
| `app-64.7z` | 99,060,026 B |
| 解包文件数 | 75 |
| 解包总大小 | 364,290,884 B |
| `resources/app.asar` | 10,323 B |
| Node / Harness / backend | 不存在 |

也就是说 99 MB 主要是 Electron/Chromium 本体。README 的安装步骤明确要求“将源码仓库放在安装
目录同级（或设 `DSH_BACKEND_DIR` 指向源码目录）”，与拆包结果一致。
[SnowSalt README](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/README.zh.md)。

SnowSalt 当前 Git tree 也没有 README 所列的 `desktop/`、`plugin-manager/` 或 `整合包/`；
因此 1.31 GB portable 的精确组成和构建过程无法从 tag 复现。它值得吸收的是 Skills、Persona、
供应商预设和插件市场交互，不是发行体积方案。

## Marisa 的 375 MB 后端装了什么

本地 `desktop/bundle/backend.zip` 物理大小 375,654,208 B，含 56,354 个文件；
7-Zip 统计解包 974,284,864 B（929.15 MiB）。按未压缩大小：

| Marisa backend 区域 | files | 解包 MiB | ZIP entry packed MiB |
|---|---:|---:|---:|
| `marisa-distro/node_modules` | 39,854 | 448.53 | 143.8 |
| `marisa-distro/harness` | 14,534 | 232.80 | 52.0 |
| `marisa-distro/plugins` | 1,936 | 147.55 | 111.3 |
| `node.exe` | 1 | 98.45 | 35.1 |
| 其余 profile/manifest/root files | 29 | 1.82 | < 1 |

ZIP entry packed 大小之和不含所有 ZIP header/central-directory 开销，因此会小于物理文件大小。
[make-bundle.ps1](../desktop/bundle/make-bundle.ps1) 先复制完整 Harness、plugins、bundles、
profile 和 patches，再做一次根 workspace `pnpm install --prod`，最后执行 `7z a -tzip -mx=9`。

### 开发工作区内容进入了 Release

按扩展名看，后端同时存在：

| 类型 | files | 解包 MiB | ZIP packed MiB |
|---|---:|---:|---:|
| `.ts` | 16,290 | 101.40 | 22.7 |
| `.tsx` | 351 | 3.75 | 含在源码候选中 |
| `.map` | 8,667 | 74.79 | 15.6 |
| `.md` | 3,515 | 22.70 | 9.1 |
| `.tsbuildinfo` | 216 | 10.84 | 2.7 |
| `*.test.*` / `*.spec.*` | 1,081 | 约 12.0 | 与上述类型重叠 |

其中一部分 Markdown 是 LICENSE/NOTICE/SKILL，不能粗暴删除；少量 `.ts` 也可能是运行时模板或
包导出的源码子路径。正确做法是从每个运行包的 `files`/exports 和启动可达闭包生成白名单，
而不是按扩展名一刀切。

Harness 的 `packages` 区域按 ZIP packed 大小仍包含 `lib` 21.68 MiB、`src` 2.64 MiB、
`test` 2.16 MiB、`docs` 1.23 MiB、其他约 1.01 MiB。完整仓库还包含 `.agents`、顶层 docs、
examples、scripts、CI 配置和 TypeScript build info。

### 插件源码与运行副本有可见重复

最大例子是 `dsh-stickers`：

- `plugins/dsh-stickers`：82.53 MiB 解包，80.16 MiB packed；
- `node_modules/@dsh-external/dsh-stickers`：37.84 MiB 解包，37.58 MiB packed。

两处不是字节完全相同的目录，但都携带同一插件的大量媒体，Release 中存在源码工作区与
`file:` 运行副本的重复。`dsh-better-sidebar` 也同时出现在 `plugins`（25.28 MiB 解包）与
根 `node_modules`（25.47 MiB 解包）。本地 vendored 0.10.3 的 `lib` 约 24.58 MiB，单个 xlsx
chunk 约 19.05 MiB；EAC 成品中的 0.12.2 是 2.93 MiB 的精简运行产物，没有把
docx/xlsx/pptx chunks 与源码按 Marisa 当前方式一起带入插件目录。

这说明 Marisa 要保留源码治理，但发行阶段应把插件转换为一个“发布 tarball 等价物”：
`package.json + lib + 必需 assets/vendor + LICENSE/NOTICE/SKILL.md`，再只安装一次该运行副本。

### 压缩格式单独贡献约 132 MB

当前后端是逐文件 ZIP Deflate。对完全相同的 929 MiB 解包树使用 solid 7z/LZMA2：

| 方法 | 结果 |
|---|---:|
| 当前 ZIP | 375,654,208 B（358.25 MiB） |
| solid 7z，实验 1 | 244,004,120 B（232.70 MiB） |
| solid 7z，实验 2 | 244,004,289 B（232.70 MiB） |

差值约 131.65 MB（十进制），约 35%。Marisa standalone 直接通过 `go:embed` 原样内嵌 ZIP；
MSI 的 WiX `MediaTemplate` 又设置 `CompressionLevel="none"`，把已经 Deflate 的 backend.zip
作为文件存入，二者都不会再获得 Electron Builder 那种 solid 压缩收益。
[embedded.go](../desktop/embedded.go)、[Product.wxs](../desktop/installer/Product.wxs)。

不能直接把 ZIP 后缀改成 7z：当前 Go 宿主使用标准库 `archive/zip` 解包。合理下一步是先用同一
stage 基准测试 `tar.zst`（可用纯 Go 解码、速度更好）和 7z（体积证据最好），把首启解包耗时、
内存、Defender 扫描和损坏恢复一起纳入选择。

## 推荐的瘦身顺序

### P0：建立发布运行闭包白名单

仓库保持现状，Release stage 改为 npm publish/pack 等价闭包：

- Harness 只带运行需要的 `lib`、`dist`、config、agent presets/skills 和 native payload；
- plugins 只带 manifest、构建产物、必需资源及许可证，不带 `src/test/docs/tsbuildinfo/map`；
- 始终保留 LICENSE、THIRD_PARTY_NOTICES、NOTICE、SKILL.md；
- 使用现有 profile dump、真实 `dsh web` 启动、客户端静态资源请求和 installed/embedded tests
  证明没有裁掉动态加载路径；
- 构建时生成 manifest，记录每个包版本、文件数、总大小和 SHA-256，像 EAC 的 bundle manifest
  一样在首启校验完整性。

### P0：消除插件工作区与 `file:` 运行副本重复

先处理 `dsh-stickers`，它是最明显且收益最大的单项；然后处理 `dsh-better-sidebar` 等大包。
目标不是少装插件，而是同一运行资产只出现一次。插件源码仍在 Release 对应 tag 中可审计，
不需要放进终端用户的后端目录。

### P1：改用 solid/streaming archive

在运行闭包稳定后再换 archive，避免把大量无用文件仅仅压得更紧。候选至少比较：

- `tar.zst`：解压快、Go 生态成熟、适合整树顺序解包；
- solid 7z/LZMA2：本次实测最小，但需要新的可靠解码器并评估首启时间；
- 继续 ZIP：实现最简单、随机访问方便，但 56k 小文件和重复内容压缩率明显较差。

### P1：按目标平台裁 native 和 Electron 类似资源

延续当前非 win32 native pruning，但补上可达性清单、source map、PDB、非运行工具链等审计。
Node 版本本身也带来约 12.7 MiB 解包差异（Marisa 98.45 MiB，EAC 85.73 MiB），但不应为了
体积降级 Node；只需固定并记录实际运行 ABI。

### P2：考虑可选内容包，而不是删除功能

若仍需进一步下降，可将贴纸大媒体或非默认 Office viewer 资源变成有摘要的官方内容包，
由插件按需安装。但这会降低完全离线程度，必须明确产品取舍；优先级低于“同一资产只打一份”。

## 功能吸收应继续依赖插件组合

用户关心的几项并不需要从 EAC 重写：

| 能力 | Marisa 现有来源 | 判断 |
|---|---|---|
| 任务/审批/完成通知 | `@bill9109/dsh-web-ui-notify` 已挂载 | 不重写 |
| 会话真实终端 | `dsh-better-sidebar` 的 xterm.js + node-pty | 不重写 |
| Git 状态、diff、stage/discard/revert/cherry-pick | `dsh-better-sidebar` Git 面板 | 不重写 |
| write/edit 工具调用内联 diff | `dsh-diff-viewer` | 目前 rc6 不兼容，非必需阻断项 |
| 整包自更新 | 当前没有等价插件 | 值得做 Marisa 定制插件 + desktop engine |

通知插件在 [cordis.patch.yml](../bundles/marisa-bundle/cordis.patch.yml) 中默认挂载；
`dsh-better-sidebar` 的功能说明见 [README](../plugins/dsh-better-sidebar/README.md)。

### `dsh-diff-viewer` 没有被完全替代

二者重叠的是“用户能看 diff”，但数据来源和工作流不同：

- `dsh-better-sidebar` 是工作台：从 Git/文件系统读取状态，在独立 VSCode 风格 tab 展示 diff，
  并提供 stage、discard、commit、revert、cherry-pick；
- `dsh-diff-viewer` 是工具行 renderer：接管 `tool.call.toolview` 的 `edit`/`write` key，把 Agent
  当前工具调用的 diff card 替换成 unified/split、词级高亮、折叠/虚拟化视图；它没有 Git
  状态管理，也不负责回退文件。

因此更准确的决策是：**better-sidebar 已覆盖主要 Git diff/回退工作流，diff-viewer 只剩内联
工具调用 diff 的增量价值**。当前 rc6 缺少它需要的 UI primitives 且 slot 选项不兼容，
Marisa 已明确不挂载它，[差异文档](plugins/dsh-diff-viewer.md) 和 profile test 也锁定了这一点。
应保留 vendored 源码等待上游适配，但不为“功能清单齐全”投入 Harness 私有 API 修补；如果未来
适配，只验证其能安全替换 stock write/edit renderer，不与 better-sidebar 的 Git 面板重复造功能。

## Marisa 定制更新插件的合理边界

### 为什么必须是“插件 UI + 桌面更新引擎”

Marisa 当前 Wails 窗口导航到 DSH 的随机 loopback URL，没有现成的 Wails JS binding；
Web 插件无法在应用退出后替换正在运行的 EXE，也不应得到任意下载、进程执行和安装目录写权限。
另一方面，更新入口、版本策略、跳过版本、Release notes 和进度条属于用户可见的 DSH 产品体验，
适合插件组合。

建议职责如下：

| 组件 | 负责 | 明确不负责 |
|---|---|---|
| `marisa-updater` client | 设置页/托盘入口、版本提示、同意/跳过、进度/错误/重启 UI | 直接写 EXE、运行 MSI、接收任意下载 URL |
| `marisa-updater` host | 读取发行策略、调用窄桌面 RPC、把状态流转成同源 API/event | 通用 shell、通用文件写入、npm install |
| desktop updater engine（Go） | 官方 Release 查询、断点下载、digest/签名验证、staging、应用、健康检查、回滚 | 决定用户 UI、独立更新 Harness/plugin |

由于当前页面和 Wails 壳不同源，最小桥接可由桌面宿主启动一个仅绑定 `127.0.0.1` 的临时控制端点，
把随机端口和随机 bearer token 只通过子进程环境传给 bundled DSH；host 插件代理少量类型化 RPC。
不要暴露“下载 URL + 目标路径 + 执行命令”这种通用接口。

建议 RPC 仅有：

```text
GetStatus()
Check(channel)
StartDownload(releaseId)
CancelDownload()
Apply(releaseId)
GetRollbackCandidate()
Rollback(candidateId)
```

桌面端必须只接受官方仓库中已解析的 `releaseId/assetId`，不能让 Web client 提交任意 URL。

### 更新单元必须是完整 Marisa Release

EAC 另有一条 DSH updater：用内置 npm 查询 `@deepseek-ai/dsh` 最新版，装入
`agent-staging`，再与用户目录 overlay 原子切换；失败可移走 overlay 回到 bundled copy。
[updater.js](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/updater.js)。

这个实现的 staging/rollback 机制可以借鉴，但 **Marisa 不应采用其更新粒度**。Marisa 的 Harness
fork、profile patch、28 个插件、桌面壳和兼容测试由同一 tag 固定；只升级 npm Harness 会绕过
`maintenance/upstreams.json`、`docs/upstream-diff.md`、插件 rc 兼容和整包桌面验收，形成不可复现
的分层漂移。

允许的更新源应只有：

```text
omdsh-dev/marisa-distro Release tag
  -> 该 tag 的 Windows standalone 或 MSI
  -> 该 tag 同时固定 desktop + backend + harness + profile + plugins
```

插件/市场自身仍可按各自既有策略安装用户扩展，但不能覆盖发行版内核闭包。

### 下载与验证

EAC 的客户端 updater 已实现有价值的 UX：`.part`、HTTP Range、`Content-Range` 起点检查、
服务器忽略 Range 时覆盖重下、60 秒 idle timeout、指数退避、最多 10 次重试、字节进度回调。
[client-updater.js](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/client-updater.js)。

但其最终校验只要求文件至少 64 MiB；即使与 Release 声明大小相差超过 2 MiB，也只记日志并继续，
没有验证 GitHub asset `digest`、SHA256SUMS 或签名。Marisa 应保留 UX，替换信任模型：

1. `.part` 元数据同时记录 release id、asset id、expected size、ETag/Last-Modified 和 digest；
2. 续传发送 `Range + If-Range`，asset identity/ETag 改变立即丢弃旧 part；
3. 完成后必须同时满足精确 size、GitHub asset `digest` 和 Release `SHA256SUMS.txt`；
4. 校验失败绝不进入 apply 状态；
5. 未来有证书后验证 Authenticode；更强方案是把签名 manifest 的公钥固定在 desktop binary；
6. GitHub digest 与同 Release SHA256 能防传输/缓存损坏，但若发布账号整体被接管，二者同源并非
   独立信任根，所以代码签名/签名 manifest 仍是最终要求。

### 应用与回滚必须区分三种失败

| 阶段 | 失败处理 |
|---|---|
| 下载中断 | 保留经 identity 校验的 `.part`，下次 Range 续传 |
| 文件替换/安装失败 | standalone 用外部 helper 的 old/new/backup 原子切换；MSI 用 MajorUpgrade 事务并保留日志 |
| 新版本能安装但启动失败 | 只有新壳启动、backend 解包、`dsh web` 发布 URL、profile/updater heartbeat 均成功后才删除旧版；否则 helper 回切 |

EAC portable 的批处理已有“备份旧 EXE -> 替换 -> 失败复制回去”的基础语义；Setup 失败则保留
安装器/日志并重启旧程序。Marisa 可以借鉴状态机，但不要直接复制批处理。Go helper 更容易做
路径白名单、进程等待、原子 rename、日志和测试。

当前 Marisa MSI 已有 `MajorUpgrade` 和 backend prepare/rollback custom action，能覆盖安装事务失败；
但 Windows Installer 不会因为新应用随后无法启动而自动回退，因此“安装后健康检查回滚”仍需桌面
helper 保留上一个可启动候选或缓存上一版 MSI。不能把 MSI 自带 rollback 宣称成完整运行时回滚。

### 更新状态机

```text
idle
  -> checking
  -> available
  -> downloading <-> paused/retrying
  -> verifying
  -> ready
  -> applying (external helper owns process lifetime)
  -> first_boot_healthcheck
  -> committed
             \-> rollback_pending -> rolled_back

任何 check/download/verify 错误 -> failed（当前安装保持不变）
```

插件只呈现这个状态机，desktop engine 持久化真实状态。应用重启后插件可恢复进度，不应把
“页面关闭”误当成取消或失败。

## 建议的实施切片

1. **包体基线工具**：在 CI 输出 runtime manifest、目录/扩展名大小、重复资产和压缩基准；设
   `backend.zip`/解包闭包预算，避免回涨。
2. **发布闭包白名单**：先让 Harness 和一个大插件走 pack-like stage，保持 ZIP 和启动方式不变；
   真实窗口验收后再扩展到全部包。
3. **去除 stickers / better-sidebar 重复**：只保留一个运行副本；升级 better-sidebar 时验证终端、
   Git、Office lazy chunks 和 rc6 API。
4. **archive benchmark**：同一 stage 比较 ZIP、tar.zst、7z 的大小、冷启动、内存和 Defender 时间；
   确定格式后修改 embedded/installed extractor。
5. **desktop update engine**：先实现只检查 + digest 验证下载，不执行；用伪 Release/本地 HTTP
   测 Range、ETag、断流、摘要失败和恢复。
6. **marisa-updater 插件**：接窄 RPC，完成设置页/进度/同意/跳过 UI；PR 明确新增网络、文件写入、
   进程/安装能力由 desktop 承担。
7. **apply/rollback**：分别做 standalone helper 和 MSI 流程，必须通过真实安装、启动、升级、
   人为损坏新 backend、自动回滚、卸载验收后才能默认开放。

## 最终取舍

EAC 证明了“自包含 + 丰富插件 + 小包”可以同时成立，最值得复制的是 **运行闭包纪律、solid
压缩、语言/native 裁剪和 updater UX**，不是把 Marisa 改成 Electron，也不是追 npm 最新 DSH。

SnowSalt 的 99 MB 是口径差异，不能作为瘦身目标；其 1.31 GB portable 反而说明直接携带完整
开发树和依赖会迅速膨胀。SnowSalt 应只作为产品交互原型来源。

Marisa 的目标应是：源码治理继续完整，终端用户成品只携带经过验证的运行闭包；已有终端、Git、
diff、回退、通知尽量由插件组合完成；唯一值得新增的系统级能力是 Marisa 整包 updater，而它必须
保持“插件负责体验和策略、desktop 负责受限特权操作”的边界。

## 一手来源

- EAC：
  [README](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md)、
  [electron-builder.yml](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/electron-builder.yml)、
  [package.json](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/package.json)、
  [after-pack.js](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/scripts/after-pack.js)、
  [DSH updater](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/updater.js)、
  [client updater](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/client-updater.js)。
- SnowSalt：
  [README](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/README.zh.md)、
  [repository tree](https://github.com/KYZHXL/deepseek-harness-snowsalt/tree/878d4e97d718c6b46dd298a5556f0939b26680c3)、
  [Release](https://github.com/KYZHXL/deepseek-harness-snowsalt/releases/tag/v0.1.0-salt)。
- Marisa：
  [make-bundle.ps1](../desktop/bundle/make-bundle.ps1)、
  [embedded.go](../desktop/embedded.go)、
  [installed.go](../desktop/installed.go)、
  [Product.wxs](../desktop/installer/Product.wxs)、
  [release workflow](../.github/workflows/release.yml)、
  [architecture](architecture.md)、
  [signing proposal](signing.md)、
  [dsh-better-sidebar README](../plugins/dsh-better-sidebar/README.md)、
  [dsh-diff-viewer README](../plugins/dsh-diff-viewer/README.md)、
  [diff-viewer compatibility note](plugins/dsh-diff-viewer.md)。
