# Changelog

## 0.2.0-rc.7（2026-08-15）— live rail：运行期装卸（r7 核心面）

- 双轨制：boot rail（`dsh.profile.bundles`）与 live rail（profile
  `cordis.patch.yml` 的 mygo 受管块）互斥，单轨规则全链路由
  reconcile 排除与 P5 对账保证；设计文档 docs/live-rail.md。
- 安装：面板装 bundle 在实例运行期即刻激活——pnpm 落盘后写受管
  insert 块（host watchUserPatches 事务性重放），离线组合预检 id
  撞车（host 组合函数不可达时降级 warn 不阻断），写后轮询验证激活，
  失败回滚；回执带 `activated: 'live' | 'pending-restart'`。
- 卸载：live rail 包先剥块验证 dispose 再 pnpm remove；boot rail 包
  且实例在跑先写 disable 块摘 fiber；CLI 与面板同口径（face 层先剥
  块后 pnpm remove）；文案按轨态区分「刷新页面后生效」/「重启后生效」。
- patch-io：profile patch 层统一写盘通道（进程内串行 + tmp+rename
  原子写 + 空回落 `[]`），row-config 三函数改走该通道。
- P5 对账：启动一次 + 运行期监听 manifest——官方 CLI 旁路 add 同包
  时当场剥 live 块（bundle 赢），消弭下次 boot 的同 id 双 insert
  致命撞车（boot 挂死无对账窗口，故为运行期防线）。
- 面板：插件行 rail 区分 live/bundle/bridge；安装结果展示激活态；
  live 包启用态正确显示（不再被恒计为 disabled）。
- EXT-4 挂账：client-hmr 浏览器半 graph 帧处理（页面免刷新看到 live
  安装的插件行），host 补丁提案 patches/client-hmr-graph-host.patch
  （不 apply，快照 47f9438）。
- e2e：临时实例五场景真机验证（装→激活→卸→dispose→pnpm remove、
  重启干净、CLI 旁路对账、撞车/不可解析回滚）；修复预检自撞假阳性
  （单轨切换先于离线组合）。

## 0.2.0-rc.6（2026-08-14）— 配置注入 webui 插件页 + 面板功能面定型 + bundle 卸载路由修正

### 配置注入（核心交付）

- mygo 面板 client half 新增聚合配置卡片（settings.plugin.item 槽）：
  枚举有 Config schema 的受管插件（bridge 轨面板安装物 + bundle 轨
  profile 成员，schema 经 fresh import 读 Config 导出；无 Config 的插件
  静默跳过），通用配置表单（ConfigFields 共享组件）零手写 UI 即入
  webui 插件设置页。
- node half 新增 API：`/api/mygo/config-cards`（卡片枚举）、
  `/api/mygo/config` GET/PUT（bridge 经 updateConfig + 桥接行回写生效；
  bundle 经 upsertRowConfig 写 profile patch 层、宿主 watcher 重载生效；
  行 id 取 bundle patch 首个 insert 行）。
- row-config 基础设施从 mygo-cli 收敛进 mygo 核心（src/row-config.ts：
  readRowConfig/writeRowConfig + upsertRowConfig 追加 id 定向覆盖行 +
  listPatchRowIds；cli re-export 兼容）。
- 槽契约以官方 slot-contract 同形状本地声明合并承载（面板暂不引入
  dsh-client-ui-settings-plugins 为 devDep：其 peer 闭包含未公开发布的
  内部包，pnpm 解析会撞 404；解析墙解除后改官方类型导入）。

### 配套配置导入导出（整 profile 粒度）

- `dsh.mygo-configs/v1` 单文件：导出 = profile patch 全部行的 config
  快照（/api/mygo/config-export）；导入 = 格式校验 + 受管集分面
  （patch 行 ∪ 卡片 ∪ bridge 集外的 id 拒绝并指认）后写回（bridge 经
  updateConfig、其余经 upsertRowConfig；/api/mygo/config-import）。
- pack 清单可选 configs[]（restore --with-config 应用）登记为后续项，
  本轮未做。

### 面板功能面定型

- 保留三区：bundle 插件安装（npm/git/hub/pack 引用式）、整合包导入
  导出、配套配置导入导出；版本获取/更新/自更新保留现状。
- 退役：外部应用管理（/api/mygo/apps* 路由、AppManifest/AppInstallRequest
  类型与全部外部应用安装/启动/停止/卸载函数、updateAppFromRemote、
  Panel.tsx 外部应用 UI 与「安装为外部应用」流程），listUpdates 不再
  枚举外部应用。

### bundle 卸载路由修正（追加，用户实机报错）

- 面板/治理面 uninstall 按轨道路由：bundle 轨成员走 profile 执行面
  （routeBundleUninstall → profileUninstall = pnpm remove + reconcile，
  与官方 dsh plugin remove 同路径，不再经引擎桥接轨或 dsh 子进程）；
  桥接轨维持引擎 uninstall 语义。
- 守卫：dsh-mygo-ext-panel 禁止经自身卸载（指引 dsh plugin remove）；
  dsh-mygo 核心需 force: true 确认（API/UI 各自体现，UI 卸载按钮
  隐藏面板自身、核心确认附带 force）；卸载前跑 plan 预览
  （dependent-exists 拒绝透传）。
- 面板测试扩展至 26 例（新增 config-cards 3 例 + uninstall-routing 4 例）。

## 0.2.0-rc.5（2026-08-14）— HMR 体验迭代（R1+R2）+ 评审修复

- **评审修复（本会话）**：
  - `updatePluginFromRemote` 两处 `importEntry(entry)` 改 `importEntry(entry,
    true)`（mygo-panel）：Node ESM 按 URL 缓存，同进程重复更新同一插件
    此前换入的是缓存旧模块（评审 Major #1）。
  - bundle-rail `writeBlock` 追加前摘除顶层 `[]` 占位文档（否则构成非法
    YAML 打挂下次 boot，实机事故）；`removeBlock` 后无内容行回落 `[]`。
    bundle-rail.spec 新增占位用例。
- **文档**：`mygo-pack.md` 整合包格式使用说明（仓库根），README 链接。

### R2 — 旧代释放有界化 + 插件更新树原子换入

- **`@r05en1cu/dsh-mygo`**：
  - 旧代释放等待有界化（`releaseGeneration`）：事件在飞时延迟 dispose
    依旧保住旧代直到在飞处理器结束，但等待有界 = `swapTimeoutMs`——
    常驻事件流（周期事件/长事务）永不排空时按 deadline 强制释放旧代并
    告警 `deferred-dispose-abandoned`（与 dispose-abandoned 同口径：
    诚实声明可能打断在飞处理器），杜绝 HMR 换代后旧代无限滞留。
    lifecycle.spec 新增常驻事件流用例（R2）。
- **`@r05en1cu/dsh-mygo-ext-panel`**：
  - 插件远程更新的**顺序原子性**（`updatePluginFromRemote`）：最易失败的
    依赖安装/构建前置到 INSTALL_DIR 下 `.staging-<id>-*` staging 目录
    （期间旧 live 代与旧磁盘树都保持原样）；HMR swap 居中（失败则旧代
    恢复、staging 清理、磁盘未动）；成功后才 `swapTreeIntoPlace` 原子
    换树（同文件系统 rename + 备份回滚），杜绝「live 已是新版、磁盘仍是
    旧版/半删」的不一致。纯函数面 workspace-packages.ts 新增
    `swapTreeIntoPlace` + 包级测试 3 例（成功替换 / 首装就位 / 失败回滚）。

### R1 — updateConfig 空操作短路 + drain 事件驱动 + 自更新整仓同步

- **`@r05en1cu/dsh-mygo`**：
  - `updateConfig` 空操作短路：patch 解析后与当前 live 代 resolvedConfig
    deep-equal 时直接返回——不 bump generation、不重跑 apply、不发
    `plugin/replaced`（与 adoptStatic 同代幂等守卫同口径）；非法 patch
    依旧 manifest-invalid。面板「配置保存」不再为无变更保存触发一次完整
    换代（HMR 体验）。
  - `swapPolicy: 'drain'` 静默等待事件驱动化：订阅受影响事件的 idle
    信号（任一事件空闲即复查合取）替代 5ms 忙轮询，deadline 兜底
    swap-timeout 语义不变；`next-idle` 保持有界轮询（isTurnBusy 无事件
    信号）。事件流排空瞬间即换代，长等待不再空转。
- **`@r05en1cu/dsh-mygo-ext-panel`**：
  - mygo 自更新以**整个仓库为最小更新单元**：弃用 install.sh 时代的固定
    三目录对（含已退役 vendor/dsh-mygo-panel 路径），改为克隆后枚举
    `packages/<group>/<name>` 全部 `@r05en1cu/*` 工作区包逐一同步进
    checkout 并按包构建形态逐包重建（面板 `tsc -p` + tsdown .mjs，
    标准包 `tsc -b` + tsdown .ts）。纯函数面
    `src/workspace-packages.ts`（枚举 + 构建形态推导）+ 包级测试 5 例。

## 0.2.0-rc.4（2026-08-14）— 受管块空内容 YAML 修复

- `@r05en1cu/dsh-mygo-ext-panel`：rows 为空且用户层仅注释时，
  `buildProfilePatchText` 漏落顶层 `[]`——只剩注释的文件被 YAML 解析为
  null，host 侧要求顶层数组，下一次 boot fail-loud（rc.3 回归事故）。
  修复并补事故用例（仅注释文件 + 无行 → 注释保留 + 落 `[]`）。

## 0.2.0-rc.3（2026-08-14）— 面板桥接同步升级路径安全加固

- **planState 双账去重（追加，实机报错修复）**：`@r05en1cu/dsh-mygo`
  作为 bundle 成员时成员 id 恰为管理器 id（dsh-mygo），与
  managerDeclaration 重叠；桥接记录与 bundle 成员同 id 同理——
  plan.ts assertUniqueIds 在 plan/enable/disable 时抛
  「plan input has duplicate plugin id」。planState 与
  compatibilitySet 改为按 id 去重：bundle 真相源覆盖 records 同 id
  记录，管理器 id 由自描述兜底（provides/版本以运行体为准）。
  bundle-rail.spec 新增 2 例（修复前复现同一报错，已对照验证）。

- **fail-soft（真实事故修复）**：老安装形态遗留的失效桥接（陈旧 scope
  包名错位 / profile 链接缺失）此前会被面板启动同步重建成 patch 行，
  指向不可解析包 → 整个 dsh boot fail-loud 挂掉。现在写桥接行前逐行
  校验可解析性（profile node_modules + profiles/node_modules 兜底链，
  package.json name 精确匹配防 scope 错位 + 入口存在性探测），不可
  解析的行跳过 + 一次性告警（指明目录与清理建议），绝不写出致死行。
- **受管块落点修复**：装配逻辑重写为纯函数（bridge-rows.ts）——只
  替换/插入自己的标记块、用户内容逐字节不动；空文件落 `[]` 合法
  YAML，不再出现把 `[]` 裹进块注释中间的形态；无行时整块摘除。
- **面板包级测试落地**（此前无）：tests/bridge-rows.spec.ts 9 例
  （失效跳过 / 落点保留用户内容 / 空文件合法 YAML / 幂等重跑 /
  陈旧 scope 错位 / 兜底链认可 / 端到端 boot 安全）。面板不装 vitest
  （dsh-client-* devDeps 的传递依赖 404 未公开发布，解析变动即撞墙），
  test 脚本走根级提升的 vitest 二进制，配置 plain object 直出。

## Unreleased · next 分支 P8（2026-08-14）— pack 引用式成员 + restore 自动注册

### mygo-pack 成员二态（兼容扩展，formatVersion 仍为 1）

- 清单新增可选 `references[]`（npm 引用式成员：`{pluginId, version,
  packageName, spec, integrity, tarball}`）；一一对应口径变为
  `plugins[] == files[] ∪ references[]`（不重叠）；规范载荷仅在
  references 非空时纳入——无 references 键的旧 pack 还原不变，旧还原端
  遇混合 pack 以一一对应校验干净拒绝（fail closed）。
- 打包：`buildPluginPack` / `mygo pack --ref <id>`（可多次）/
  `--ref=all`——引用成员不内嵌，打包时从 registry 元数据固化
  dist.integrity/tarball（可审计防漂移；缺 integrity 拒绝打包并指认）；
  混合 pack 两次打包字节一致。
- 还原：`installPluginPack` 落盘前统一在线拉取引用成员（fetchImpl 注入
  面），integrity 与清单固化值不符硬失败；离线/拉取失败点名缺失成员并
  整体拒绝零写盘；落盘与内嵌成员同路径同语义（统一 restorePlan），
  原子回滚语义不变；事实文件尾部记 `origin:
  pack-embedded|pack-reference`（不进事实哈希）。

### restore 自动注册（用户裁决形态）

- `mygo restore` 还原进 store 后默认自动注册进目标 profile（语义等价
  `dsh plugin add`：内嵌成员提取 vendored tarball 走 pnpm add、引用成员
  按钉死 spec 安装，dsh.bundle 对账进 bundles 层，无 bundle 声明仅进
  dependencies 并提示）；幂等，与手工 `dsh plugin add` 混装不撞行；
  `--no-register` 保持纯还原语义。

### 验证

- 新增用例：mygo +6（pack-reference：引用打包固化与确定性 / 固化失败
  指认 / 混合端到端含 origin 记账 / integrity 不符零写盘 / 离线点名
  fail-loud / 旧 v1 兼容）、mygo-cli +4（pack-register：args 解析 /
  注册对账断言 / 幂等 + 混装不撞行 / --no-register）。

## 0.2.0-rc.2（2026-08-14）— 面板 webServer 服务名适配

- `@r05en1cu/dsh-mygo-ext-panel`：inject/上下文从 0811 时代的 `httpServer`
  迁移到 rc6 宿主的 `webServer`（dsh-host-webserver 提供；register 路由形状
  兼容），修复面板在公开版宿主 pending（waiting for service: httpServer）
  导致整树启动失败。真实 web profile 冒烟：HTTP 200 + /api/mygo/plugins
  返回治理视图。

## 0.2.0-rc.1（2026-08-14）— 面板 bundle 声明修复

- `@r05en1cu/dsh-mygo-ext-panel` 补 `dsh.bundle.patch` 声明与同包
  `cordis.patch.yml`（insert `dsh-mygo-panel` 行）：0.2.0-rc.0 发布包缺该
  声明，`dsh plugin add` 按普通依赖安装不打层，面板在 webui 不可见。
  `files`/`exports` 白名单同步收录；移除冗余的 `dshClient` 旧键。
- 版本线：`VERSION` 单源 0.2.0-rc.0 → 0.2.0-rc.1，七包同步。

## Unreleased · next 分支 P7 追加（2026-08-14）— npm 公开版 rc6 兼容性核查

- registry 事实面：dsh@0.1.0-rc.6 携带 cordis ^4.0.1 / loader ^1.0.2 /
  include ^1.0.6 / app-boot ^0.1.0-rc.6 / home-paths ^0.1.0-rc.6 等；
  dsh-storage*/dsh-invariants/dsh-skill 等子包 latest 仍指 0.0.1-rc.1、
  next 指 0.1.0-rc.6（双 dist-tag 线）；dsh-type-meta 复核仍未公开发布。
- 干净环境实测（npm 装 rc6 + tarball 装 mygo/mygo-cli，临时 DSH_HOME）：
  web profile 启动 HTTP 200、--dump-config 见 mygo 两行、mygo-self.json
  写入、启动日志零报错；cordis 全线 4.0.1 单一版本；mygo 运行时 import
  的 dsh-storage-domain 经 profiles/node_modules 回退链落到宿主 0.1.0-rc.6
  拷贝且工作正常；dsh-home-paths rc.2 与 rc.6 lib 逐字节相同。
- 最小修复：mygo / mygo-api 的 dsh-* peerDependencies 从 `^0.0.1-rc.1`
  放宽为 `>=0.0.1-rc.1 <0.2.0`（声明面覆盖宿主 0.1.0-rc.x 线，实测相容）。
  schemastery 3.18.1-rc.1 精确钉版保留（P3 类型可移植性裁决；与宿主
  3.18.1 双实例共存实测无故障）。
- 已知限制不变：web profile 严格参数解析使 `dsh --profile web mygo ...`
  内层参数到不了 CLI（host 缝隙，P3 起登记，host 补丁提案候选）。

## Unreleased · next 分支 P7（2026-08-14）— 0812 机会面落地 + 遗留收口

### 机会面五项

- **pnpm 构建政策双门槛一键放行**（loader-profile）：runPnpm 输出捕获 +
  拦截检测（ERR_PNPM_IGNORED_BUILDS / strictDepBuilds /
  blockExoticSubdeps）→ `ensureProfilePnpmSettings` 一键写 profile
  pnpm-workspace.yaml 白名单（覆盖 pnpm 占位值，幂等）→ 重试 + rebuild
  实际执行构建脚本；回执 `allowedBuilds` 透出 CLI。e2e 用 strictDepBuilds
  + tarball postinstall 离线确定性拦截坐实（含脚本实际执行断言）。
- **`mygo config <id> [--set '<json>']`**：patch 层行 config 整行读取/
  浅合并写回（文本级行定位保留注释与行序 + js-yaml 子块解析），消除
  patch 不 deep-merge 的手工重述。
- **bundle 解析预检**（governance `checkBundleResolution`）：服务 init
  对 dependencies 内 bundle 行做 profile 目录解析预检，拼错/缺失响亮
  报错点名（不等宿主晚期失败）。
- **pack 离线分发链路用例**（pack-offline.spec）：导出 → 共享缓存 →
  hardlink 导入 → 离线还原 → 事实对账 → 二次导入缓存命中。
- **热重载状态保持**：评估结论「无需 host 缝」——cordis fiber.update
  的 internal/update 瀑布是插件层接缝；落地为 mygo 核心 helper
  `preserveStateAcrossUpdate`（模块级暂存槽 + 回滚回补），真实 cordis
  用例坐实；不产出 host patch。

### 遗留收口六项

- fine-epoch 定论：保持独立模块（模块头 TODO 改写为定论）。
- F1 语料切到 fabric/packages/cordis-fabric（根载包遗留 lib 废弃）。
- enableFabric 去重互斥：层内已有不受管 fabric 载体行时拒绝。
- blockExoticSubdeps 按需写入并入双门槛一键放行。
- InstanceRegistry 加 mkdir 自旋锁（2s 等待 / 30s 陈旧接管 / 超时
  fail-open），P4 last-writer-wins 限制收窄。
- mygo-rdb 归属定论：维持 ignore 裁决（不提交不打包），定位与收口
  条件登记于 DEV-GUIDE §16.2。

## Unreleased · next 分支 P6（2026-08-14）— fabric 安装层 extension 化 + host 补丁提案收编

### extension 登记表（mygo 核心）

- `src/extensions.ts`：`ExtensionRegistry`（登记 `{id, kind:'extension',
  source, blockMarker, packages}`；重复 id 拒绝，注销器幂等随 fiber
  清理）+ `extensionViews()` 纯函数——启用态从 profile patch 层受管块
  标记推导，版本取 profile dependencies 子集（pnpm/patch 文件为唯一
  真相源，表内不存状态）；`PluginManager` 接口新增
  `registerExtension()` / `extensions()`。

### mygo-fabric 治理壳（新包 @r05en1cu/dsh-mygo-ext-fabric）

- fabric 组合缝（cordis-fabric + cordis-fabric-dsh 两行）由 mygo 治理层
  接管：enableFabric = profile loader 执行面安装两包 + 写受管块（幂等
  标记块，P3 启停块同机制；profile 名硬校验 + assertInsideHome 闸）；
  disableFabric = 移除受管块（包保留 dependencies）。默认 git 子目录
  spec 白名单过渡（守则例外 #6 登记）；验证一律本地路径 spec。
- 包根为 mygo 受管插件形态（bundle 行，挂载即登记进治理面）。
- publish-mygo.mjs 发布面纳入（只改造不执行）。

### host 补丁提案（patches/fabric-host.patch）

- 从 fabric 仓 patch（17 文件，0812 baseline）收编，剔除两条组合缝
  （web-app 插行 + app-boot profile init 模板预声明——已由治理层
  接管），只留三条硬缝（profile-boot 挂钩 / clientBundle transform /
  api-catalog）+ 必需接线，共 15 文件。
- 基线重钉公开版 deepseek-harness-public @ 47f9438；逐文件漂移核对与
  `git apply --check` 干净通过实录见 patches/README.md（只 check 不
  apply；fabric 仓 patch 不动，差异已说明）。
- runtime 激活依赖 host 合入提案；P6 验收口径 = 受管块写入正确 +
  提案 apply --check 干净 + fabric 包自身测试在 fabric 仓内绿。

## Unreleased · next 分支 P5（2026-08-14）— loader 扩展体系 + dsh-hub 市场适配器

### LoaderAdapter 注册机制

- mygo 核心新增 `src/loader-adapters.ts`：`LoaderAdapterRegistry`（对齐
  BUILTIN_LOADERS 形态；register 重复 id 拒绝、注销器幂等、list 按 id
  字典序、resolve 逐适配器试解析），`BUILTIN_LOADER_ADAPTERS = ['profile']`；
  `PluginManager` 接口新增 `registerLoaderAdapter()`（返回注销器，受管
  插件 fiber 清理调用 = 启停走治理面）与 `loaderAdapters()` 发现面。

### 默认 loader：@r05en1cu/dsh-mygo-loader-profile（新包）

- P3 安装执行面从 mygo-cli 收敛进 `packages/loaders/mygo-loader-profile`：
  resolve 接受 npm 包名/git spec/tarball/本地目录四种 spec；install 只
  执行 pnpm intent（落 pnpm + dsh.bundle 对账）；扩展面
  uninstall/setEnabled；它是所有其他 loader 的最终执行面。
- mygo-cli 的 install/uninstall/enable/disable 改经 adapter 调用（CLI
  面行为不变，install-face 不回归）；cli src/install.ts re-export 执行
  面保持既有引用兼容；cli 在首个 mygo 命令时把 profile adapter 注册进
  治理面（被动语义要求非 mygo 首 token 零副作用）。

### hub loader：@r05en1cu/dsh-mygo-loader-hub（新包）

- registry 客户端：双 origin 故障转移 + 本地快照降级（显式 --snapshot
  或 vendored `assets/registry-v1.json` 兜底）；snapshotId 摘要校验
  （canonical JSON sha256，与 dsh-hub registry-core 同算法，已对真实
  快照核对一致）；signature 非 null 时强制 Ed25519 验签
  （HUB_BUILTIN_KEYS 内置常量为空 + 轮换窗口按 keyId 预留；keys 选项
  可注入）；`--insecure-no-verify` 仅本地快照生效。
- intent 翻译：profile-bundle → pnpm intent 交 profile 执行面；
  guided/* → 只展示并说明；repository-plugin 默认拒绝（安装轨 0812 已
  删除，待官方态度），dsh.bundle 启发式探针命中时实验性放行；本地
  快照额外允许 file:/绝对路径 spec（离线验证/内网镜像语义）。
- 可安装判定：listing blocked / release 缺失硬门；risk/listing/
  maintenance/relations/capabilities 进安装前建议式提示（兼容性报告
  消费维度）。collections 原子安装（任一项失败逆序回滚、整组丢弃）。
- hub adapter 以 mygo 受管插件形态注册（bundle 行；挂载即绑定
  vendored 快照注册进治理面，boot 期零网络 I/O）。
- CLI：`mygo hub search / info / install / collections`，--json 信封
  对齐现有命令风格。
- publish-mygo.mjs 发布面纳入两个 loader 包（只改造不执行）。

### 验证

- 新增用例：mygo +5（loader-adapters 注册表）、loader-profile 6
  （spec 分类 + 执行面端到端）、loader-hub 25（解析/摘要/验签/篡改/
  故障转移/404 降级/insecure 规则 + intent 翻译 + 判定 + collections
  回滚 + 本地快照端到端实装）、mygo-cli +9（hub-face 8 + 治理面注册 1）。
- clone 不提升 InstallIntent 语义的评估登记于 DEV-GUIDE §14.4。

## Unreleased · next 分支 P4（2026-08-13）— 多实例接管与 HOME 隔离

### 多实例（实例 = $DSH_HOME）

- 用户级实例登记处（mygo `src/instances.ts`）：`~/.dsh-mygo/instances.json`
  （`dsh.mygo-instances/v1`，用户级目录非实例 HOME），每实例仅存
  `{home, dshVersion, lastSeenAt}`，不存插件账；API
  `registerInstance/listInstances/unregisterInstance/isInstanceRegistered`，
  staging → rename 原子发布；服务 init 自动登记并刷新 lastSeenAt；
  `ctx.pluginManager.instances()` 只读面（`PluginManager` 接口同步）。
  测试/验证经 `MYGO_USER_DIR` 环境变量重定向用户级根目录。
- HOME 隔离红线：`assertInsideHome`（package/paths.ts，B10 assertInside
  同模式）——写操作前 assert 目标在目标 HOME 内，跨 HOME 写被拒绝；
  落闸点 = mygo-cli install.ts `ensureProfile`（profile 目录）与
  `clonePlugin`（B 侧还原根/tmpDir）、共享缓存寻址键格式校验。写路径
  审计结论与例外面（用户级登记处/共享缓存）登记于 DEV-GUIDE §13.2。
- 治理视图记录实例 dsh 版本（`GovernanceView.dshVersion`，跨版本不共享
  可写状态的事实记录面）。
- 跨实例只读共享缓存（mygo `src/pack-cache.ts`）：
  `~/.dsh-mygo/cache/packs/` 内容寻址（整 pack sha512 文件名），只存不可变
  mygo-pack；发布前复用 pack.ts 校验（清单自校验 + vendored 成员哈希），
  staging → rename 原子发布，第二次发布命中零写盘；导入 hardlink 优先
  copy 兜底。
- `buildPluginPack` 新增 `plugins` 过滤项（单插件导出，clone 用）。

### CLI 接管命令（mygo-cli）

- `mygo instances`（登记处列表 + 当前实例标注）、`mygo adopt --home
  <path>`（登记 + 首次对账，只读扫描对端，不写对端插件状态）、
  `mygo clone --from <homeA> --to <homeB> <plugin>`（A 侧 pack 导出 →
  共享缓存 → B 侧还原安装；两侧须已登记，from = to 拒绝）；三命令
  不依赖管理器挂载；args/index/render 全链路 + `--json` 信封。

### 面板收口（P3 遗留）

- mygo-panel 的 `process.env.DSH_PROFILE ?? 'web'` 模块级常量改为运行时
  推导（apply 时解析：DSH_PROFILE env → loader baseUrl 目录名，与 mygo
  service.ts 的 resolveProfileName 同源；未解析即访问 fail loud）。

### 验证

- 新增用例：mygo +11（instances 6 + pack-cache 5，含「跨 HOME 写被拒绝」）、
  mygo-cli +5（instances-face：args 解析 / adopt 对账零写入 / clone 全链路
  + 缓存二次命中 / 拒绝面 / invokeCli --json 信封）。
- 双 HOME e2e 实录：双临时 DSH_HOME 各经 P3 冒烟形态（pnpm pack tarball +
  profile pnpm-workspace.yaml overrides file:）装 mygo/mygo-cli，adopt /
  instances / clone 全链路 + 隔离与缓存命中复核（脚本与 transcript 留
  /tmp/mygo-p4-e2e，不进仓库）。

## Unreleased · next 分支 P3（2026-08-13）— 自包含 workspace + 安装执行面切原生

### 自包含 workspace 化

- 新建根 package.json（private）+ pnpm-workspace.yaml + 仓内
  tsconfig.base.json；`@deepseek-ai/*` 依赖全部改走公开 registry
  （cordis ^4.0.1 / cordis-plugin-loader ^1.0.2 / dsh-* 0.0.1-rc.1 线 /
  dsh-home-paths 0.1.0-rc.x，dsh-paths 更名迁移）；tsconfig 不再引用任何
  checkout 路径（守则例外 #5 收口）。
- 验证回路改为仓内 `pnpm -r run verify:self-contained && pnpm -r run
  typecheck && pnpm -r test && pnpm -r run build`，不再同步 checkout。
- 坑位记录：schemastery 需对齐 @deepseek-ai/schemastery@3.18.1-rc.1
  （dsh-* 行内精确钉版，类型可移植性）；js-yaml/@types/js-yaml 显式声明；
  exports 探针容错（无 main 的包不再假定 lib/index.js）；dsh-tool-cordis
  公开包不再导出 sandbox 助手，real-composition F2(b) 改用裸注册等价验证。

### bundle 化 + 安装执行面

- mygo / mygo-cli 携带 `dsh.bundle.patch` + 包内 cordis.patch.yml（insert
  行按包名引用）；`config.profile` 缺省时从 loader baseUrl 推导 profile 名
  （bundle patch 层无静态 profile 值）。
- 安装执行面：`mygo install/uninstall`（profile 目录 pnpm + dsh.bundle
  对账 dsh.profile.bundles，直接复用 @deepseek-ai/dsh-app-boot profile
  API）与 `mygo enable/disable`（profile cordis.patch.yml 的 id 定向
  disabled 块）。
- GovernanceView 落地（src/governance.ts）：启动时从 profile 实际安装状态
  （dependencies + dsh.profile.bundles + patch 层 disabled 行）重建治理
  视图；RegistryStore 降级为运行时缓存；`pluginManager.governanceView()`
  只读查询面。
- mygo-self.json 写入者补位：服务启动时从本包 package.json 事实写入
  （writeMygoSelfInstallation；install.sh 退役后的承接）。

### 面板迁入

- vendor/dsh-mygo-panel → packages/extensions/mygo-panel，包名
  `@r05en1cu/dsh-mygo-ext-panel`；适配 P1/P2 新 API（plan.actions /
  autoResolve 消费点全部移除，预检改纯求值预览）；桥接包命名
  `@dsh-external/*-mygo` → `@r05en1cu/*-mygo`；安装目录依赖链接改为从
  面板自身解析链推导（不再假设 checkout）；构建自包含（仓内 tsc +
  tsdown，clientBundle 预设最小面移植）。
- publish-mygo.mjs 改仓内构建，发布面纳入 CLI 与面板（只改造不执行）。

## Unreleased · next 分支 P2（2026-08-13）— 契约层重写 + scope 迁移

### 契约层（packages/core/mygo-api）

- types.ts 995 → 343 行：只留契约面（PluginDefinition / PluginHooks /
  PluginEnv / compatibility 只读声明 / 事件词汇 / 管理面句柄）；能力载荷
  形状拆到 env.ts；逐字段 JSDoc 收敛为分组单行注释。
- `definePlugin` 产出可直接 `ctx.plugin()` 消费：挂载面（name/inject/
  Config/apply→adopt）以非枚举属性承载，strict zod 只见 manifest 字段；
  `toCordisPlugin` 语义重复，删除。`fromCordisPlugin` 保留（零侵入桥接
  真实语义，模块头注明不可替代性）。
- 新增 LoaderAdapter 契约（loader.ts：InstallIntent 三态 pnpm/pack/
  display + InstallReceipt/InstallTarget/RegistryEntry），为 P5 loader
  扩展体系铺路。
- 错误闭表维持 P1 裁决 39 码不动。

### scope 迁移与版本线

- 三包改名 `@r05en1cu/dsh-mygo-api` / `@r05en1cu/dsh-mygo` /
  `@r05en1cu/dsh-mygo-cli`（原 `@deepseek-ai/dsh-mygo-api` /
  `@deepseek-ai/dsh-mygo` / `@dsh-external/dsh-mygo-cli`），全部 imports /
  内部依赖 / 脚本 / 配置同步；`author`/`maintainers` 声明 `r05En1cU`。
- 版本线：VERSION 单源 0.0.1-rc.1 → 0.2.0-rc.0，三包同步；init 模板
  生成物 author 默认值 `r05En1cU`。
- checkout 侧（test-r05En1cU-0811）：tsconfig.base.json 增加 @r05en1cu
  paths 映射；node_modules 增加 @r05en1cu 链接（root / 包级 / profile
  fallback）；profile cordis.patch.yml 受管块 dsh-mygo 行改名；vendor
  面板 package.json 依赖名同步 + prepare 暂跳（面板源码仍消费 P1 已删
  的 plan.actions，列为 P3 阻塞项）。

## Unreleased · next 分支 P1（2026-08-13）— 核心瘦身：求解/lockfile 体系退役

> 重做线第一阶段：pnpm 安装状态为唯一真相源，mygo 账本降级为治理视图
> （P3 落地）。旧体系存档见 main `43bb296`。

### 删除

- `dsh.lock/v1` lockfile 全族：`package/lockfile.ts`（readLockfile /
  writeLockfile / verifyLockfile / 形状校验链）及 package-manager / pack /
  service / 测试的全部引用；`paths.lockfileDir` / `lockfilePath` 同步移除。
- 跨插件约束求解残余：`src/activation.ts`（solveActivation：depends 闭包
  连带启用 + breaks 最小停用消解）；`plan.ts` 改为纯求值预览（兼容预检 +
  关系冲突 + requires 级 dependent-exists + displaced 推导），不再产出
  级联动作；`InstallOptions.autoResolve` / `ActivationPlan` /
  `ActivationAction` / `PluginOperationPlan.actions` 一并删除。
- 报告死码与字段：`dispose-timeout`（零生产者）、`lockfile-mismatch`、
  `dependency-cycle`（生产者随 lockfile/求解器删除）、`ResolutionReport.generation`
  （零调用方）；report 侧 `manifest-invalid` 改名 `bundle-invalid` 消歧。
- 加载期校验环节：`verifyAtBoot` / `readLock` / `mountOrder` / `loadEntry`
  （lockfile 依赖）；BOM 的 entry sha512/fileSize 对账字段（lockfile 供给）。
- install.sh、vendor/cordis-alias、vendor/PATCHES.md（安装形态 P3 重做，
  走 dsh 0812 原生 profile bundle / pnpm 机制）。

### 变更

- CD-1 错误词汇统一：`ResolutionReport.code` 直接取自 PluginError 闭表；
  报告侧有用码并入（组 7：`resolve-failed / bundle-invalid / symbol-missing /
  policy-rejected / pack-invalid / pack-hash-mismatch`）；PluginError 删除
  10 个零生产者死码（grant-missing / install-denied / ceiling-exceeded /
  source-not-allowed / provenance-rejected / fs-denied / network-denied /
  vars-denied / http-denied / emit-denied），闭表 43 → 39 码七组。
- `package-store.ts` → `package-restore.ts`：restorePackage 还原到调用方
  指定目录（普通落盘，无「store 唯一真相」语义），事实文件保留供幂等复用。
- `mygo-pack/v1` 保留 GNU tar 确定性打包；清单不再内嵌 lockfile，版本钉死
  在 plugins[]/files[]（id+version）；sha512+fileSize 成员级校验保留
  （pack 自身完整性）；安装无求解、原子可回滚。
- `fine-epoch.ts`：独立细 epoch 指纹函数删除（零生产消费者）；
  FineEpochRegistry/preGate/captureExports 保留（requires 政策闸消费，
  见模块 TODO）。
- 测试计数：全量 62 文件 / 623 用例（-4 文件 / -36 用例：lockfile×2 +
  resolver + activation 套件删除，pack/pins/paths/manifest/兼容性等套件
  按新语义改写）；EB 套件 13/13 不变。

## 0.2.1 · 2026-08-10 — 0810 分支适配 + 客户端兼容 + 测试类型债清理

### 0810 分支支持

- 支持 dsh `snapshots/20260810T155924Z-8ec407cd64`：storage-domain /
  storage-sqlite / cordis fiber / settings.register 接口兼容确认，hmr /
  include 只是写文件容错增强；构建、启动、安装、BOM、配置 HMR 在 0810
  实测通过；
- 清理 43 个测试类型错误（0.2.0 之后从未通过 checkout 全量 host tsc，
  0809 同样存在）：`requires/provides/permissions` 改 readonly、
  `resolveSource` 可选（缺省 fail-loud）、vocabulary 字段可选、
  `InMemoryRegistryStore.check` 补上、host-event 测试适配 0810 更严格的
  `ctx.emit` 泛型；
- **3080 已切换 0810**（`source/current` → 0810 检出），rdb 注册表/PG、
  bundle rail、BOM、面板全部在 0810 下验证。

### 客户端（浏览器 half）兼容

- 面板安装链路读 `dsh.client`（0810）并回退旧 `dshClient`（0809）；桥接包
  双写两个字段，存量桥接启动时自动补 `dsh.client`；
- 桥接 client gate 的 rawId 按 bundle 真实注册 id 提取（0810 为绝对路径，
  0809 为包名，回退包名）；
- 官方 bundle 安装自动注入顶层 `dshClient`（0809 roster 需要，0810 忽略，
  无害），带 `dsh.mygo.legacyClientInjected` 标记、卸载还原；
- 面板自身 client half 也补齐 `dsh.client`（否则 0810 设置页看不到
  “My 插件”）。

### 其他

- UI：设置页“受管插件”改名为 **“My 插件”**；
- 已知边界（实测确认，宿主设计）：运行时新增带 client half 的包（桥接或
  官方 bundle）需**重启**才进 roster；无 `dsh.client` 语义的旧插件暂不
  支持（0809 时代插件请作者升级，3080 已移除这类插件）。

## 0.2.0 · 2026-08-10 — 重构：HMR 语义、依赖体系、持久化、BOM

> 0.2.0 在 0.1.1 的基础上几乎重构了一切：HMR 从自建七步的 stage-first
> 改为对齐宿主 `fiber.update` 的 dispose-first（unload → load），取消了两轮
> 逐面特判补丁；把"权限核心删除后"的兼容性检查与插件间依赖从设计落成实现
> （Fabric 五级词汇、激活求解器、bundle 轨）；持久化后端无关化
> （mygo-rdb / store-provider / session 读取器）；安装器/面板大幅补全；
> 并新增 P4 BOM 依赖参考物。

### 核心：HMR 重写

- replace / adoptStatic 改为 **dispose-first**（先完整释放旧代，再应用新代），
  对齐 Cordis `fiber.update` 语义；settings namespace、webserver
  upgrade/fallback 这类全局 seat 注册不再需要 deferred 特判；
- 删除整套 deferred host-registration 机制（`StagedHostRegistration` /
  `registerHostRegistration` / `commitHostRegistrations` /
  `DEFERRED_HOST_REGISTRATION_METHODS`）；
- 失败回滚 `restoreIncumbent`（重新挂载旧代），配置预检前移，release 等待
  in-flight 事件结束后才放行；
- `adoptStatic` config-diff：同版本配置变化走热替换；面板配置保存写回桥接行，
  重启后配置不再回退；
- **行为变化**：replace 变成 unload → load；`immediate` 策略在存在 in-flight
  事件时会阻塞配置保存（无超时），`drain` 保持 30s 超时（超时在 unload 前，
  旧代安全）。

### 兼容性 / 插件依赖（0.2.0 方向 P1–P3）

- Fabric 五级依赖词汇 `depends / recommends / suggests / conflicts / breaks`
  + 传递闭包 + 约束链报告（P1 v2）；
- 激活求解器 `solveActivation`：required-by 连带启用、capability provider
  确定性选择、breaks 最小变更消解、plan 确认 UI（P2）；
- bundle 轨 `BundleRail`：profile manifest 原子读写、`dsh plugin` CLI 转发、
  companion 块、跨轨统一依赖图（P3）；
- 声明式 manifest v1：package.json `dsh.mygo` 段（entrypoints +
  compatibility）、`ctx.entrypoints` 聚合服务（按代撤回）、零依赖 semver
  匹配器（支持 `1.x` / `1.2.x` 通配）。

### 持久化

- **mygo-rdb** extension（基于 mygo 本体）：rdb（sqlite/postgres）注册表
  store + store-provider 组合行接管 + sqlite→rdb 自动迁移 + audit 迁入；
- session 读取器三层格式：jsonl（zstd 多帧）/ sqlite / rdb-postgres，
  字段投影 `extractFields`；
- 卸载自动接管（tombstone 落 rdb）、卸载 extension 自动回退内置 sqlite。

### 安装器 / 面板

- 官方 `.dsh-plugin` 仓库格式支持（入口定位 + 依赖安装 + 构建）；
- 配置模板与可读化校验（schemastery schema 描述 + 自动模板，解决
  "缺 config 死循环"）；
- 安装链路修复：`link:`/`workspace:` 剥离、pnpm 兜底、ESM 缓存绕过
  （`?mygo=<ts>`）、per-id 串行化；
- 卸载 tombstone 持久化、停用/卸载二次确认（卡片内展开）、host 副作用
  热撤销（WebUI 实时更新）；
- 配置助手：正经临时对话（continuable child session）、helper-only skill /
  工具面、排队 + 5min 超时自愈；
- 外部应用模式：独立 `mygo-apps` 根、进程组启停、`syncUninstall:false`、
  操作审计。

### facade 兼容面（生态实测驱动）

- 宿主事件桥：词汇外事件挂宿主 `on`/`once`、`prepend` 生效，随代撤销；
- HTTP 桥重写：`res.pipe`、`flushHeaders`、SSE 流式转发、req 异步迭代；
- 工具字段透传（`timeoutMs` / `isConcurrencySafe` / `finalizeContent`）、
  skills/commands 发布视图保留插件声明。

### P4 BOM（依赖参考物）

- `dsh.bom/v1` 导出：intent（版本区间）+ lock（精确版本/commit）双段，
  self/bridge/bundle/app 全轨，mygo 自身作为一等成员；
- 只读 `bom check`：missing / extra / drift / 约束违例链，零修改；
  `--target` 校验新插件声明是否落在生态带内；
- 极薄壳脚手架 `scripts/bom-scaffold.mjs`：离线生成新插件三文件骨架，
  `depends service:mygo-core` 自动取 BOM self 带；
- 版本事实动态化：`VERSION` 单源 + `mygo-self.json#version`，
  `MYGO_MANAGER_VERSION` 不再硬编码。

### 其他

- 远程更新/自更新（插件走 `updateRaw` HMR；mygo 自身 clone → 替换 → Loader
  热重载 → recover）；
- 显式不支持清单：旧工作区插件、依赖渲染器能力补丁的插件、apply 内
  `ctx.plugin` 组合子插件（dsh-rewind 等），给出明确错误而非拖崩后端；
- 开发备忘录与文档重写（旧受管权限 API 文档删除，README/memo/handoff 重写）。

### 升级注意（破坏性 / 行为变化）

- **HMR 语义**：replace 改为 unload → load；`immediate` 策略在 in-flight
  事件存在时会阻塞配置保存（无超时，建议升级前确认插件无长驻事件监听）；
- 每次重启后**第一次**配置保存会有一轮 Loader 重放收敛（旧版本遗留的
  `source:{type:'static'}` 注册表行被 quarantine，无害自愈）；
- mygo 版本事实来自 `mygo-self.json#version`：升级后需重跑 `install.sh`
  （或手动补 version 字段），否则依赖图/BOM 的 self 版本停留在回退值；
- 运行实例的 rdb 注册表依赖 PostgreSQL（mygo-pg / Docker Desktop），
  PG 不可用会 fail-loud（`registry backend self-check failed`）；
- 面板安装的静态插件配置现在写回桥接行；旧版本遗留的 static-source gens
  行会在恢复时 quarantine。

## 0.1.1 · 2026-08-09

- install.sh 修复：空 profile 占位覆盖、`set -e` 兜底、模块回退链接。

## 0.1.0 · 2026-08-09

- HMR 插件管理器：generation / swap / staging / dispatch，安装 / 启停 /
  卸载 / 替换 / 恢复；
- 外部应用模式、远程更新、首次安装脚本 install.sh。
