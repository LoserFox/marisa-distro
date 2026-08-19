# dsh-mygo Handoff（2026-08-09）

> 给下一位开发者的交接：现状、关键机制、已知坑、继续开发命令。

## 现状

- 目标 dsh：0809 快照（`test-r05En1cU`，本地工作树 `/home/rosen/workspace/dsh_dev/test-r05En1cU-0809`）。
- 运行实例：`dsh web --port 3080`，`DSH_HOME=/home/rosen/.dsh`，checkout = `~/.dsh/source/current` → `staging-20260809T193011Z`。
- 本仓库（dsh-mygo）在 commit 前：37 修改 + 23 删除（旧文档）+ 5 新增（memo、install.sh、2×tsdown.config、vendor/ 面板）。
- 测试：mygo + mygo-api 352/352（vitest；偶发 fork 超时是环境老毛病，非代码问题）。

## 关键机制（已实现）

- HMR + 插件生命周期：generation/swap/staging/dispatch、install/enable/disable/replace/uninstall/recover。
- 零侵入 raw 接入：`fromCordisPlugin` / `adoptRaw` / facade（类插件按 `new raw(ctx, config)`）。
- 停用/卸载语义：工具保持注册、dispatch 拦截；uninstall tombstone + `clearUninstallTombstone`。
- unknown-tool 零侵入：`tools/execute` waterfall。
- checkSupport + 守卫桥接：坏插件跳过挂载，不拖垮后端。
- 桥接行依赖序：collectBridgeRows 按 `compatibility.requires` 拓扑排序（依赖
  先行，环/未知回退安装序），桥接内对兼容性冲突重试 5×500ms；旧桥接启动时
  自动升级模板（MAX_SUPPORT_TRIES 标记）。
- 面板安装器：github/folder/archive；`installDeps`（剥 `link:`/`workspace:`，构建期注入 cordis/schemastery `file:` 依赖让 prepare 能过 tsc）；`setup` / `startCommand` / `skipBuild`。
- 外部应用模式：`mygo-apps` 独立根、进程组启停、sandbox none/workspace、`syncUninstall:false`、审计 JSONL。
- 远程更新：插件走 `updateRaw`（HMR）；外部应用停→换码→重启；mygo 自身自检/自更新（`~/.dsh/mygo-self.json` + Loader 热重载触发）。
- HTTP 桥：流式 pipe、二进制 body、路由 view 快照（卸载/替换安全）。
- 显式不支持：旧版工作区插件（0804/0805 + `workspace:`）、apply 内 `ctx.plugin` 组合（dsh-rewind）、渲染器能力补丁类（split-panes/working-activity）、缺 client half 的旧插件（gomoku UI）。

## 已知坑（踩过的）

- `vitest` 全量偶发 fork worker D 状态卡死（service.spec 被 timeout kill）：拆小串行跑。
- pnpm 包装脚本偶发 SIGILL：构建用 `node node_modules/typescript/bin/tsc`、`node node_modules/tsdown/dist/run.mjs` 直连。
- WSL 上 `next build`（dsh-club）偶发 SIGSEGV：跳过构建用 dev 模式，或重试。
- npm 不认 `link:`/`workspace:` 协议：面板已剥；prepare 期间缺 peer 类型：构建期注入 `file:` 依赖。
- 宿主服务高级成员（`httpServer.tapIndex` 等）facade 要透传：已知成员走受管，未知成员 `ctx.get(服务)` 转发（tapIndex 已做，其余服务未推广——见待办）。
- **2026-08-10 已修**：facade 通用透传推广（tools/systemPrompt/skills/commands/
  httpServer 全部 hostPassthrough；外层属性访问先 `env.get` 再 host 回退，
  raw `inject` 服务不再抛 "without inject"）；ext-compat 复测 9/9
  facade-service-gap 插件 real 挂载成功。已知边界：透传的宿主副作用
  （tapIndex/registerProvider/context 等）不受 mygo 生命周期管理，卸载/停用
  不撤销——与 disable WebUI 副作用同源。
- **2026-08-10 已修**：面板重装同 id 插件时 Node ESM 按 URL 缓存模块，adoptRaw
  会拿到旧代码；`importEntry` 对安装路径追加 `?mygo=<ts>` 查询串绕过缓存
  （`fileURLToPath` 与相对解析会剥离 query，`import.meta.url` 使用者不受影响）。
- **2026-08-10 已修（宿主副作用生命周期）**：facade 对注册类宿主方法
  （tapIndex/registerUpgrade/registerFallback/registerProvider/context）包装，
  返回值（disposer）经 `env.hostEffect` 登记并打标记；disable 执行这些
  host-effect disposers（宿主副作用热撤销，普通 effect 保留以维持“已停用”
  拦截语义），enable 检测到曾撤销则走 HMR replace 重挂重新 apply；卸载/替换
  照常先执行 host-effect 再执行普通 disposers。`adoptStatic` 对同 id 同版本
  已 enabled 的静态行幂等返回——install 写桥接行触发 Loader 热重载 + 面板
  adoptRaw 双 apply 的竞态不会再重复注册宿主副作用。
- **2026-08-10 已修（浏览器端 client 状态门卫）**：sfw/ads 这类 UI 插件的可见
  效果来自浏览器端 client 半部，node 侧 disable 只撤注入、client 仍按本地
  默认配置运行（sfw 的 `normalizeWireConfig` 缺失回退 `enabled: true`）。
  桥接生成时把原 client bundle 保留原注册 id 内联，追加状态门卫：materialize
  时同步查 `/api/mygo/plugins`，插件非 enabled 则不调用原 apply——强刷后
  WebUI 按 mygo 状态生效。生成时剥离 sourceMappingURL 注释避免门卫被吞。
  已有桥接在面板启动时自动升级（regenerateBridges 检测门卫标记）。
- **2026-08-10 通用修复（安装链路）**：config 校验失败消息改为可读 schema
  描述（“插件要求 …；收到 …；请在安装时填写 config”）；`withInstallableManifest`
  剥掉全部 `@deepseek-ai/*` 依赖（registry 404 → checkout 链接提供）；
  `adoptStatic` 加 per-id 锁串行化热重载/面板双 adopt；staging 期宿主服务冲突
  （`service "X" has been registered`）包装成 host-conflict 明确消息。
- **session-persistence-rdb 结论（显式不支持）**：插件 extends 宿主
  `SessionPersistence`（super 注册 sessionPersistence，与 web 组合 jsonl
  冲突），且构造先 `settings.register` 后 `super()`——失败后 namespace 永久
  残留，重装必报 already registered。属插件缺陷 + 宿主硬冲突；正确用法是
  作为替换组合行部署（去掉 jsonl persistence），不是 mygo 面板安装对象。
- disable 不撤销宿主侧 WebUI 副作用（tapIndex 改写等）：disable 只改状态不跑 effect disposer，sfw/ads 停用后页面不实时恢复；uninstall/replace 正常。修复思路见 development-memo 已知问题。
- `dsh` launcher 用 tsx + tsconfig paths，安装端插件入口用 src/index.ts 时靠 tsx 解析。
- 重启 3080 别用 `pgrep -f 'bin.ts web --port 3080'` 的 kill 链（容易误杀当前 shell）：直接记录 PID 或先查再杀。

## 待办（详见 docs/development-memo.md）

- **下版核心目标（0.2.0 方向，已定）**：插件兼容性检查（requires/breaks 版本化
  约束 + 可读报告）与插件间依赖（级联提示），配套声明式 entrypoints 贡献通道；
  参考笔记在 `docs/next/`（0806 权限层时代写的，机制需按 mygo 现状重写）。
  **2026-08-10 v1 已实现**：`dsh.mygo` 段 + `ctx.entrypoints` + requires/breaks
  检查（install/adopt/replace/uninstall/enable/恢复对账/plan/checkSupport/
  面板预检）+ `compatibility-conflict` + 零依赖 semver 匹配器；设计文档
  `docs/next/2026-08-10-mygo-manifest-v1.md`，测试 29 文件全绿。
- 未做（后续）：hostPackages 版本注入、CLI dump 检视、面板 UI 展示约束链、
  依赖图服务级级联提示、软级别。
- 三层通用修复：facade 透传通用化 / pnpm 构建兜底 / 安装策略路由。
- mygo 自更新“Loader 热重载后受管插件恢复”完整端到端验证（上次测试被手动卸载干扰，未验完）。
- 外部应用 sandbox `strict`、systemd/launchd 托管。
- 事件词表生成 hook 移植、README/i18n 补齐（旧文档已清，只留 README + memo + handoff）。

## 备份

- `/tmp/dsh-0809-to-dsh-backup.oy3nae`（0808 patch、genui、current 指向记录）
- `/tmp/dsh-0809-before-port.3gw0Xc`（0809 原始快照）
- `/tmp/dsh-mygo-steps/`（分步备份）

## 继续开发命令

```sh
# 常用变量
REPO=/home/rosen/workspace/dsh_dev/test-r05En1cU-0809
STAGE=/home/rosen/.dsh/source/staging-20260809T193011Z
MYGO=/home/rosen/workspace/dsh_dev/dsh-mygo

# 1) 改 mygo/mygo-api 后：类型检查 + 构建 + 测试
cd "$REPO"
node node_modules/typescript/bin/tsc -b packages/core/mygo-api packages/cordis/mygo --pretty false
node node_modules/tsdown/dist/run.mjs --config packages/core/mygo-api/tsdown.config.ts
node node_modules/tsdown/dist/run.mjs --config packages/cordis/mygo/tsdown.config.ts
node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/core/mygo-api/tests packages/cordis/mygo/tests

# 2) 改面板后：构建
cd "$REPO/vendor/dsh-mygo-panel"
DSH_CHECKOUT="$REPO" node build.mjs

# 3) 同步 staging（运行实例）
rsync -a --delete --exclude node_modules "$REPO/packages/core/mygo-api/" "$STAGE/packages/core/mygo-api/"
rsync -a --delete --exclude node_modules "$REPO/packages/cordis/mygo/" "$STAGE/packages/cordis/mygo/"
rsync -a --delete "$REPO/vendor/dsh-mygo-panel/" "$STAGE/vendor/dsh-mygo-panel/"

# 4) 重启 3080（先记录 PID，别用 pgrep 链自杀）
OLD=$(pgrep -f 'bin.ts web --port 3080' | grep -v zsh | head -1)
[ -n "$OLD" ] && kill "$OLD"
cd /home/rosen && setsid -f nohup env DSH_HOME=/home/rosen/.dsh dsh web --port 3080 > /tmp/dsh-0809-3080.log 2>&1

# 5) 同步独立仓库（本仓库）
rsync -a --delete --exclude node_modules --exclude lib --exclude tsconfig.tsbuildinfo \
  "$REPO/packages/cordis/mygo/" "$MYGO/packages/cordis/mygo/"
rsync -a --delete --exclude node_modules --exclude lib --exclude tsconfig.tsbuildinfo \
  "$REPO/packages/core/mygo-api/" "$MYGO/packages/core/mygo-api/"
tar -C "$REPO/vendor/dsh-mygo-panel" --exclude=node_modules --exclude=lib -cf - . \
  | tar -C "$MYGO/vendor/dsh-mygo-panel" -xf -

# 6) 首次安装 / 自更新测试
cd "$MYGO" && ./install.sh          # DSH_CHECKOUT=... 可指定
# 自更新端到端：改 ~/.dsh/mygo-self.json 的 commit 为假值 → 面板检查更新 → POST /api/mygo/updates/mygo
```
