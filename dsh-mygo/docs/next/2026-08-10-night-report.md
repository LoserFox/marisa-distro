# 夜间报告：mygo 0.2.0 方向第一块落地（2026-08-10）

面向：@rosen。你睡的这一觉里完成了“兼容性检查 + 插件间依赖 + 声明式
entrypoints”v1 的实现、测试与同步；3080 服务全程未动。

## 结论

下版核心目标的第一块已经可以用了：插件在 package.json 写 `dsh.mygo` 段，
mygo 自动读取并做两件事——(1) 把静态声明作为 entrypoints 贡献聚合到
`ctx.entrypoints`（HMR 原子注册/撤回）；(2) 用 `requires`/`breaks` 做版本化
兼容性检查，冲突时给出“谁声明的、要求什么、装了什么”的人读报错链，并把
违规方拒绝/禁用，而不是拖垮后端。

## 做了什么

### 声明式 manifest（插件侧零代码）

```jsonc
{
  "dsh": {
    "mygo": {
      "entrypoints": {
        "skill:roots": ["./skills"],
        "command:menu": [{ "value": { "name": "settings", "order": 10 } }]
      },
      "compatibility": {
        "requires": { "dsh-base": ">=0.4.0" },
        "breaks":   { "dsh-rewind": "<2.0.0" }
      }
    }
  }
}
```

面板安装时读入并存进 `.mygo-install.json`，生成的桥接包把声明嵌进
`checkSupport` / `adoptRaw` / `updateRaw`；存量生态插件无需改代码。

### entrypoints 服务

- `ctx.entrypoints.define(key, adapt)` / `get(key)` / `keys()`；key 有属主，
  未定义 key 的贡献惰性保留、可检视；
- 顺序 = 插件激活顺序；按代 token 撤回，同插件替换后新贡献不会被旧代误删；
- 适配失败点名贡献插件，不静默。

### 兼容性检查

- 语义：**声明者即受害者**；双向检查（新插件也要满足已装插件对它的
  requires/breaks）；
- 检查点：安装 / 静态 adopt / 替换 / 卸载 / 启用重挂 / 启动恢复对账 /
  plan 预览 / checkSupport 守卫 / 面板安装预检；
- 新增错误码 `compatibility-conflict`；零依赖 semver 范围匹配器
  （`*` / 精确 / `> >= < <= ^ ~` / AND / `||` / `1.2.x` 部分号）。

## 测试与验证

- 新增 26 个用例（semver-range 8、entrypoints 10、compatibility 8），
  原 352 个用例无回归；29 个测试文件全部串行通过；
- mygo / mygo-api tsc + tsdown 构建通过；面板 tsc + client half 构建通过；
- 参考了本地 fabric-loader（`EntrypointStorage` / `ModDependency.Kind` /
  `ResultAnalyzer`）和浅拉的 fabric-api（`fabric.mod.json` 惯例，
  `/tmp/fabric-api-ref`，未进仓库）。

## 同步状态

- [OK] 0809 工作树（源码 + 测试 + 面板）
- [OK] dsh-mygo 仓库（14 个文件修改 + 7 个新增，未 commit）
- [OK] 0809-fresh（lib 已重建；面板构建在 fresh 有个环境问题，见下）
- [x] 3080 / staging-20260809T193011Z：**未碰**，进程 59465 仍在跑（staging
  源码 mtime 22:13，早于本次改动）

## 已知问题 / 未决项

- 手动验证中发现并修复：桥接行按字母序写导致依赖序倒挂，重启后 alpha
  （requires dsh-beta）被 checkSupport 误跳过。已修：`collectBridgeRows`
  按 `compatibility.requires` 拓扑排序（依赖先行，环/未知回退安装序），
  生成的桥接内加重试窗口（5×500ms，仅兼容性冲突时重试）；旧桥接在下次启动
  自动升级模板。重启两轮后验证：beta 先挂、alpha 随依赖挂上、聚合顺序
  [beta, alpha] 正确。
- fresh 的 `.pnpm/node_modules/@types/react` 聚合目录为空，面板构建会报
  TS2688；install.sh 里的 pnpm install 会把聚合目录补齐，之后构建正常；
  0809 工作树无此现象，install.sh 未改。
- host 包版本注入（`hostPackages` 引擎选项已留，面板未接）；
- `dump-config`-家族 CLI 检视、面板 UI 展示约束链/贡献、服务级依赖图级联
  提示、软级别——都留到下一步。

## 文档

- 设计文档：`docs/next/2026-08-10-mygo-manifest-v1.md`
- 开发备忘录与 handoff 已更新实现状态

## 手动端到端验证（2026-08-10，独立实例 :41780）

- 安装带 `dsh.mygo` 的插件：version/entrypoints/compatibility 全部透出；
- 两个插件贡献同一 key：聚合顺序 = 安装序（[beta, alpha]），原始插件经
  `ctx.entrypoints.get` 消费成功；
- 安装 requires 缺失 / breaks 命中的插件：预检拒绝并给出约束链；
- 卸载被 requires 引用的插件：拒绝并点名声明者；
- HMR 更新（1.0.0 → 1.1.0）：新贡献生效、旧贡献按 token 撤回、另一插件
  贡献不受影响；
- 重启恢复：依赖序桥接行 + 重试兜底，两个插件都挂载，聚合恢复正确。
