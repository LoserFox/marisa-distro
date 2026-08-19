# mygo-pack 整合包格式使用说明（mygo-pack/v1）

> 适用版本：`@r05en1cu/dsh-mygo*` ≥ 0.2.0-rc.2（references 与自动注册自 rc.2 起）。

## 1. 这是什么

整合包把一组插件打成一个**确定性、可审计、可离线还原**的单文件
（`*.mygo-pack`，GNU tar）。两种成员形态可混合：

| 形态 | 内容 | 还原时 |
|---|---|---|
| `embedded`（内嵌，默认） | 包体完整内嵌 tar | 纯离线还原，零网络 |
| `reference`（npm 引用，rc.2 起） | 只记 `{spec, integrity, tarball}` | 在线拉取 + integrity 硬校验 |

## 2. 清单（manifest）

包内清单为 JSON，关键字段：

```jsonc
{
  "schema": "mygo-pack/v1",
  "plugins": [                       // 全量成员（id + 钉死版本）
    { "id": "dsh-advisor", "version": "0.1.0" }
  ],
  "files": [                         // embedded 成员：包体 tar 内路径 + 校验
    { "id": "dsh-advisor", "path": "packages/dsh-advisor-0.1.0.tgz",
      "sha512": "…", "fileSize": 12345 }
  ],
  "references": [                    // reference 成员（可选键；空则不落此键）
    { "pluginId": "dsh-cc-tui", "version": "0.3.5",
      "packageName": "dsh-cc-tui", "spec": "dsh-cc-tui@0.3.5",
      "integrity": "sha512-…",                     // 打包时从 registry dist.integrity 固化
      "tarball": "https://registry.npmjs.org/dsh-cc-tui/-/dsh-cc-tui-0.3.5.tgz" }
  ],
  "manifestSha256": "…"              // 清单自校验（references 非空时才纳入该键）
}
```

约束：`plugins[] == files[] ∪ references[]`（两集互不重叠，重复声明即
`pack-invalid`）；旧还原端遇混合 pack 干净拒绝（fail closed），无
`references` 键的旧 pack 新旧两端完全兼容。

## 3. 打包

```sh
mygo pack -o out.mygo-pack                    # 全量内嵌（默认）
mygo pack -o out.mygo-pack --ref dsh-cc-tui   # 指定成员改引用式（可多次）
mygo pack -o out.mygo-pack --ref=all          # 全部引用式（与 --ref <id> 互斥）
```

- 打包源 = mygo store（`$DSH_HOME/mygo/packages/`）；store 对无 `dsh.mygo`
  声明的普通社区包经 legacy manifest 推导开放（npm 源安装即可入 store）。
- 引用式打包从 registry 元数据固化 `dist.integrity` / `dist.tarball`；
  缺 integrity 的包拒绝打包并指认。
- **确定性**：GNU tar `--sort=name --mtime=@0`，同输入连打两次字节一致
  （sha256 可比对）；registry 用 `--registry` 或 `NPM_CONFIG_REGISTRY` 指定。

## 4. 还原

```sh
mygo restore out.mygo-pack                          # 还原 + 自动注册到当前 profile
mygo restore out.mygo-pack --profile headless       # 指定目标 profile
mygo restore out.mygo-pack --no-register            # 只落盘，不注册
```

行为：

- **embedded 成员**：离线原子还原（staging → rename），成员级 sha512 +
  fileSize 逐条校验。
- **reference 成员**：任何落盘前统一在线拉取 + 与清单固化 integrity 硬比对
  （不符零写盘）；纯离线环境遇引用成员点名缺失、整体拒绝。
- **原子性**：任一成员失败，整组回滚，不留半成品。
- **自动注册（rc.2 起，默认开）**：还原成功后把成员注册进目标 profile——
  内嵌成员经 vendored tarball 走 `dsh plugin add` 同代码路径（pnpm add +
  `dsh.bundle` 对账），引用成员按钉死 `name@version` 同路径；无 bundle
  声明的包只进 dependencies 并提示。幂等，与手工 `dsh plugin add` 混装
  不撞行（同包名单行单账）。
- 事实文件记录来源账：`origin: pack-embedded | pack-reference`（治理视图可读）。

## 5. 多实例搬运

```sh
mygo clone --from <homeA> --to <homeB> <plugin>
```

A 侧打包进跨实例只读共享缓存（`~/.dsh-mygo/cache/packs/`，内容寻址，
hardlink 优先），B 侧还原 + 注册；同一 pack 二次导入命中缓存零写盘。

## 6. 常见用法

```sh
# 离线交付：全部内嵌，目标机零网络还原
mygo pack -o deliver.mygo-pack && mygo restore deliver.mygo-pack

# 瘦身分发：大包体成员改引用式，pack 只有几十 KB
mygo pack -o slim.mygo-pack --ref=all

# 混合：自研插件内嵌（保证可还原），社区插件引用（跟 registry 事实）
mygo pack -o mix.mygo-pack --ref dsh-cc-tui
```

## 7. 限制与边界

- reference 成员拉取用裸全局 fetch，未接私有 registry 凭证（公开 registry 语义）。
- 打包对插件不做跨插件依赖求解——依赖完整性由 pnpm 安装期与兼容性
  预检提示负责（建议式）。
- 自动注册写 profile 需要目标 HOME 可写；跨 HOME 写被硬闸拒绝
  （`assertInsideHome`）。
