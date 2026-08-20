# 体积减重与压缩方案：zstd/tar.zst 全链路调优与 vendor prebundle 调研

> 来源会话：`361f287c-8af8-4af8-b081-71ed6b74cf8d.jsonl`（主会话，2026-08-17 17:21 → 08-18 05:44 UTC）、`e331393b-59bc-4fe0-922f-e7a2433dbcbd.jsonl`（主会话期间派生的后台调研任务，2026-08-17 21:28 → 21:57 UTC）
> 整理方式：会话记录结构化纪要
> 说明：本纪要聚焦**体积/压缩方案**（bundle 容器从 7z deflate 到 zip+zstd 再到 tar.zst、压缩参数调优、瘦身裁剪、runtime 缓存、vendor prebundle 调研）。安装速度的细节由 `SESSION-install-speed-compression-2026-08-18.md` 覆盖，本纪要只交叉引用不展开。时间均为 UTC（北京时间 = UTC+8；会话内用户口述「6:40 前做完」即 08-18 06:40 北京 = 08-17 22:40 UTC）。

## 背景与目标

- 直接触发：用户问「为什么这个安装过程会这么慢？不应该是秒安装吗？」（17:19 UTC）。当时安装基线 **108s**（解压 358MB + 56k 文件 + 1865 次 spawn `mklink`），bundle 是 7z deflate 的 `838MB`（含嵌套 harness workspace 的重复安装污染）。
- 会话前半段（17:21–19:56）完成了插件取舍澄清（YAS 留、interpreters/mineru/canvas/a2a 不当默认卖点）、桌面握手 `canOpenPath` 兼容补丁、rc7 sync，以及 make-bundle link walker 修复（stage 同阶段 2257MB → 822MB，排除嵌套 workspace 后少约 1.4GB 重复安装）。
- 会话主线（20:04 起）：用户建议改用 Zstd 高压缩比压缩 → 由此展开容器格式（zip method 93 → tar.zst 单流）、压缩参数（level/窗口/并行度）、打包期瘦身、runtime 缓存、boot 验证修复等一系列决策与实现。
- 次会话（e331393b，后台调研）：用户把「vendor prebundle」方案（Vite `optimizeDeps` / `@vercel/ncc` 同思路）贴给后台 agent，要求量化「可压扁叶子依赖」的占比，验证方案 A（原地逐包 bundle）是否值得做。
- 两条约束（贯穿始终）：**cordis 单例层和插件闭包层保持原样，只动叶子依赖**；harness 只 sync 上游、不在发行层乱改源码。

## 关键决策与理由

| # | 决策 | 理由 | 时间（UTC） |
|---|---|---|---|
| 1 | **压缩算法换 Zstd（klauspost/compress）**，容器先选 zip + method 93 | 用户建议「Zstd 用比较高的比例，Go 有库」。klauspost/compress 是 Go 生态标准（Docker/MinIO 在用），其 `zip` 子包支持 zstd method 93 且 API 与 `archive/zip` 兼容、向后兼容旧 deflate bundle；zstd 对 JS/JSON 文本通常比 deflate 小 15–30%，解压快 2–5 倍 | 20:04–20:07 |
| 2 | **klauspost 版本钉死 v1.18.3**（与 wails v3.0.0-beta.3 的约束一致） | `go get klauspost@v1.18.0` 触发 MVS 把 wails 降级到 alpha.63；恢复 wails beta.3 并改用其要求的高版本 | 20:06 |
| 3 | **zstd 压缩级从 22（SpeedBestCompression）降到 19** | level 22 对 900MB 树 10 分钟未完成；level 19 对 JS/JSON 文本与 max 压缩比差 ~1–2%，速度快数倍 | 20:31 |
| 4 | **文件级并行压缩（worker pool + 主线程顺序写 zip）** | 用户实测压缩只有 **8MB/s**、CPU/磁盘没吃满——zipzstd v1 是单线程顺序压缩。zip.Writer 非并发安全，故「多 worker 压缩 + 顺序写」 | 20:35 |
| 5 | **8k worker 的正确工程化解释：goroutine-per-file + encoder 池（sync.Pool）** | 用户建议开 8k worker（小文件太多）。但每 worker 一个 zstd encoder（各 ~2–4MB 表）8k 个会爆内存；正确结构是并发度≈文件数、encoder 复用池 | 20:38–20:39 |
| 6 | **大文件（node.exe 98MB）值得 zstd 单文件内多线程，小文件走文件级并行** | 用户质疑「zstd 难道不支持多线程」；klauspost 支持 `WithEncoderConcurrency`（frame 分块并行），但 zip.Writer 不能并发写，文件级并行下每 worker 内再开线程会过并行 | 20:36–20:39 |
| 7 | **按用户给的成熟方案（4.x）重写 zipzstd v2：哈希去重 + 分级 level + Store 兜底 + 单全局 encoder（EncodeAll 并发）+ 字节限流 + 保序输出 + GC 调优** | 用户贴来完整方案并要求「压缩管理和 node_module 打包」。关键认知：`Encoder.EncodeAll` 本身可并发调用（内部有按 `WithEncoderConcurrency` 大小的状态池），每 level 档只需 1 个全局 encoder——直接解决之前「worker 数 × encoder 内存」爆炸问题 | 21:10–21:14 |
| 8 | **node_module 打包（esbuild bundle）对 Marisa 收益有限，选 runtime 缓存替代** | gen-external.mjs 扫描根 node_modules 只有 3 个 external 包；但 DSH 是 cordis 插件框架（插件运行时动态 require），esbuild 只能 bundle CLI 静态骨架，插件依赖闭包必须留在 node_modules，缩不下来 | 21:15 |
| 9 | **runtime 缓存：VERSION 去掉 git sha，key = lockfile hash + 内容 hash** | VERSION 含 git sha 会让 key 每次 commit 都变、缓存永不命中；VERSION 只写 `marisa-backend-$bundleVersion`（dirty 加后缀）即可满足解压端版本门控 | 21:16–21:17 |
| 10 | **容器换成 tar.zst（单流）** | 用户提议「我觉得可能 tar.zstd 会更好？」。单流压缩让排序后相似文件相邻、16MB 窗口跨文件去重，压缩比更高；单 encoder 内存 = 窗口 × 并发（几十 MB）；流式解压 ~1GB/s。产物改名 `backend.tar.zst`，解压端只支持新格式（不做双格式） | 21:27 |
| 11 | **tar 解压改为「顺序读流 + 并行写」** | tar 顺序单流解压导致写盘也顺序单线程（5.8 万文件 74s），比 zip 并行写（46s）慢；改为读进内存缓冲 + 8 worker 并发写 + 字节限流 | 21:35 |
| 12 | **采纳「先瘦身再压缩」：打包期删 `test/tests/__tests__` 目录 + `*.map` 文件** | 用户贴来 node_modules 压缩决策分析（DwarFS/squashfs/tar.zst 方案三）；我们的场景是 Windows 桌面必须落盘、不能挂载、不能改包管理器 → 砍文件数比压缩比更值钱。瘦身放在 junction 删除之后做（避免递归遍历跟随 junction 删到 live store） | 21:39–21:40 |
| 13 | **tarszst 窗口 16MB → 128MB（`--long=27`）、level 9 → 8** | 按用户给的 `tar --sort=name | zstd -8 --long=27 -T0` 调优；128MB 窗口抓跨包重复、level 8 打包更快体积接近 | 21:39 |
| 14 | **128MB 窗口回退到 16MB（保留瘦身）** | 128MB 窗口解码太慢：纯解压 108MB 花 23.58s（远 match 复制带宽受限），安装 58s vs 16MB 窗口 35s。体积换不回安装速度 → 安装速度优先 | 21:50–21:52 |
| 15 | **删解压端每文件 `MkdirAll`（32s），presize/Truncate 反而慢（34s）回退** | tar 的目录 entry 已建好父目录，每文件 MkdirAll 是 45k 次多余 stat；Truncate 预设大小触发额外分配/清零反而更慢，保持 8 worker、无 presize = 32–33s 最优 | 21:52–21:54 |
| 16 | **根 package.json 补齐 cosmokit → 12 个成员 → 23 个插件 → 全部 268 个 workspace 成员依赖** | boot 验证连环暴露「实体安装的包（file: 依赖）的 workspace 依赖/peer 不 hoist 到根」：根是 profile 的解析面，缺谁谁炸。最终方案：根显式依赖**全部 workspace 成员** + 全部 file: 插件 → 根 node_modules = 完整闭包，一次解决 | 21:55–22:32 |
| 17 | **make-bundle 的 @img 段 prune 只删平台二进制包** | 现有 prune「非 win32-x64 全删」误删纯 JS 的 `@img/colour`，sharp 运行时依赖它 → boot 失败 | 22:09 |
| 18 | **runtime 缓存 dirty 时也用内容 hash 做 key（`git stash create`）** | 用户质问「为啥这几把 make bundle 完全没有 cache？」——原设计 dirty 时 key 带时间戳永不命中；改为 `git stash create` 快照工作区（SHA 反映所有 tracked 改动），内容不变就命中，dirty 也写缓存 | 22:11 |
| 19 | **写 stage-boot 工具：直接 boot staged 树做秒级验证** | 用户批评「验证一次你要跑 10 分钟，你要验证多少次？」——不再每次全量 make-bundle 再验证，stage 树就是打包内容，重建链接 + 启动 + host.describe 一条命令 | 22:21–22:22 |
| 20 | **根依赖用 pnpm 自己的成员列表枚举（268 个）** | 自写枚举脚本递归深度 bug 误删 152 个真实成员依赖；git checkout 恢复后改用 `pnpm -r list` 枚举 workspace 成员，精确补齐 | 22:34–22:35 |
| 21 | **（次会话）vendor prebundle 判定：方案 A 做，方案 B 不做** | stage 树实测 D 类（可压扁叶子）占文件数 **95.0%**（远超 50% 门槛）→ 方案 A（原地逐包 bundle）收益确定；方案 B（统一 vendor.js + `Mod._load` patch）增量收益小、风险高（私有 API + registry 维护），且多版本冲突在 hoisted 布局只有 15 个嵌套实例 | 21:43–21:57（08-17） |

## 工作过程时间线

### 阶段 0：插件取舍与安装慢的起点（17:19–17:24 UTC）

- 用户：YAS 留着（有功能提升）；解释 interpreters；「为什么安装这么慢？不应该是秒安装吗？」。
- 结论：a2a 留、sidechain 收回「该留」；mineru（无服务）/aigc-canvas（stub）/a2a（多 agent 网）不当默认。`docs/plugins.md` 状态表落后于 `cordis.patch.yml`。

### 阶段 1：握手补丁、rc7 sync、walker 修复（17:24–19:56 UTC）

- 处理桌面握手 `canOpenPath` 兼容（发行层补丁路线），rc7 sync（harness/依赖/插件/组合/boot/握手）。
- make-bundle link walker 修复：排除整棵 `harness/node_modules` 子树；stage 同阶段 2257MB → **822MB**（少 1.4GB 重复安装）；v8 bundle = 348.9MB（已裁 532.7MB）。

### 阶段 2：Zstd 决策与 zipzstd v1（20:04–20:39 UTC）

- 20:04 用户建议 Zstd → 采用 klauspost/compress，zip method 93；`desktop/bundle/zipzstd/main.go` + 解压端 import 替换 + make-bundle 7z 步骤替换。
- 20:31 zstd max（22）太慢 → level 19。
- 20:35 用户反馈 **8MB/s** → 文件级并行（16 worker）。
- 20:36–20:39 用户追问多线程、要求开 8k worker → goroutine-per-file + encoder 池；随后发现 69s/23.9MB 异常、encoder 创建/GC 风暴、内存 5GB 等问题，多轮重写（32 固定 worker × 固定 encoder + buffer 池、大小分流 EncodeAll/流式）。

### 阶段 3：成熟方案落地：zipzstd v2 + runtime 缓存（21:10–21:17 UTC）

- 21:10 用户贴来「Electron-free Node desktop app 快速构建+打包方案」，要「压缩管理和 node_module 打包」。
- 21:14 zipzstd v2 完成：**37s（vs v1 61s）、398.1MB、可复现 ✓**；method 分布 53715 zstd + 12100 stored。
- 21:15 gen-external.mjs 扫描：根 node_modules 2463 文件只有 3 个 external 包；判定 esbuild 对 DSH（cordis 动态加载）收益有限。
- 21:16–21:17 runtime 缓存实现（VERSION 去 sha；dirty 时 key 带时间戳——后来被否）。

### 阶段 4：tar.zst 全链路（21:27–21:38 UTC）

- 21:27 用户：tar.zstd 更好；环境没有 Defender。
- 打包端 `desktop/bundle/tarszst`（排序 + 归一化 + 16MB 窗口 + level 9→SpeedBetterCompression）、解压端 `extract_tar.go`、embedded.go/installed.go 切换、产物改名 `backend.tar.zst`（wxs/build-msi 同步）。
- 21:33 结果：**316.1MB**（vs zip 398MB，小 21%）、可复现、打包 59s；但顺序解压 74s。
- 21:35–21:38 改「顺序读流 + 并行写」→ **35s**（基线 108s，提升 68%）。

### 阶段 5：瘦身与窗口调优（21:39–21:54 UTC）

- 21:39 用户贴 node_modules 压缩决策分析（DwarFS/squashfs/决策表）→ 采纳「方案二变体 + 方案三（先瘦身）」；tarszst 窗口 128MB + level 8；make-bundle 在 junction 删除后加瘦身段（`test/tests/__tests__` + `*.map`）。
- 21:45 瘦身砍 **9656 条目**（5.8 万 → ~4.9 万），128MB 窗口下 bundle **108MB**。
- 21:46–21:48 安装 `unexpected EOF` → 诊断流完整（52581 entries CLEAN EOF），查明是**测试时机**问题（make-bundle 未退出时就拷贝了 tar.zst，拷到写一半的文件）；重测通过（45755 文件 / 2538 junctions / 911MB），但 58s。
- 21:50–21:54 128MB 解码 23.58s 太慢 → 回 16MB 窗口：302.5MB / 37s；删 MkdirAll → 32s；presize 34s 回退 → 33s 确认最优。

配置对比（会话实测）：

| 配置 | 体积 | 安装 |
|---|---|---|
| 基线（7z deflate + 嵌套 store） | 838MB | 108s |
| zip zstd v2（16MB 窗口） | 398MB | 46s |
| tar.zst 16MB 窗口 | 316MB | 35s |
| tar.zst 16MB + 瘦身 | 302MB | 33–37s |
| tar.zst 128MB 窗口 + 瘦身 | 108MB | 58s（解码 23.58s） |

### 阶段 6：boot 验证修复链（21:55–22:36 UTC）

- 21:55 boot 失败：`@deepseek-ai/cosmokit` 缺失 → 根因是根 `cordis` 为 file: 实体、其 workspace 依赖没 hoist 到根；根 package.json 显式加 `@deepseek-ai/cosmokit: workspace:^`。
- 22:09 下一个：`@img/colour` 被现有 prune 误删 → 修正 @img 段只删平台二进制包。
- 22:18 再下两个：`dsh-llm`、`dsh-session`（实体包 peer 依赖不 hoist）→ 根补 12 个成员。
- 22:27 再下：`@loserfox/git-identity`（profile 从根解析 23 个插件缺）→ 根显式依赖 bundle 的全部插件（file: 同源，pnpm 去重）；脚本复制的相对路径基准修正（`../../plugins` → `./plugins`）。
- 22:30 a2a → storage-domain → `dsh-storage` 链断 → 扫描所有根 file: 包的 deps+peer 的 workspace 依赖，补齐 4 个；22:32 终局方案：**根依赖全部 268 个 workspace 成员**。
- 22:34 枚举脚本递归 bug 误删 152 个成员 → `git checkout -- package.json` 恢复 → `pnpm -r list` 精确枚举 → 268 成员 + 23 插件就位。
- 22:36 **BOOT OK + handshake OK**（`boot OK: http://127.0.0.1:7558`，`host.describe has canOpenPath`）。全量 make-bundle 启动（final4，随后后台任务报 exit code 4 失败——见遗留问题）。

### 阶段 7：缓存修复与 desktop 启动（22:11–22:38 UTC）

- 22:11 用户质问缓存不命中 → `git stash create` 内容 hash key，dirty 也命中/写缓存。
- 22:21 用户批评验证循环慢 → stage-boot 工具（重建 LINKS 链接 + 启动 + host.describe + 退出码，一条命令）。
- 22:36–22:38 用户「6:40 前做完，把 desktop 启动出来」→ 不等 final4（stage 树正被重建，bin.js 暂缺），改用 live 树 + dev shell 启动；`DSH_WEB_CMD` 路径空格解析问题改 PATH 上的 `node` → **22:38 desktop 启动成功**（`dsh web: http://127.0.0.1:1055`，`attachedSessions: 1`，握手完整，赶在 6:40 北京前）。

### 阶段 8：vendor prebundle 调研（次会话 e331393b，21:28–21:57 UTC 08-17）

- 用户把方案 A/B 分析贴给后台 agent：「调研一下这个方案」。
- 测量对象最终锁定 `release/_stage`（make-bundle 产物、junction 已删、裁剪已做 = shipped 内容的 ground truth）；期间发现 stage 正在被并发 make-bundle 重写（PID 15136，05:40 启动），等其完成后重测。
- 关键修正：上轮 444MB / 114,775 文件 / 61s 是 **rc7 sync 之前**的数字；rc7 sync 后 bundle = **256.9MB**，shipped 树 ~45.8k 文件。
- 分类统计表（stage 树实测）与方案判定见「产物与影响 / 关键决策 21」。
- 附加发现：codex 353MB 二进制来源链、dev 工具链以 prod 依赖身份进 bundle、cordis 单例检查通过。

## 产物与影响

### 代码/文件产物

- `desktop/bundle/zipzstd/main.go` — zip + zstd（method 93）打包工具；v2 实现：xxhash 内容哈希去重、分级 level（<64KB→12 / 64KB–8MB→17 / >8MB→流式多线程）、已压缩格式 Store 兜底、512MB 字节限流、小顶堆保序输出、`SetGCPercent(400)` + `SetMemoryLimit(3GB)`、归一化时间戳（可复现）。
- `desktop/bundle/tarszst/main.go` — tar + 单流 zstd 打包工具（排序 `(ext, dir, name)`、16MB 窗口（最终）、level 8（最终）、`WithEncoderConcurrency(NumCPU)`、`WithEncoderCRC(false)`、Mode/时间归一化）。
- `desktop/bundle/extract_tar.go` — tar.zst 解压端（zstd 流式 + tar.Reader + 顺序读流 + 8 worker 并行写 + 字节限流 256MB；目录由 tar 目录 entry 预建、文件写不再 MkdirAll）。
- `desktop/bundle/stage-boot` — staged 树直接 boot 验证工具（重建 LINKS.json 链接 + 启动 + host.describe + 退出码）。
- `desktop/bundle/gen-external.mjs` — 扫描 node_modules → external 清单（命中 `*.node`/install 脚本/`__dirname` 等即保留）。
- `desktop/bundle/make-bundle.ps1` — 多轮改动：7z → zipzstd → tarszst；link walker 排除 harness 顶层 node_modules；junction 删除后瘦身段（test/tests/__tests__ + `*.map`，安全递归）；runtime 缓存（key = lockfile sha256 + `git stash create` 内容 hash，dirty 也命中/写）；VERSION 去 git sha（+dirty 后缀）；@img prune 修正。
- `desktop/bundle/embedded.go` / `installed.go` — 切到 tar.zst（`embeddedBackendVersion` 用 tar 读 VERSION）；`backend.tar.zst` 产物名（wxs / build-msi.ps1 同步）。
- 根 `package.json` — 补齐 cosmokit、12 个成员、23 个插件（file:）、全部 268 个 workspace 成员（workspace:^），使根 node_modules 成为完整闭包。

### 关键数字

- 安装耗时：108s → 46s（zip v2）→ 35s（tar.zst 并行写）→ 32–33s（16MB 窗口 + 瘦身 + 去 MkdirAll）；二次启动跳过（VERSION 门控）。
- bundle 体积：838MB（基线）→ 398MB（zip zstd v2）→ 316MB（tar.zst）→ 302MB（16MB + 瘦身）→ 108MB（128MB 窗口，因解码慢未采用）。
- 压缩耗时：61s（v1）→ 37s（v2）；打包（tar.zst）59s；runtime 缓存命中后常态打包接近 0s（提交后生效设计）。
- 瘦身：pruned 9656 条目；安装产物文件数 58362 → 45755。
- 可复现性：zipzstd v2 / tarszst 两次构建 hash 一致 ✓。
- stage 树（shipped 内容 ground truth，08-18 实测）：651 包 / 30,972 文件 / 391.8MB。

### vendor prebundle 调研结论（次会话）

分类统计表（stage 树）：

| 类别 | 包数 | 文件数 | 文件占比 | 字节 | 字节占比 |
|---|---|---|---|---|---|
| A. @deepseek-ai/* 插件闭包层 | 4 | 49 | 0.2% | 4.9MB | 1.3% |
| B. 框架层 cordis/schemastery | 3 | 41 | 0.1% | 0.4MB | 0.1% |
| C. 原生/资源类（bin/scripts） | 18 | 1,470 | 4.7% | 106.4MB | 27.1% |
| **D. 可压扁叶子依赖** | **626** | **29,412** | **95.0%** | **280.1MB** | **71.5%** |
| 合计 | 651 | 30,972 | 100% | 391.8MB | 100% |

D 类内部：静态图安全 564 包 / 21,428 文件（69.2%）/ 144.8MB（37.0%）；含危险标记（dirname/dynreq/spawn）62 包 / 7,984 文件（25.8%）/ 135.3MB（34.5%）；插件层 31 包 / 1,384 文件 / 82MB（stickers 37.8 + better-sidebar 25.3 + vision-toolkit 5.2 等）。

- **方案 A（原地逐包 bundle，保留目录外壳 + package.json + index.js + subpath stub）**：D-clean 去掉插件层 ≈ 537 包 / ~20k 文件 → 压扁后 ~600 文件 → node_modules 文件数降 ~65%、shipped 总文件降 ~43%、解压耗时降 30–40%；字节 D-clean 144.8MB → ~100–110MB（省 ~11%，zstd 对小文件本就高效，字节收益中等）。
- **方案 B（统一 vendor.js + registry + `Mod._load` patch）**：现阶段不做——多版本冲突在 hoisted 布局只有 15 个嵌套实例（几 MB，全在 dev 工具链）；lockfile 里 189 个多版本名字大多是 devDeps/平台包。
- **两条约束的落地规则**：@deepseek-ai/* 与 cordis/schemastery 不动；含 `*.node`、install/postinstall、`__dirname`/`bindings(`/`node-gyp-build`/`process.dlopen`、`*.wasm`、非字面量 `require(`、spawn/fork 自身路径、多版本（仅方案 B）、peer 含 cordis/schemastery 者排除；压扁目标**排除插件层**（开发面）。
- **方案 A 风险清单**（来自用户贴的方案，调研确认保留）：stack trace 变差 → `sourcemap: 'external'` + `keepNames: true`、`.map` 在裁剪时对 bundle 产物例外保留；`DSH_NO_PREBUNDLE=1` 逃生门；subpath stub 静态扫出全部被引用 subpath、缺失直接构建失败；conditional exports 改写成单一 require 入口（确认调用方全走 CJS）；package.json 必须保留（运行时读 version）。

## 遇到的问题与解决

| 问题 | 根因 | 解决 |
|---|---|---|
| `go get klauspost` 把 wails 降级到 alpha | MVS 版本约束冲突（wails beta.3 要求 klauspost v1.18.3） | klauspost 用 v1.18.3，恢复 wails beta.3 |
| 压缩 8MB/s，CPU/磁盘没吃满 | zipzstd v1 单线程顺序压缩 | 文件级并行 + encoder 池；后续 v2 全局 tier encoder（EncodeAll 并发） |
| 并行版异常小（69s/23.9MB）、内存 5GB、CPU 8% | encoder 每文件新建（创建/GC 风暴）；level 19 encoder 实际 ~16–32MB/个，200 个即 5GB | 每 level 档 1 个全局 encoder（EncodeAll 并发）；32 固定 worker + buffer 池 |
| 抽样 500 entry 全是 stored | 排序后恰好抽到 stored 组（图片/字体） | 全量 method 统计：53715 zstd + 12100 stored，正常 |
| 安装 `zip: unsupported compression algorithm` | 解压端没注册 zstd（method 93）decompressor | `RegisterDecompressor(93, ...)` |
| tar.zst 顺序解压 74s | 顺序单流导致写盘串行 | 顺序读流 + 8 worker 并行写（35s） |
| 安装 `unexpected EOF` | **测试时机**：make-bundle 未退出就拷贝 tar.zst（写一半） | 等 make-bundle 完全退出后重测（45755 文件正常） |
| 128MB 窗口安装 58s | 解码慢：纯解压 108MB 23.58s（远 match 复制带宽受限） | 回 16MB 窗口（302MB / 33s） |
| 删 MkdirAll → 32s；presize 34s | Truncate 预设大小触发额外分配/清零 | 保持 8 worker、无 presize（32–33s 最优） |
| boot 失败：cosmokit → 12 成员 → 23 插件 → 268 成员连环缺 | pnpm 11 + `install-links: false`：file: 链接包（实体）的 workspace 依赖/peer 不 hoist 到根；根是 profile 的解析面 | 根显式依赖全部 268 个 workspace 成员 + 23 个 file: 插件（一次解决，非逐个补） |
| boot 失败：`@img/colour` 被删 | 现有 prune「@img 非 win32-x64 全删」误删纯 JS 包 | @img 段只删平台二进制包（`sharp-libvips-*` 等） |
| runtime 缓存从未命中 | dirty 时 key 带时间戳、且不写缓存 | `git stash create` 内容 hash 做 key（dirty 也命中/写） |
| 验证循环 10 分钟/轮 | 每次改完都全量 make-bundle | stage-boot 工具直接 boot staged 树（秒级），全量只在最终确认跑 |
| 成员枚举脚本误删 152 个根依赖 | 递归深度参数 bug | `git checkout -- package.json` 恢复 + `pnpm -r list` 精确枚举 |
| `DSH_WEB_CMD` 报 `exec: "C:\Program": not found` | 带空格路径被 parseCommandLine 拆错 | DSH_WEB_CMD 改用 PATH 上的 `node` |

## 要点摘录

- 「Zstd 好主意——klauspost/compress（Go 生态标准，Docker/MinIO 都在用）正好有 zip 扩展：支持 zstd 压缩方法（method 93）的 zip 读写，API 与 archive/zip 完全兼容。」
- 「zip.Writer 本身不能并发写（CreateHeader 非线程安全），所以正确结构是**文件级并行 + 每 worker 一个 encoder**……**大文件**（node.exe 98MB）才值得单文件内多线程。」
- 「`EncodeAll` 本身可并发调用（内部有按 `WithEncoderConcurrency` 大小的状态池）……不要每 worker 一个，更不要 `sync.Pool`（GC 清池 = level 19 建表风暴）。」
- 「tar.zstd 确实更好——单流压缩（排序后相似文件相邻，16MB 窗口跨文件去重 → 压缩比更高；单个 encoder 内存 ~几十 MB）+ 流式解压 ~1GB/s。」
- 「窗口越大 → encoder 内存越大（窗口 = 内存）。128MB 窗口 → encoder ~128MB+ 表 → 单 encoder（tarszst 只有一个）→ 内存 ~200MB ✓ 可接受。」
- 「128MB 窗口压缩比好（108MB vs 316MB）但解码慢……**体积换不回安装速度**，回 16MB 窗口（保留瘦身）。」
- 「瘦身没帮安装提速（37s vs 35s）→ **写盘瓶颈是字节/IO 上限，不是文件数**。瘦身价值 = 体积。」
- 「pnpm 11 + `install-links: false`：**file: 链接包的依赖装在包自己的 node_modules，不 hoist 到根**……根本修复：根显式依赖**全部 workspace 成员** → 根 node_modules 是完整闭包 → 所有解析从根。」
- 「（用户）验证一次你几把要跑10分钟，我问你，你要验证多少次？你在逗我？」→ 催生 stage-boot 秒级验证。
- 「（次会话结论）方案 A 做，方案 B 不做——文件数 95% 在 D 类，远超 50% 门槛……字节收益中等：D-clean 144.8MB 压扁后约 100–110MB，省 ~11%。」
- 「（codex 二进制）shipped bundle 里两者都没有……但如果哪天 composition 挂载了这两个 subagent，bundle 会瞬间 +250~350MB——这是挂在裁剪名单上的定时炸弹。」
- 「（dev 工具链）typescript@6.0.3（23.2MB/140 文件）是 typert/generator + dsh-code-map 的 prod dep；vite、vitest、rollup、tsx 是 test-support 包的 prod dep。加起来 ~44MB / 2,000+ 文件……能摘则摘，零语义风险。」

## 关联文档

- `docs/sessions/SESSION-install-speed-compression-2026-08-18.md` — 安装速度细节（本纪要交叉引用对象；当时为整理中状态）。
- `docs/PLAN-bundle-size-100mb-20260819.md` — 后续（08-19）包体压缩计划：make-bundle walker 二次修复（558.8MB → 264.4MB），100MB 候选手段（PNG/`.ts` 源码/`.pdb`/`.tsbuildinfo`/node.exe UPX），本会话的 tar.zst/tarstat/瘦身是其前提。
- `docs/packaging.md` — 打包链路说明（`make-bundle.ps1` 产出 `backend.tar.zst`；MSI 展开）。
- `docs/sessions/README.md` — 会话纪要索引（本纪要登记行）。
- `docs/plugins.md` — 插件取舍背景（阶段 0；状态表落后于 `cordis.patch.yml`）。
- `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md` — rc7 sync 背景（阶段 1 前置）。
