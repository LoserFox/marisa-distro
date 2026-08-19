# 包体压缩后续计划:264MB → 100MB

日期:2026-08-19。状态:第一轮修复已落地,待发版验证。

## 一、本轮已完成的修复

包体 `desktop/bundle/backend.tar.zst`: **558.8 MB → 264.4 MB**(解压后 1825 MB → 700 MB,文件数 90167 → 44081)。

根因:`make-bundle.ps1` 的 live-tree link walker 用 `Get-ChildItem -Recurse` 查找名为 `node_modules` 的目录,过滤条件只排除了 `harness\node_modules` 目录**本身**,但递归会深入其内部,命中 pnpm 虚拟 store 的 924 个槽位目录(`.pnpm\<pkg>@<ver>\node_modules`),把整个 live **dev 安装**(含全部 devDeps)拷入 stage,并记录了 2835 条指向 dev store 的链接(占链接总数一半)。staged 的 `pnpm install --prod` 本身是正确的(`devDependencies: skipped`),之前的"嵌套 lockfile"假设不成立。

`desktop/bundle/make-bundle.ps1` 三处改动(未提交):

1. walker 排除整棵 `harness\node_modules` 子树(不只是目录本身);
2. `Handle-NodeModulesDir` 跳过解析目标落在该 store 内的链接——否则它们会在去重中顶掉 staged 安装生成的正确 hoisted 链接(walker 条目优先于全量 staged 扫描);
3. 新增 `.pnpm` 虚拟 store dev-only 裁剪(防御层,本轮未触发);同时 `Copy-DerefTree` 支持多排除文件,harness body 不再带 `pnpm-lock.yaml`。

## 二、当前包体构成(tarstat 实测)

| 部分 | 解压体积 | 说明 |
|---|---|---|
| `node.exe`(根文件) | 98.9 MB | 必需 |
| `marisa-distro/node_modules` | 323.5 MB | hoisted 运行期依赖,已裁 532 MB |
| `marisa-distro/plugins` | 144.6 MB | 9 个 vendored 插件 |
| `marisa-distro/harness` | 69.2 MB | harness 源码 + 构建产物 |
| `marisa-distro/bundles` | 50.7 MB | marisa-bundle |
| 其他(dsh-mygo/profiles/.dsh) | ~12 MB | |

按扩展名看可挖的块:

| 类型 | 体积 | 文件数 | 初步判断 |
|---|---|---|---|
| `.png` | 129.4 MB | 275 | **待查归属**——插件资源还是 sharp/依赖的测试图?PNG 不可再压,只能删或改外链 |
| `.exe` | 127.5 MB | 8 | node.exe 98.4 MB 必需;**另外 7 个待查** |
| `.ts` | 69.1 MB | 14923 | 运行期只用 `lib/`,源码疑似可裁(需确认 sourcemap/动态加载不依赖 src) |
| `.pdb` | 27.2 MB | 5 | 调试符号,大概率可删 |
| `.md` | 25.0 MB | 3592 | node_modules 里的文档,可删(压缩后收益小) |
| `.tsbuildinfo` | 13.5 MB | 241 | 构建元数据,运行期死重,可删 |
| `.gif` / `.mp4` | 15.9 MB | 21 | 媒体资源,待查归属 |

## 三、通往 100MB 的候选手段(按预期收益排序)

1. **查清并处理 129MB PNG + 16MB 媒体** — 若是依赖包自带的测试/示例资源,直接加入裁剪名单;若是插件运行期资源,考虑构建期压缩(pngquant)或运行时按需下载。潜在收益:压缩后 100MB+。
2. **裁 harness `.ts` 源码 + `.tsbuildinfo` + `.pdb` + `.md`** — 运行期只跑 `lib/`。合计解压 ~135MB,文本类压缩率高,预计压缩后收益 20-40MB。需先验证没有任何运行期路径读 `src/`(重点:tsx 源启动只用于开发,包里 launcher 跑的是 `apps/cli/lib/bin.js`)。
3. **查清剩余 7 个 exe** — 逐个确认归属与用途,无关的进裁剪名单。
4. **node_modules 二次审计** — 用 `desktop/bundle/gen-external.mjs` 的思路反向跑:列出剩余 hoisted 包按体积排序,对照 marisa cordis 组合(`profiles/marisa/cordis.yml` + marisa-bundle 的 patch)逐个确认运行期可达性。注意 DSH 是动态 require 的插件框架,不能只靠静态依赖图,要以组合清单为准。
5. **node.exe 本体(98MB,最后手段)** — UPX/自编译裁剪版 Node 风险高、收益约 30-50MB,只有前四项不够时再考虑。

预估:第 1+2 项落地后约 **120-150MB**;加上第 3、4 项有望逼近 100MB。

## 四、验证流程(每轮必做)

```powershell
# 1. 重新构建(改 make-bundle.ps1 会使 runtime 缓存失效,全量 15-30 分钟)
pwsh -NoProfile -ExecutionPolicy Bypass -File desktop/bundle/make-bundle.ps1

# 2. 体积与内容核查
go -C desktop run ./bundle/tarstat desktop/bundle/backend.tar.zst

# 3. 装包/嵌入包测试
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...

# 4. 实机冒烟:安装后重点测插件加载、subagent、canvas/图片相关功能
```

## 五、风险与回退

- 本轮裁剪名单含 shiki/prettier/jsdom 等,若测试发现代码高亮或格式化异常,在 `make-bundle.ps1` 的 `$storeKillExact` 中删除对应行即可恢复(单行回退)。
- 任何新的裁剪项进名单前,先在 tarstat 输出里确认它确实在包里、且体积值得动手。
- 运行时缓存按 `lockHash + treeHash` 做 key;改脚本内容会改变 treeHash,不要指望缓存命中。
