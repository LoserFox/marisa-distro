# pnpm hoisted linker 安装 OOM —— 全量上下文（2026-08-23）

> 目的：把问题、数据、已试路径、当前状态完整摊开，供任何人（社区、其他 agent、pnpm 上游）独立评估解法。
> 核心诉求：在这台 16G 内存的 Windows 机器上，让裸 `pnpm install` + `pnpm run dev` 可用。

---

## 1. 环境

| 项 | 值 |
|---|---|
| 机器 | Windows 11 x64，物理内存 15.7 GiB（FreePhysicalMemory 空闲态 ~4.6G，其余为 standby） |
| pnpm | 仓库钉 11.9.0；已测最新 11.22.0（含上游 2026-07-19 的 resolver 内存修复） |
| Node | v26.4.0（PATH 里的 node.exe 与系统 SHA256 一致，已排除二进制问题） |
| 仓库 | marisa-distro——DeepSeek dsh（harness）的发行版仓库：harness 全源码 vendored + 32 个插件 + Go/Wails 桌面壳 + profile 生成器 |

### workspace 形态（`pnpm-workspace.yaml` 关键配置）

```yaml
nodeLinker: hoisted        # ← 问题核心，非默认；为 bundle 的扁平运行时布局而选
linkWorkspacePackages: true
install-links: false
# overrides: rolldown 1.2.4 / cordis 4.0.0-rc.7 / typescript 6.0.3 / fflate 0.8.3
# minimumReleaseAge 开启，exclude 白名单 ~200 条（rc.6/rc.8/rc.2 三个家族）
```

- **286 个 workspace importer**（harness ~250 + plugins 32 + mygo 8 + profile 等）
- **1673 个 registry 包**，lockfile 33209 行
- **dsh 全家桶互相 peer 依赖**：~90 个 `@deepseek-ai/*` 包的 peerDependencies 指向兄弟包 → lockfile 里 4000+ 个 peer 变体条目，**peer 键互相嵌套**（如 `ui-brand-official@...(嵌 locale 键)(嵌 runtime 键)(嵌 sidebar 键...)`）

## 2. 症状

`pnpm install`（frozen 或 no-frozen、有树或无树）在**解析完成后、链接开始前**崩溃：

```
Progress: resolved 1673, reused N, downloaded 0, added 0     ← added 永远是 0
[xxxx:yyyy] NNNms: Mark-Compact MMMM (MMMM) MB ... allocation failure
FATAL ERROR: Ineffective mark-compacts near heap limit — exit 134
```

解析阶段（`resolved 1673/1674`）在 8G 堆下**每次都能完成**；死的是之后的链接规划（hoisting plan）。GC 日志显示堆是真填满（不是缺页假象）。

## 3. 完整实验矩阵（全部实测，堆签名在 %TEMP%/pnpm-*.log）

| # | 条件 | 结果 |
|---|---|---|
| 1 | hoisted，8/10G 堆，GUI 应用运行中 | ❌ 堆填满 8.2G 崩 |
| 2 | hoisted，10G 堆，**空闲机器**，frozen 一致 lockfile | ❌ 填满 10.2G（2.6 min） |
| 3 | hoisted，12G 堆，空闲机器 | ❌ 填满（7.3 min） |
| 4 | hoisted，12G 堆，**pnpm 11.22.0**（含 resolver 修复 #13133） | ❌ 填满 12.25G（10.8 min） |
| 4b | hoisted，**16G 堆**（pagefile 兜底，验证"虚拟内存熬过去"假说） | ❌ 填满 16349MB 仍在分配（17.6 min）；GC 死亡螺旋：每轮 mark-compact **79 秒**、回收率 mu=0.001；运行中 FreeVirtual 压到 1.7G |
| 5 | hoisted，**prod 子集**全新安装（bundle stage，286 importer） | ✅ 8-10G 内，几分钟 |
| 6 | hoisted，**热树增量**（lockfile 精确匹配，+14 包） | ✅ 58 秒 |
| 7 | **isolated** linker，dev 全量，8G 堆 | ✅ **34 秒**（+1548 包）；重装 13.9s |
| 8 | hoisted，热树 + no-frozen 重算（peer 哈希漂移） | ❌ 规划期爆 |

**结论**：dev 全量图的 hoisted 链接规划存活集 **>12G**；同图 isolated 8G 内完成。机器物理上限 ~12G 可用。这是规模 × 算法的边界，与内存压力、循环依赖、lockfile 损坏均无关（已逐一排除，见 §5）。

## 4. 已排除的假设（有证据）

1. **物理内存不足/应用抢内存**——实验 #2/#3/#4 全部空闲机器仍爆；且 #6/#7 同机成功。
2. **workspace 目录循环/嵌套 workspace 被打通**——lockfile importers 恰好 285/286 个与 manifest 数一致；`.tmp*/`、`release/` 下的残留树贡献 0 个 importer；解析每次稳定终止。
3. **cyclic workspace 依赖**（pnpm 每次都 WARN 的 5 组上游 harness 循环）——成功日志里同样存在。
4. **lockfile 损坏**——frozen 一致性通过；`--lockfile-only` 重算 8 秒完成从不崩。
5. **node 二进制**——SHA256 与系统一致。
6. **上游已修复**——#8441 由 PR #13133（`fix(resolver): condense retained registry metadata`，2026-07-19，zkochan）关闭为 completed，但那是**解析阶段**的 packument 保留问题（他们的复现死在 resolved 1176/1464）；我们解析必过、死于链接规划。实验 #4（含该修复的 11.22.0）照样爆。

## 5. 根因链

1. **直接原因**：hoisted linker 在 286 importer × 1673 包 × 重 peer 图上的规划内存**无收敛增长**——8/10/12/12.25/16G 逐级填满且死时仍在分配（`added` 恒为 0）。对磁盘上 ~5GB 的树，规划器存活集 >16G 属于病态保留模式，疑与 #13133 修过的"整份保留不裁剪"同类但发生在 linker 规划阶段。
2. **放大器（peer 晶格）**：同 manifest 确定性重算（两次 byte-identical）与历史 lockfile 的 **peer 变体哈希全量不同**（包集合一样、1664 个包不变）——疑因 registry 浮动区间在 24h 内解析到新实例。peer 键嵌套传递 → 底层一个实例变化 → 传递闭包全部重哈希 → pnpm 视为全树重链 → 规划爆炸。**任何 importer 变更都会触发这条路。**
3. **历史原因**：以前所有成功安装都是增量（+14 级）；根 node_modules 被删后首次出现全量需求，才暴露此边界。此前从未有人在此机器做过全量 hoisted 安装。

## 5.5 堆快照分析（4G 上限濒死快照，3.29GB，`.dev/heapsnapshots/`）

| 指标 | 值 |
|---|---|
| 堆对象总数 | **46,462,677**（类型直方图总和与 meta 精确一致） |
| 数组 array | 21,667,595 个，self 3.16GB |
| 普通对象 object | 24,343,005 个，self 1.07GB |
| **Map 实例** | **15,613,825 个**（self 500MB，条目数组另计） |
| **Set 实例** | **6,041,708 个**（self 193MB） |
| 字符串节点 | 仅 118,600 个（字符串表仅 20MB）——**排除 #8441 那类元数据/字符串保留病** |

**判读**：内存不是被字符串/元数据吃掉的，而是**每格一个小哈希结构**的模式性爆炸——1673 个包对应 15.6M 个 Map（≈每包 9300 个），是 per-(包 × peer 变体 × 提升目标) 的组合结构。与 lockfile 的**双家族状态**互相印证：当前 lockfile 仍有 **2819 处 rc.8 引用 vs 56 处 rc.2**（插件仍声明 `^0.1.0-rc.8`，与 workspace rc.2 家族共存）——registry rc.8 × workspace rc.2 的交叉 peer 键正是晶格膨胀源，在堆上物化为千万级 Map/Set。

**由此产生的缓解假设（已验证——部分成立）**：2026-08-23 执行了全仓收敛（9 个 manifest、134 处 `^0.1.0-rc.6/rc.8` → `workspace:^`/`^0.1.1-rc.2`），lockfile 结果：rc.8 引用 2819→361、peer 变体键 464→150、包数 1665→1512、行数 -5601。**但 hoisted 全量安装峰值未变**：收敛后 8G/12G/16G 均仍填满（12G 签名 12265MB @ 9.95min，与收敛前 12254MB 一致；16G 同样填满）。结论：**planner 峰值由 importer × 包矩阵主导**（286 importer × 每 importer ~5.4 万 Map 的 per-importer 提升簿记），非家族交叉主导；收敛的价值在图洁净度与体积（-153 包/-5601 行），不在内存。"32G 加内存"路径因此也不确定——峰值未测到顶（>16G）。

**报上游的弹药升级**：hoisted planner 对 1673 包 workspace 分配 15.6M Map + 6M Set（46M 对象）、>16G 堆、`added=0`——per-cell 哈希结构无界组合，与已修的 #8441（resolver 字符串保留）是不同子系统的同类病。

## 6. 附带发现

- **双写冲突**：若根目录用 isolated 安装，pnpm 会往每个 `plugins/*/node_modules` 写文件；而 dev-profile workspace（绝对路径 glob 挂同样目录为成员）安装时也写同一批目录 → 两套布局交错（同目录混符号链接与真实目录）→ 模块解析损坏（tsdown 找不到 ansis）。hoisted 时代不炸是因为 hoisted 根安装不往 plugin 目录留东西（唯一写者是 profile）。
- **prod no-frozen 雷区**：prod 修剪下重新解析，宽松区间会解到远古版本（`dsh-client-runtime@0.0.1-rc.1`）并 404（其依赖 `dsh-compact` 从未发布）。bundle stage 必须保持 frozen。
- **profile 生成器 bug（已修未提交）**：allowBuilds 白名单缺 `@deepseek-ai/dsh-subprocess-local`，CI 模式下所有 profile 安装必挂；且 live profile 的 yaml 里曾被粘入 pnpm 交互提示原文。

## 7. 当前可行的路径与代价

| 路径 | 代价 |
|---|---|
| **isolated 一键安装**（已验证）：`pnpm install --frozen-lockfile --config.node-linker=isolated` | 根目录裸 `pnpm install` 仍是会炸的 hoisted（yaml 默认没改）；需 filter 跳过 plugins 链接避免双写（待验证）；build.ps1 的根 .bin tsdown 假设需调整 |
| **worktree 热树**（已验证）：sync worktree 里 hoisted 增量 + 出板子 | 双布局并存、三条纪律、worktree 是不在 git 里的资产 |
| **bundle 流程**（已验证）：stage 内 frozen prod hoisted 安装 + junction profile + 剪枝 → 110.7MB | 与根目录布局解耦，无额外代价；但 make-bundle 的 LINKS.json 活树 walk 期望 hoisted |
| **加内存到 32G**（未验证，**天花板未知**：存活集已测 >16G 仍在增长） | 硬件成本 + 不确定性；若峰值在 18~24G 则 32G 可行；零软件改动 |
| **报上游**（未做） | 需最小复现（合成 peer 重图 + hoisted，演示规划内存超线性）；#13133 证明 pnpm 团队会修有硬数据的内存 issue |

## 8. 当前仓库状态（2026-08-23）

- **main 领先 origin 10 个提交未 push**（需代理 socks5://127.0.0.1:10808）：含迁移合并 ×3、lockfile 重算（ccf4d365）、handoff 补记（cf3e0d0e）等。
- **未提交修复**：`scripts/dev.mjs`（tsdown `.pnpm` 回退 + profile 自动安装 + Windows spawn shell）、`profiles/marisa/generate-profile.mjs`（allowBuilds 补 subprocess-local）。`node --test scripts/dev.test.mjs` 7/7。
- **主仓库 node_modules**：isolated 布局，自洽（清双写后重装验证）。
- **`.claude/worktrees/sync-011-rc1`**：detached cf3e0d0e，**hoisted 热树（唯一）**，ego-browser 在位，出板专用。
- **板子**：`release/Marisa-DSH-0.1.8-migration-test-standalone.exe`（129.8MB，无 ego）、`release/Marisa-DSH-0.1.8-full-standalone.exe`（130.1MB，含 ego），embeddedbundle Go 测试实跑通过。
- **live profile** `~/.dsh/profiles/marisa`：已从主仓库重新生成（allowBuilds 已修），node_modules 已清除（曾被双写损坏）。

## 9. 想请外部解决的问题是

1. **pnpm 内部机制**：hoisted linker 的规划阶段（`@pnpm/...` 的 hoisting 计算）内存能否有界/流式化？有没有已知配置组合能"输出 hoisted 布局但不付全局规划内存"？
2. **peer 晶格**：peer 变体哈希嵌套导致小变更 → 全树重链，是设计使然还是可改进？（我们的漂移复现：同 manifest 重算两次 byte-identical，但与 24h 前的 lockfile 哈希全不同。）
3. **同类规模经验**：其他 ~300 importer、重 peer 图的 hoisted workspace（比如用 `pnpm.workspace` 大仓的人）怎么活的？有没有免 32G 内存的活法？
4. **32G 是否足够**：hoisted dev 全量的真实存活集峰值在哪？我们测到 >16G 且无收敛迹象（GC 回收率 mu=0.001）。若能在大内存机器上测出峰值，也是定位保留模式的关键数据点。
5. （可选）**报上游的最小复现设计**：欢迎直接给出。

## 10. 关键文件/日志索引

- 本仓库：`pnpm-workspace.yaml`、`build.ps1`、`scripts/build-release-windows.ps1`、`desktop/bundle/make-bundle.ps1`、`scripts/dev.mjs`、`docs/HANDOFF-board-0.1.8-build-20260823.md`（前一会话完整排障史）
- 崩溃日志：`%TEMP%/pnpm-clean-experiment.log`（10G）、`%TEMP%/pnpm-clean-exp12.log`（12G）、`%TEMP%/pnpm-1122-exp.log`（11.22.0）
- 成功对照：`%TEMP%/pnpm-isolated-exp.log`（34s）、`/tmp/pnpm-worktree-frozen*.log`（58s 增量）、`/tmp/make-bundle*.log`（prod stage）
- 上游：[pnpm#8441](https://github.com/pnpm/pnpm/issues/8441)（closed/completed）→ [PR #13133](https://github.com/pnpm/pnpm/pull/13133)（fix(resolver)，未覆盖我们的 linker 规划阶段）
