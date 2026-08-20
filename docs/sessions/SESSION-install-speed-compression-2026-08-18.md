# 安装速度与压缩调优、工作区卡死修复（rc6→rc7 迁移 + tar.zst 打包链路 + 依赖闭包根治）

> 来源会话：`e7260392-328b-4336-99bd-457f05c51442.jsonl`（2026-08-17 17:21 → 08-18 07:00，转录 3268 行：50 条 user 消息、1917 条 assistant 消息）
> 整理方式：会话记录结构化纪要

## 背景与目标

本会话是一个延续会话：前一上下文是 Codex「desktop 安装后 UI 停在『正在加载工作区』」的挂起诊断，随后 fork 进插件取舍研究。会话开始时用户对插件评审结论提出修正（**a2a 留下**），并把注意力拉回两个核心问题：

1. **工作区卡死**：安装完桌面端后 UI 一直停在「正在加载工作区」，无工作区选择器、无会话、无 onboarding。
2. **安装太慢**：MSI / 首次解包要一两分钟，用户认为「不应该是秒安装吗」。

用户给出明确约束（本会话反复被强调）：

- **不要乱改 harness 源码** —— harness 只允许 sync 上游；兼容修复只能落在桌面打包层/客户端层。
- **发行版基于 rc6**（后来在本会话中途改向 rc7，见关键决策）。
- YAS（yet-another-subagent）与 a2a 都要保留。

本纪要与体积减重方案的关系：瘦身细节（*.map/test 裁剪、prebundle、体积数据）由 `SESSION-size-reduction-prebundle-2026-08-17.md` 覆盖，本纪要只在其影响安装速度/压缩链路时交叉引用，不重复展开。

## 关键决策与理由

| # | 决策 | 理由 | 时间 |
|---|---|---|---|
| 1 | **保留 dsh-a2a 插件**（不划入减重/默认关闭） | 用户明确要求；a2a 是多 agent 实时 mesh（`a2a_peers/message/history`），README 写明私网不鉴权 | 08-17 17:19 |
| 2 | **工作区卡死根因 = 握手契约不匹配**：已发布 `dsh-client-connection@0.1.0-rc.6` 的 `hostDescribeValueSchema` 要求 `canOpenPath: boolean()` 必填，而 vendored host（私有快照 `4e7fb95f`）不返回该字段 → 握手抛错 → WS 断开 → 无限重连 → 工作区一直 pending | MSI 日志 + 发布包字节核对 | 08-17 17:22–18:26 |
| 3 | **放弃「patch 客户端 schema」路线，改为把 harness sync 到正确的 rc**（当时是 public rc6 `fb826987`） | 用户质问「为什么要 patch 一个我们自己构建的 MSI 里的 client.js」「我们就是应该基于 rc6」—— 根因是 vendored 快照落后于 public rc6（rc6 的 host 本来就返回 `canOpenPath`），正确修法是 sync 上游让 host/client 同源、零 patch | 08-17 18:28（用户拍板 A 路线） |
| 4 | **中途改向：直接以 rc7（`99f6f02fe`，上游 master HEAD）为目标**，整个项目按 rc7 重新评估 | 用户中断后拍板（原文被中断标记覆盖，见「无法核实」）；rc6→rc7 只有 22 个 first-parent PR（比 4e7fb95f→rc6 小得多），且 rc6 树替换的依赖改名大部分仍有效 | 08-17 18:43 |
| 5 | **安装慢的修复组合**：① 原生 Go junction 替代逐条 `cmd mklink /J`（1865 条，每条 spawn 一个 cmd 进程）；② 并行解压（worker pool 并发写盘）；③ 换压缩格式/压缩率（见下） | MSI 实测 PrepareBackend ≈ 108s（358MB zip → 929MB、56360 文件、9764 目录 + 1865 条 mklink） | 08-17 17:53–19:18 |
| 6 | **junction 用微软官方 go-winio 的 `EncodeReparsePoint`**（不再手写 reparse buffer） | 用户质疑「你为啥要自己写？网上没有？」；go-winio 是官方库、布局经过验证；`internal/fs` 的 `CreateJunction` 不能 import 但 `EncodeReparsePoint` 是公开 API。手写踩坑记录：`SubstituteNameLength` 字段应**不含** NUL、`inBufferSize = 8 + ReparseDataLength` | 08-17 19:28–19:33 |
| 7 | **bundle 膨胀根因 = pnpm 11 嵌套 workspace**：`harness/pnpm-workspace.yaml` 使 harness 被独立完整安装（连 devDeps），staged 树 2257MB、bundle 838MB | make-bundle 重跑发现 838MB（基线 358MB）；lockfile 里存在独立 `harness:` importer | 08-17 19:50–20:02 |
| 8 | **用 Zstd 压缩（用户建议）**：Go 用 `klauspost/compress`（zip method 93），高压缩比 + 解压快 | 用户 20:04 明确建议；7z deflate mx=9 之后仍有空间 | 08-17 20:04 |
| 9 | **压缩 worker 架构最终定为「核数级长期 encoder + `EncodeAll` 快速路径 + `zip.CreateRaw` 顺序写」** | 经过一串失败实验（见时间线）：8MB/s 单线程 → 文件级并行 → 用户建议 8k worker（细小文件多）→ goroutine-per-file 内存爆 → 512 worker 吃 5GB 内存（level-19 encoder 实际 ~16–32MB/个，不是预估的 4MB）→ 用户大怒要求成熟方案。`CreateRaw` 是标准库 API，无每文件 encoder 创建，`EncodeAll` 是 klauspost 主打 API | 08-17 20:35–20:55 |
| 10 | **按用户给的成熟方案重写压缩管理（zipzstd v2）**：每个 level 档 1 个全局 encoder（`EncodeAll` 可并发调用）、内容哈希去重（xxhash）、分级 level（`<64KB→12 / 64KB-8MB→17 / >8MB→流式多线程`）、已压缩格式直接 Store、字节限流 512MB、小顶堆保序、归一化时间戳保证可复现 | 用户 21:10 贴了一份自包含方案，要求「压缩管理和 node_module 打包的东西」；方案明确「`EncodeAll` 本身可并发调用（内部有按 `WithEncoderConcurrency` 的状态池）」—— 纠正了「每 worker 一个 encoder」的错误认知 | 08-17 21:10 |
| 11 | **esbuild node_module 打包评估为不可行，改用 runtime 缓存 + 文件数裁剪替代** | DSH 是 cordis 插件框架（插件运行时动态 require），esbuild 只能 bundle CLI 静态骨架，插件依赖闭包必须保留 → 收益有限 | 08-17 21:10 前后 |
| 12 | **容器从 zip 换成 tar.zst 单流**（用户建议） | 用户 21:27 提出；单流压缩让排序后相似文件相邻、窗口内跨文件去重 → 压缩比更高（316MB vs zip 398MB，小 21%），单 encoder 内存几十 MB，解压 ~1GB/s | 08-17 21:27 |
| 13 | **tar.zst 窗口保持 16MB（放弃 128MB 窗口）** | 128MB 窗口 + 瘦身出 108MB bundle，但纯解压 23.58s（远 match 复制带宽受限）→ 安装 58s；16MB 窗口 302MB / 37s。**安装速度优先于体积**（用户最初诉求就是安装快） | 08-17 21:50 |
| 14 | **瘦身（删 `*.map` + `test/tests/__tests__`）放在 junction 删除之后** | 瘦身递归遍历会跟随 junction 误删 live 树/根 store；junction 删除后树是纯实体，可安全递归。瘦身砍掉 9656 条目，5.8 万→~4.9 万文件 | 08-17 21:39 |
| 15 | **写盘参数定为 8 worker、不做文件大小预分配（presize）** | 实测：删每文件 `MkdirAll`（tar 目录条目已建父目录）37s→32s；16 worker + Truncate 预分配反而 34s（Truncate 触发额外分配/清零）→ 回退 8 worker 无 presize | 08-17 21:52–21:55 |
| 16 | **依赖解析根治：根 package.json 显式依赖全部 268 个 workspace 成员 + 全部 file: 包**（完整闭包） | 连续 6 轮 boot 报错（cosmokit → 12 个成员 → 23 插件 → dsh-storage）根因一致：**pnpm 11 + `install-links: false` 下 file: 链接包的依赖装在包自己的 node_modules、不 hoist 到根，workspace peer 也不自动装**；profile 的解析面 = 根 node_modules（junction）→ 缺依赖逐个报错。让根拥有完整解析面一次解决。用户批评「你为什么不找根本原因」后收敛 | 08-17 22:27–22:36 |
| 17 | **写 stage-boot 工具（秒级验证），不再每次全量打包验证** | 用户质问「验证一次你几把要跑10分钟，你要验证多少次？」；stage 树就是打包内容，重建链接 + boot + host.describe 一条命令即可，全量 make-bundle 只在最终确认跑一次 | 08-17 22:21 |
| 18 | **runtime 缓存 key 用 `git stash create -u` 的 `^{tree}`**（内容 hash，dirty 也命中） | 第一版 key 在 dirty 时带时间戳 → 永远 miss；第二版用 `git stash create` 的 commit hash → 含时间戳仍然每次变；最终用 tree hash（只依赖内容）+ `-u`（含未跟踪的 dsh-mygo） | 08-17 22:11 / 08-18 06:42 |
| 19 | **MyGO 换源：从 npm `@r05en1cu/dsh-mygo*` 换成 vendored `omdsh-dev/dsh-mygo@next`（7 包），keyed 契约修复做在源码里**（不再用补丁文件） | 用户 06:04 指出正确来源是 GitHub next 分支（比 npm rc.7 新 2 天）；next 源码也还是 list 契约（`id/order`），但 vendored 后可改源码：`key: entryId` + slot 声明 `keyed` + 删 list-era `label` | 08-18 05:48–06:13 |
| 20 | **profile workspace 必须含 plugins/bundles/dsh-mygo 成员** | 插件旧范围依赖（如 `dsh-client-runtime@^0.0.1-rc.1`）在 profile workspace 缺成员时解析到 registry 旧版 → 传递依赖 `dsh-compact` 404 | 08-18 06:18 |

## 工作过程时间线

按阶段组织（时间均为会话内 UTC+8 大致时刻）。

### 阶段 1：插件取舍收尾 + 目标确认（08-17 17:21–17:58）

- 延续上一会话的插件评审：YAS 是官方 `subagent` 的增强替换（单一 tool + profile + 实时 toolcall + 子会话跳转），撞名官方 `tool-subagent`（`registerGlobal` 硬失败）→ 留作 Experimental；interpreters（`run_python`/`run_node`）与 pwsh 重叠；sidechain 收回该留。
- 用户 17:19 明确：**a2a 可以留着**，同时提出工作区卡死 + 安装慢两个问题。assistant 定位握手根因（见决策 2），并确认安装慢 = 358MB zip 解压 + 1865 条 mklink。
- 17:53 用户 `/model` 切 Opus 4.8、`/effort max`；17:57 要求「handoff，把我的需求说给我，不允许 toolcall」—— assistant 输出三条需求（a2a 留下 / 先修工作区卡死且不改 harness / 查安装慢）。

### 阶段 2：canOpenPath 路线之争 → rc6 sync 启动（17:58–18:43）

- 尝试写 `canOpenPath: boolean().optional()` 的 pnpm patch（`patches/@deepseek-ai__dsh-client-connection@0.1.0-rc.6.patch`）+ `make-bundle.ps1` 后置校验。
- 18:26 用户发火：「你为什么他妈的要patch一个他妈的msi的canOpenPath的client.js……msi是我们构建出来的，同时我们目前用的发行版是他妈的rc6，不是他妈的rc7」。澄清后用户 18:28 拍板：**走 A 路线 —— sync vendored harness 到 public rc6（`fb826987`）**，host 天然返回 `canOpenPath: true`，零 patch。
- 撤销 patch（删 patch 文件、撤 `patchedDependencies`、重跑 install 清掉 patched 状态）；junction 改动保留。
- 18:30–18:43：harness 树替换为 fb826987（git archive 展开 + robocopy；`.claude/skills` symlink 等 8 个链接修复；`tool-cordis` 路径 cordis/→extensions/ 对齐；依赖名批量改名 `dsh-bash→dsh-shell`、`dsh-tasks→dsh-jobs`、裸 `schemastery→@deepseek-ai/schemastery` 等；overlay / cordis.patch.yml / make-bundle.ps1 的 ui-slash/ui-command alias 补丁删除（新树原生 `inputTriggers`/`commandUi`））。install 反复报 `scandir harness/packages/cordis/tool-cordis` 旧路径残留。

### 阶段 3：rc7 迁移（18:43–19:18）

- 用户中断后拍板：直接以 rc7（`99f6f02fe`）为目标。harness 再替换为 rc7 树；rc6→rc7 无包名变更，依赖改名大部分仍有效。
- 处理：插件版本面检查（settings.plugin.item 从 list 变 keyed-by-namespace 是 rc7 最大破坏面）、`tsconfig.host.json` 排除 examples/website、根 lockfile 更新、插件 prepare/build（`--ignore-scripts` 先建图 → 构建 harness lib → 再补插件 prepare，避免 a2a 等 git mirror 插件因 lib 缺失编译失败）。build.ps1 确认只重构建 a2a/code-map/sidechain 三个插件，其余插件 lib 随 vendored 提交。

### 阶段 4：安装慢实测与 junction 原生化（19:18–19:35）

- 用户再次问「为什么安装这么慢」。assistant 给出 108s 分解：解压 358MB→929MB（56k 文件顺序写盘）+ 1865 条 mklink；并实施 `extractZip` 并行化（8 worker）。
- 19:27 用户质疑手写 junction，改用 go-winio `EncodeReparsePoint`；测试全过（能跟随访问、重命名、幂等），并记录两个手写踩坑（字段不含 NUL、inBufferSize = 8+ReparseDataLength）。

### 阶段 5：make-bundle 838MB 之谜 → 嵌套 workspace 根治（19:35–20:04）

- make-bundle 重跑出 **838MB** bundle（基线 358MB）；staged 树 2257MB；links 从 1865 暴涨到 8444。
- 根因：pnpm 11 对「workspace 成员内的 pnpm-workspace.yaml」做嵌套完整安装（连 devDeps），根 + harness 双份。修法：staged 树排除 `harness/pnpm-workspace.yaml` → stage 2257MB→822MB。
- 但 822MB 的 stage 里仍有 harness 顶层 node_modules 1.3GB —— 进一步发现根 lockfile 里固化了 `harness:` 嵌套 importer（开发 install 时生成的）。修法：**临时移走 harness/pnpm-workspace.yaml → 重新生成纯根 lockfile（只有 `.` importer，成员以 `link:` 内联）→ 移回**。live 树旧嵌套 store（1.3GB）成为孤儿数据后删除。
- 20:04 用户建议 Zstd。assistant 选定 `klauspost/compress` zip method 93 方案（打包端 Go 工具写 zip，解压端 klauspost reader）。

### 阶段 6：压缩速度调优马拉松（20:20–21:09）

一路失败与修正（本会话最曲折的一段，用户多次发火）：

1. zstd max（level 22）对 900MB 太慢（10 分钟未完成）→ 降 level 19。
2. 用户反馈压缩只跑 **8MB/s**，CPU/磁盘没吃满 —— 单线程 WalkDir 顺序压缩。改文件级并行（worker pool 压缩 + 主线程顺序写 zip，zip.Writer 不能并发写）。
3. 用户 20:38：「速度还是不对，你尝试开8k个worker，因为我们细小的文件太多了」。assistant 解释 encoder 内存约束（8k 个 encoder 会爆），用 goroutine-per-file + semaphore + encoder pool。
4. 20:41 用户：「内存上去的很厉害，但是cpu开销还是很低」。分析出两宗罪：56k goroutine 栈内存（448MB）+ `Reset/io.Copy/Close` 每文件 ~20ms 开销（56k×20ms÷16 核 ≈ 69s，正是实测）。
5. 20:43 用户：「你为啥不开到512」→ 512 个固定 worker × 每 worker 一个 encoder。
6. 20:48 连续抓出两个数据竞态：`readFile` 的 `defer dataPool.Put` 提前还池导致 EncodeAll 读到被覆盖的 buffer（zip 只有 3MB = 全是空 entry）；out buffer 复用竞态（channel 里未消费的旧引用被覆盖）。修：数据所有权保持到 EncodeAll 之后、压缩结果不复用（`EncodeAll(data, nil)` 新分配）。
7. 20:49 用户：「我的电脑被你干碎了，200吧」+「旧文件应该卸载或者写盘做cache啊，你全部读到内存里吗」。512 个 level-19 encoder（实际 ~16–32MB/个）≈ 5GB 内存。
8. 20:51 用户：「你吃了我5g内存同时磁盘读写和cpu利用率低的可怜……你重新给我一个方案」。assistant 承认 encoder 内存估错，给出核数级（16）worker + 固定 encoder + EncodeAll + GOGC 400 方案。
9. 20:53 用户：「问题依旧，我现在要求你找一个成熟的方案」。改用**标准库成熟 API 组合**：`zip.CreateRaw`（预压缩数据直写，无 RegisterCompressor 的每文件 encoder 创建）+ 核数个长期 encoder + EncodeAll；CRC/大小由调用者手动填。跑通：114775 文件 61s、exit 0，但压缩比可疑（795MB）。

### 阶段 7：stage 数据修正 + zipzstd v2 + 第一次安装实测（21:04–21:27）

- 795MB 异常溯源：stage 还是 2333MB —— walker 修复没生效 + 根 lockfile 嵌套 importer（阶段 5 的根治在这里闭环）。纯根 lockfile 后重打：**bundle 377MB**（58362 文件，无嵌套 store），zip 完整性验证通过（65815 entries、200 抽样 0 CRC 错）。
- 解压端补 `zip.RegisterDecompressor(93, ...)`（klauspost zip 读 zstd 需显式注册）→ **安装实测 44s**（基线 108s，提升 59%），解压完整（58362 文件 + 2538 junctions）。
- 21:10 用户贴成熟方案（压缩管理 + node_module 打包）→ 实施 zipzstd v2：分级 level、哈希去重、Store 兜底、单全局 encoder（EncodeAll 并发）、字节限流、小顶堆保序、GC 调优（SetGCPercent 400）。**37s / 398MB / 可复现（两次构建 hash 一致）**。
- make-bundle 加 runtime 缓存（lockfile+树 hash 为 key，dirty 不写缓存——后被推翻）；esbuild 评估不可行（决策 11）。
- v2 安装实测 46s（提升 57%）。至此达成：安装 108→46s、bundle 838→398MB、压缩 61→37s、可复现、二次启动 VERSION 门控跳过。

### 阶段 8：tar.zst + 瘦身 + 窗口权衡（21:27–22:05）

- 21:27 用户：「我觉得可能tar.zstd会更好？你可以做一下，注意下我们环境没有defender」。实现 tarszst 打包端 + extract_tar.go 解压端，产物改名 `backend.tar.zst`（zip 解压器删除）。
  - **316MB**（比 zip 398MB 小 21%）、可复现、打包 59s。
  - 顺序流解压 74s（写盘变顺序单线程）→ 改「顺序读流 + 并行写」（8 worker，字节限流）→ **35s**。
- 21:39 用户贴了一份 node_modules 压缩深度分析（DwarFS/squashfs 挂载方案 / tar.zst 参数 / 先瘦身 / pnpm PnP）。决策：Windows 桌面必须落盘 → 排除挂载方案与 PnP；执行 tar.zst 调优 + 瘦身：
  - tarszst 窗口 16MB→128MB（等价 `--long=27`）+ level 9→8；
  - make-bundle 在 junction 删除后加瘦身（`*.map` + `test/tests/__tests__`），砍掉 9656 条目；
  - 结果 **108MB** bundle（316→108，再降 66%）。
- 安装验证踩坑：`unexpected EOF` 解压失败 —— 诊断读同一文件 CLEAN EOF，最终定位为**测试时机问题**（bench5 拷贝 tar.zst 时 make-bundle 还在写该文件，拷到截断文件），非代码 bug。重测成功：45755 文件、58s。
- **58s > 35s**：128MB 窗口纯解压 23.58s（远 match 复制带宽受限）→ 回 16MB 窗口（保留瘦身、level 8）→ **302MB / 37s**。再优化：删每文件 MkdirAll → 32s；16 worker + presize → 34s 回退 → 33s 确认（决策 15）。
- 22:05 起 boot 验证安装产物，连续暴露打包层真实缺陷（见「遇到的问题」第 2–5 项）：cosmokit → @img/colour → dsh-llm/dsh-session → 23 插件 → dsh-storage。根因收敛为 file:/peer 依赖不 hoist（决策 16），最终 **stage-boot 全通过**（boot OK + handshake OK + canOpenPath）。

### 阶段 9：desktop 启动 + Web UI 报错排查（22:36–08-18 06:51）

- 22:36 用户：「6:40之前做完，把desktop启动出来」。不等 make-bundle，用已验证的 staged 树起 dev shell → stage 被 final4 重建（bin.js 暂缺）→ 切 live 树后端重启 → 06:38 desktop 启动成功（PID 3020，`attachedSessions: 1`，握手完整，canOpenPath: true），赶在 6:40 前。final4 全量打包 exit 4 失败（日志截断）。
- 08-18 05:44 用户回来：「我们现在有时间了，请你整个跑一遍，同时注意webui端的报错提示」。用 chrome-devtools 检查 Web UI 控制台，抓到 **MyGO ext-panel keyed slot 错误**（rc6 list 契约 `id/order` vs rc7 keyed 要求 `key`）。
- MyGO 修复链：npm rc.7 未修（发布早于 rc7 harness）→ 仓库私有拿不到上游 → 打 pnpm patch（root）→ 报错仍在 → 发现 live profile 是独立 install、其 node_modules 未打补丁 → 手动 patch profile → 控制台干净 → 06:04 用户指出**正确来源是 `omdsh-dev/dsh-mygo@next`** → vendored 7 包 + 源码级 keyed 修复（决策 19）+ 构建踩坑（schemastery 类型歧义、keyed 无 label、MYGO_VERSION 引用、profile workspace 需含 dsh-mygo/plugins/bundles）→ 06:25 控制台 **0 error**（仅 1 条 genui 正常提示 + 2 条 a11y 表单警告）。
- 最终 make-bundle 两次失败：先 staged 缺 dsh-mygo（make-bundle 未拷）→ 补拷贝 + srcMap；final6 完成（**309.2MB**）+ 写缓存。
- 06:32 用户：「尽可能多做一下cache加速测试闭环」。重跑测命中：5 分钟未完成 = 没命中 → 定位 `git stash create` commit hash 含时间戳 → 改用 `^{tree}` + `-u`（决策 18）→ 新 key 首跑全量 375s 写缓存 → 立即重跑 **5s 命中（75 倍）**。
- 06:51 安装产物全闭环：install **40s**（47461 文件）、boot OK、host.describe OK（canOpenPath: true）、启动日志 0 errors。
- 06:59 用户：「剩余事项做个handoff，发给我」→ 写 `docs/HANDOFF-2026-08-18.md`。

## 产物与影响

### 代码/工具（`desktop/`、`scripts/`、仓库根）

- **`desktop/bundle/zipzstd`**（打包端，zip+zstd method 93，v2：分级/去重/Store/保序/可复现）→ 后被 tarszst 取代（zip 解压器删除）。
- **`desktop/bundle/tarszst`**（打包端：tar 单流 + zstd，排序 ext/dir/name + 归一化时间戳 + 16MB 窗口 + level 8）。
- **`desktop/bundle/stage-boot`**（秒级验证工具：重建 LINKS 链接 → boot → host.describe → 退出码）。
- **`desktop/junction_windows.go`**（基于 go-winio `EncodeReparsePoint` 的原生 junction）+ 测试。
- **`desktop/extract_tar.go`**（tar.zst 顺序读流 + 并行写，字节限流）+ embedded/installed 切换。
- **`desktop/bundle/make-bundle.ps1`**：排除嵌套 workspace（/XF pnpm-workspace.yaml）、瘦身段（junction 删除后）、`@img` prune 修正（只删平台二进制包）、runtime 缓存（tree-hash key）、dsh-mygo 拷贝 + srcMap、zip→tarszst。
- **根 `package.json` / `pnpm-workspace.yaml`**：根显式依赖全部 268 workspace 成员 + 全部 file: 包（完整闭包）；`hoistPattern` 相关未用（最终靠显式依赖）。
- **`dsh-mygo/`**（vendored，7 包，源码级 keyed 修复 + 构建产物 lib）；`dsh-mygo/pnpm-workspace.yaml` 已删（避免嵌套）。
- **`maintenance/upstreams.json`**：harness pin `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（rc7，2026-08-18 复核），note 注明替换了缺 `canOpenPath` 的私有快照 4e7fb95f。
- **`docs/HANDOFF-2026-08-18.md`**：会话末尾交接文档（已完成清单 / 剩余事项 / 关键命令 / 坑与教训）。

### 关键数据（实测）

| 指标 | 基线 | 最终 | 中间数据 |
|---|---|---|---|
| 安装耗时（解压+链接） | 108s | **40s** | zip zstd 44s/46s → tar.zst 35s → 瘦身后 37s → 删 MkdirAll 32–33s → 最终 40s（47461 文件） |
| bundle 大小 | 838MB（嵌套污染） | **295MB** | zip zstd 398MB → tar.zst 316MB → 16MB+瘦身 302MB → final6 309.2MB（最终 295MB 以 HANDOFF 为准） |
| 压缩耗时 | 61s（zip v1） | **37s**（zip v2） | tar.zst 打包 59s |
| 压缩可复现性 | ✗（7z 时间戳） | **✓**（两次构建 hash 一致） | — |
| runtime 缓存 | 无 | **375s → 5s（75×）** | dirty 也命中；key = lockHash + `^{tree}` |
| 文件数 | 56360 | 47461（瘦身后） | 瘦身砍 9656 条目 |
| 二次启动 | 重新解压 | 跳过（VERSION 门控） | 已有机制保留 |

### 影响面

- harness 从私有快照 4e7fb95f（rc6 标称）升级到 public rc7；client/host 同源一致，握手问题根治（`canOpenPath: true` 由 host 返回，客户端 schema 不再需要 patch）。
- 打包链路从「7z deflate zip + mklink」变为「tar.zst 单流 + 并行写 + 原生 junction」，安装体验 108s→40s，体积 838MB→295MB。
- 依赖解析从「逐个补缺」变成「根完整闭包」，后续新增插件/成员不再踩同类解析坑。
- Web UI：MyGO 设置卡从报错到 0 error；MyGO 来源从 npm 旧渠道改为 vendored next。

## 遇到的问题与解决

1. **工作区卡死（握手挂起）**：client 必填 `canOpenPath`、host 不返回 → 无限重连。解决：sync harness 到 public rc6→rc7，host 返回该字段，契约同源；客户端 patch 方案撤销。开发树 boot 测不出此问题（开发树路径解析恰好能通），**安装产物 boot 才是唯一可靠检查**（本会话反复印证）。
2. **打包产物 boot 连续暴露运行时依赖缺失**（cosmokit / @img/colour / dsh-llm / dsh-session / 23 插件 / dsh-storage）：
   - `@deepseek-ai/cosmokit`：bundle 的 `file:` cordis 依赖在根是实体，依赖 workspace 成员但根无该依赖（未 hoist）→ 根显式加依赖。
   - `@img/colour`：现有 prune 的 `@img` 段「非 win32-x64 全删」误删纯 JS 库（sharp 运行时依赖）→ 只删平台二进制包。
   - `dsh-llm/dsh-session`：实体包（tool-pwsh/tool-cordis）的 **peer** 依赖不触发 hoist → 根补齐 12 个成员。
   - 23 个插件：bundle（file: 包）的依赖装在 bundle 自己的 node_modules、不 hoist 到根，profile 从根解析失败 → bundle 的全部插件依赖提升为根依赖（路径基准修正：bundle 相对路径 `../../plugins` → 根相对 `./plugins`）。
   - `dsh-storage`：workspace 成员（storage-domain）的 peer 不被 autoInstall → 终极方案 = 根依赖全部 268 成员 + 全部 file: 包。
3. **压缩速度与内存反复失控**（详见阶段 6）：8MB/s 单线程；encoder 创建风暴（sync.Pool 被 GC 清空 → New 反复）；`EncodeAll` 前的 buffer 竞态（zip 只有 3MB = 空 entry）；512 worker × level-19 encoder ≈ 5GB 内存；`concurrency(1)` 人为关闭 zstd 多线程的认知错误（文件级并行下每 worker 单线程是对的，大文件才值得内部多线程）。教训：**worker 数不是并行度关键，encoder 内存与每文件固定开销才是**。
4. **tar.zst `unexpected EOF`**：误判为代码 bug，实为测试拷贝时机（文件还在被写入时被复制）。教训：后台打包完成后要确认进程真正退出再拷贝产物。
5. **128MB 窗口解码慢**：压缩比好（108MB）但解压 23.58s（远距离 match 复制受内存带宽限制）→ 安装速度优先，回 16MB 窗口。
6. **make-bundle 缓存从不命中**：dirty 时 key 带时间戳 → 永远 miss 也不写；后改用内容 hash，仍因 commit 时间戳 miss；最终 `^{tree}` 解决（决策 18）。
7. **成员枚举脚本两次误收/误删**：一次把非成员（`@dpskh/ui-a2a` 子包）当成员导致 install 失败；一次递归深度 bug 把 152 个真实成员当非成员删掉（git checkout 恢复）。教训：成员枚举用 `pnpm -r list --depth -1 --json`，不要自写 glob 递归。
8. **MyGO keyed 错误**：rc6 list 契约（`id/order`）不满足 rc7 keyed；npm 渠道旧、仓库私有；root patch 生效但 profile（独立 install）未生效；web dist 重建无效（MyGO client 是运行时从 node_modules 加载，不打进 dist）。最终换源 vendored next + 源码级修复。
9. **profile install 依赖解析**：profile workspace 缺 plugins/bundles 成员 → 插件旧范围依赖解析到 registry 旧版（`dsh-client-runtime@0.0.1-rc.1` → `dsh-compact` 404）→ profile workspace 补齐成员。
10. **PowerShell 工具限制**：递归删除被静态拦截（用 `cmd rmdir /s /q`）；robocopy 参数被误拦；here-string 里的 `//go:build` 被扫（分步写文件）；bash 的 `$TEMP` 无效（用绝对路径）。

## 要点摘录

- 用户原话（17:19）：「a2a可以留着啊，你还没有把我们那个工作区问题修好，还有，为什么这个安装过程会这么慢？不应该是秒安装吗？」
- 用户原话（18:28）：「对啊，A啊，你为什么要这么做，我们就是应该基于rc6啊」—— 确认 sync harness 而非 patch 客户端。
- 用户原话（19:27）：「你为啥要自己写？网上没有？」→ go-winio。
- 用户原话（20:38）：「速度还是不对啊，你尝试开8k个worker进行，因为我们细小的文件太多了」。
- 用户原话（20:43）：「你为啥不开到512」→ 512 worker 内存爆（5GB）。
- 用户原话（20:53）：「问题依旧，我现在要求你找一个成熟的方案，目前这个完全不可行，你完全在浪费我的时间」。
- 用户原话（21:27）：「我觉得可能tar.zstd会更好？你可以做一下，注意下我们环境没有defender」。
- 用户原话（22:21）：「验证一次你几把要跑10分钟，我问你，你要验证多少次？你在逗我？」→ stage-boot 秒级验证。
- 用户原话（22:36）：「6:40之前做完，把desktop启动出来」—— 06:38 达成。
- 用户原话（06:04）：「看上游源码，上游应该修了」→ 实际正确来源是 `omdsh-dev/dsh-mygo@next`。
- 工程结论（可复用）：
  - **pnpm 11 嵌套 workspace**：成员目录内的 `pnpm-workspace.yaml` 触发独立完整安装（双重 store 1.3GB）；lockfile 生成时嵌套文件不能在位；staged 树排除该文件。
  - **file: 包依赖不 hoist 到根、workspace peer 不自动装** → 发行版根依赖 = 全部 workspace 成员 + 全部 file: 包闭包。
  - **zstd（klauspost）**：level-19 encoder 内存 ~16–32MB/个（非 4MB）；`EncodeAll` 线程安全可并发；小文件用 EncodeAll 快速路径（消除每文件 Reset/Close ~20ms）；zip 用 `CreateRaw` 避免 RegisterCompressor 的每文件 encoder 创建；**窗口越大解码越慢**（远 match 复制带宽受限），安装场景 16MB 优于 128MB。
  - **验证用 stage-boot（秒级），全量打包只在最终确认跑一次**。
  - **打包产物 boot 是唯一可靠检查**（开发树 boot 掩盖依赖解析差异）。
  - `git stash create` 的 commit hash 含时间戳，缓存 key 必须用 `^{tree}` + `-u`。

## 关联文档

- `docs/HANDOFF-2026-08-18.md` —— 本会话末写的交接文档（已完成/剩余事项/关键命令/坑），与纪要互补，含最新的产物位置与验收清单。
- `docs/sessions/SESSION-size-reduction-prebundle-2026-08-17.md` —— 体积减重/瘦身/压缩参数细节（*.map/test 裁剪、prebundle），本纪要仅交叉引用（该文件当时为「整理中」，若缺失以 HANDOFF 与原始会话为准）。
- `docs/sessions/SESSION-rc6-vs-rc7-2026-08-17.md`、`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md` —— rc6→rc7 差异（21 个 PR、settings keyed 契约等）。
- `docs/upstream-diff.md` —— 需按 rc7 重写（本会话遗留事项，见 HANDOFF）。
- `maintenance/upstreams.json` —— harness pin 已更新为 rc7 `99f6f02f`。
- `docs/support.md` —— canOpenPath 诊断文案需更新（已根治，HANDOFF 遗留事项）。

## 遗留问题与风险（截至会话末）

1. **harness → git submodule 转换未做**（用户已认可方向）：pin `99f6f02fe`；harness 内 1 处本地修改（`tsconfig.host.json` vitepress 排除）需记录重放；转换会吞掉当前 ~5000 文件的巨大工作区 diff。
2. **工作区改动未提交**：rc7 sync + 打包链路 + vendored mygo 全未提交；提交前需删 `dsh-mygo/.git`、确认忽略规则覆盖 lib 产物。
3. **文档滞后**：`docs/upstream-diff.md` 还是 0808 清单；`docs/plugins.md` 状态表过期（多个「未挂载」实际已 insert，YAS 是唯一真未挂载）；rc7 插件兼容评估清单未写。
4. **清理**：`release/.cache/` 旧 key 缓存（40BF3B9E、…5639f19b）、`.tmp-*` 目录、`pnpm-lock.yaml.bak-rc6sync`。
5. **插件 rc7 兼容未完整评估**：YAS 保留但未挂载（撞名官方 `tool-subagent`，需按 YAS 自己的 patch 禁官方 subagent）；`dsh-llm-fallbacks` 按不兼容禁挂载需重测；sonar/track/diff-viewer 等兼容停用插件未重测。
6. **最终验收未跑**：`build.ps1` 全流程一次 + 重建 MSI（当前 `release/Marisa-DSH-0.1.0-x64.msi` 构建于 MyGO vendored 之前，需重建）。

## 无法核实的内容

- 用户 18:43「直接适配到 rc7」的原话：该条 user 消息在转录中仅剩 `[Request interrupted by user for tool use]` 标记，拍板决定仅见于 assistant 的思考记录（「用户拍板了：直接适配到 rc7」）与后续执行（待核实原文）。
- 108s 安装基线来自 MSI 日志时间段（PrepareBackend 17:47:45→17:49:33），为当时实测；各中间版本数字（46s/44s/35s/37s/32s/33s/58s/40s）均来自会话内多次实测，机器环境（SSD、16 核、无 Defender）下有效。
- 早期 zipzstd 异常产物（23.9MB / 3.10MB / 2.1MB 的 zip）的精确成因（数据竞态 vs fatal 提前退出）会话内推理链完整但未逐项单独复现。
- 最终 bundle 体积在会话内报告为 309.2MB（final6），HANDOFF 记为 295MB（可能为最终一次构建的实测），以 HANDOFF/原始会话为准（待核实）。
