# Agent Note: P4 BOM 提案（依赖参考物 + 只读校验 + 极薄壳脚手架）

状态：已实现（2026-08-10，见文末"实现记录"）。参考实现：本地 `fabric-loader`（依赖
Kind 矩阵 / 版本区间语法 / ResultAnalyzer）与 `fabricmc-fabric`（聚合 POM +
java-platform BOM + version catalog 的"聚合器即 BOM"模式）；只借鉴语义，
不移植 SAT 求解与构建期发布。

## 0. 定档决策

- **BOM = 生态依赖参考物**：把统一依赖图序列化成版本化清单，给开发者在已有
  插件体系上搭新插件时查依赖、抄声明、验区间。
- **Plan B**：`bom export` + 只读 `bom check` 做掉；生命周期（install /
  upgrade / remove / apply / reconcile）明确不做，只保证格式向前兼容。
- **脚手架保留，极薄壳**：`mygo bom scaffold <id>` 独立脚本，无交互。

## 1. 定义

BOM 是当前 mygo 生态依赖图的**快照 + 锁定**，回答三个问题：生态里有什么
（成员、rail、provides、entrypoints）；新插件应该依赖谁、用什么版本区间
（兼容带）；谁和谁不能共存（breaks/conflicts）。它不是运行配置，不是市场，
不是套件安装器。

双层结构（学 Fabric）：

- `intent`：成员声明段——id、rail、版本区间、provides、entrypoints、各自的
  compatibility（depends/requires/breaks/conflicts/recommends/suggests），
  等价于把每个成员的 `dsh.mygo` 声明汇总；
- `lock`：解析锁定段——每个成员的精确版本 + commit/来源，等价于聚合 POM 的
  精确 pin。`bom check` 与 lock 对账，不与 intent 对账。

## 2. 成员模型

- `self`：mygo 自身，一等成员。统一依赖图已有隐式节点
  （`dsh-mygo` + `provides: [service:mygo-core]`，enabled），extension 的
  `depends service:mygo-core` 直接对这份成员求解；
- `bridge`：面板安装的托管插件（record.source 带 github url/ref）；
- `bundle`：profile 组合行成员（bundle rail）；
- `app`：外部应用（保留 `syncUninstall:false` 语义，只声明属于套件）；
- `hostPackages`：非托管宿主包版本，BOM 只记录不校验、不注入（注入仍是独立
  待办）。

## 3. 格式（dsh.bom/v1，JSON）

```jsonc
{
  "format": "dsh.bom/v1",
  "generated": {
    "by": "dsh-mygo",
    "version": "0.1.1",          // 导出时 mygo 版本（动态来源，见 §8）
    "commit": "60e57eb…",        // mygo-self.json 的 commit
    "profile": "web",
    "at": "2026-08-10T21:00:00Z"
  },
  "intent": {
    "members": [
      {
        "id": "dsh-mygo",
        "rail": "self",
        "version": ">=0.1.0 <0.2.0",
        "provides": ["service:mygo-core"]
      },
      {
        "id": "dsh-better-sidebar",
        "rail": "bridge",
        "version": ">=0.3.0 <0.4.0",
        "provides": [],
        "entrypoints": [],
        "compatibility": { "depends": { "service:mygo-core": ">=0.1.0" } }
      }
    ],
    "suite": { "breaks": { "dsh-rewind": "<2.0.0" } }
  },
  "lock": {
    "members": [
      { "id": "dsh-mygo", "rail": "self", "version": "0.1.1", "commit": "60e57eb…" },
      {
        "id": "dsh-better-sidebar", "rail": "bridge", "version": "0.3.0",
        "source": { "type": "github", "url": "https://github.com/dsh-external/DSH-better-sidebar.git", "ref": "…" }
      }
    ],
    "hostPackages": { "@deepseek-ai/dsh-…": "0.0.1" }
  }
}
```

同时生成人类可读 `dsh.bom.md`：成员表（id / rail / 版本 / provides / 约束）+
依赖边清单 + 冲突清单，同一数据渲染。

## 4. 导出（bom export）

- 数据源：运行时统一依赖图——`compatibilitySet()`（含 managerMember）、
  bundle rail members、record.source、mygo-self.json、hostPackages；
- 运行位置：面板 API（`POST /api/mygo/bom/export`），必须跑在 manager 内，
  图才是权威；profile 级产物
  `$DSH_HOME/mygo-boms/<profile>/dsh.bom.json` + `.md`，原子写 + 快照；
- intent 版本区间：从成员当前精确版本推导兼容带（`>=当前 <下一minor`，
  `0.0.x` 用 `>=当前 <下一minor` 规则一致化）；
- lock：精确版本 + github commit/ref；bundle/app 记录各自来源；
- 每次导出覆盖旧文件（保留上一次快照）。

## 5. 只读校验（bom check）

主模式（无参数）：读 `dsh.bom.json` 的 lock，与当前 profile 集合对账，输出
报告（零修改、不加锁）：

- missing：BOM lock 有、当前没装；
- extra：当前装了、BOM 没有；
- drift：同 id 版本/commit 与 lock 不一致（含 mygo 自身）；
- violation：成员约束链违例，复用 P1 的"声明者 + 约束文本 + 已装版本"链
  报告与 `compatibility-conflict` 语义；
- 退出码/响应：`{ ok, clean, report[] }`，clean 时无 report。

`--target <dir>` 模式：校验一个新插件目录的 package.json（`dsh.mygo` 段 +
版本）是否落在 BOM 生态带内——区间是否可满足、breaks/conflicts 是否命中、
`depends service:mygo-core` 是否在当前带。这是脚手架改过依赖后的兜底。

## 6. 脚手架（mygo bom scaffold <id>）

独立 Node 脚本（随 mygo 分发，不依赖 dsh web 运行）：

输入：`<id>`（kebab-case 校验）、`--bom <path>`（默认 `./dsh.bom.json`）、
`--out <dir>`（默认 `./<id>`）；无交互、无其他选项；目标目录已存在则拒绝。

输出三文件：

```text
<id>/
  package.json    # name/version/dsh.mygo 骨架，depends 从 BOM 自动填
  src/index.ts    # 零侵入 raw Cordis 插件骨架（name/inject/Config/apply）
  README.md       # 一句说明 + bom check --target 验证命令
```

package.json 骨架：

```jsonc
{
  "name": "dsh-something",
  "version": "0.1.0",
  "dsh": { "mygo": {
    "entrypoints": {},
    "compatibility": { "depends": { "service:mygo-core": ">=0.1.0 <0.2.0" } }
  } }
}
```

`depends service:mygo-core` 的区间 = BOM lock 中 self 成员的当前版本带；
src/index.ts 的 `inject: []` 起步，注释说明如何从 BOM 挑宿主服务。明确不做：
不跑 npm/pnpm、不 git init、不发布、不装进 profile、不生成 config schema。

## 7. 与现有机制的关系

- 数据源复用：`compatibilitySet()` / `installedVersions()` / bundle rail /
  record.source / mygo-self.json，无新图；
- 校验复用：semver-range（已支持 `1.x` / `1.2.x` 通配）、P1 违例评估与链
  报告、`compatibility-conflict` 语义；
- P2 求解器不接入：生命周期不做，Plan B 只是"对照"，不需要动作求解；
- 格式预留：intent/lock/suite 字段按未来生命周期可消费的方式设计，P5 加
  install/upgrade 时不需要改格式。

## 8. 前置项（T0）

- **mygo 版本事实动态化**：`MYGO_MANAGER_VERSION` 目前硬编码 `'0.1.0'`
  （lifecycle.ts:46），与包版本 0.1.1 已不一致；改为导出时从
  package.json version + mygo-self.json commit 解析，graph 与 BOM 用同一
  事实源，否则 extension 的 `>=0.1.1` 约束和 BOM self 行都是假的；
- 导出对图做一致性快照：export 期间不持有锁（只读），接受"导出瞬间的图"。

## 9. 验收

- export：产物 JSON 合法、MD 可读；成员覆盖 self/bridge/bundle/app 全轨；
  lock 版本/commit 精确；hostPackages 有记录；
- check 主模式：干净状态 clean=true 无报告；分别构造 missing（卸一个）、
  extra（多装一个）、drift（手工改版本）、violation（breaks 命中）四类都能
  检出且报告格式含链；
- check --target：合法区间通过、出带区间失败、breaks/conflicts 命中失败；
- scaffold：离线可用；三文件齐全；depends 区间 == BOM self 带；非法 id 拒绝；
  已存在目录拒绝且不覆盖；
- 全量既有测试无回归（Plan B 只读，不动生命周期代码）。

## 10. 文件改动清单（预估）

- `packages/cordis/mygo/src/bom.ts`（新）：类型、export 构建、check 对账、
  报告渲染、MD 渲染；
- `packages/cordis/mygo/src/service.ts`：`bomExport()` / `bomCheck()` 方法；
- `vendor/dsh-mygo-panel/src/index.ts`：`/api/mygo/bom/export`、
  `/api/mygo/bom/check` 路由；
- `scripts/bom-scaffold.mjs`（新，独立脚本）+ 测试；
- `packages/cordis/mygo/src/lifecycle.ts`：T0 版本事实动态化；
- `packages/cordis/mygo/tests/bom.spec.ts`（新）。

## 11. 不做 / 后续

- 生命周期（install/upgrade/remove/apply/reconcile）→ P5；
- 市场/发现（已移出 P4）；
- hostPackages 版本注入（独立待办）；
- 外部发布（maven/Gradle catalog 式）→ 后续；
- 多 BOM 切换 UI（数据结构留多套件接口，本期单 active）。

## 12. 实现记录（2026-08-10）

- T0 完成：`VERSION` 文件（0.1.1）+ install.sh 写入 `mygo-self.json#version`；
  `src/self.ts` 动态解析版本（self.json#version → 回退 0.1.0），
  `MYGO_MANAGER_VERSION` 不再硬编码，统一依赖图与 BOM 共用同一事实源；
- `src/bom.ts`：`buildBom`（self/bridge/bundle/app 全轨 + intent/lock 双段 +
  `^` 兼容带）、`checkBom`（missing/extra/drift/约束违例链，只读）、
  `checkTarget`（新插件 vs BOM）、`loadBomTarget`（package.json 读取）、
  `renderBomMarkdown`；
- service：`bomExport()`（原子写 `$DSH_HOME/mygo-boms/<profile>/dsh.bom.{json,md}`）、
  `bomCheck({target?})`；面板 `POST /api/mygo/bom/export` 与
  `POST /api/mygo/bom/check`；
- `scripts/bom-scaffold.mjs`：极薄壳脚手架（离线、无交互，产出三文件，
  depends 取 BOM self 带）；
- 测试：`tests/bom.spec.ts` 9 例（导出/对账四态/target 校验/loader/渲染）；
  mygo-api 39 + mygo 426 全绿；tsc + tsdown + panel build 通过；已同步
  0809 / -fresh / staging（3080 重启后可用）。

### 现场复验修正（3080，版本 0.2.0）

- `bomCheck` 的当前集合补齐 **bundle 成员 + self 成员**（此前只传 bridge
  记录，导致 lock 里的 bundle/self 全报 missing）；
- `checkBom` 的回退 self 同时进 `enabled` 与 `installed`（此前只进 enabled，
  `service:mygo-core` 能力在 installed 里找不到 provider，extension 的
  depends 全部误报"未安装"）；
- 3080 实测：`POST /api/mygo/bom/export` → 8 成员、self 0.2.0 + commit；
  `POST /api/mygo/bom/check` → clean:true；脚手架读取真实 BOM →
  `depends service:mygo-core ^0.2.0` → `bom/check {target}` clean:true。
- 版本事实：`VERSION` 与 `~/.dsh/mygo-self.json#version` 已更新为 0.2.0。
