<h1 align="center">dsh-allinone</h1>

<p align="center">
  <strong>dsh 整合包（聚合版）：27 个插件，一行安装</strong><br/>
  照 dsh-mega 的 bundle 组合流 —— 本地 `file:` 依赖 + 聚合 `cordis.patch.yml` 一次挂载全部精选。
</p>

---

## 这是什么

一个 **bundle 聚合整合包**（`dsh.bundle` + 聚合 patch + 本地 file: 依赖）：
一条 `dsh plugin add link:<聚合包>` 命令，把 27 个已 clone 的插件仓库（本地 `file:` 依赖）
递归装进 profile，并用聚合 patch 把真正需要组合挂载的 20 个插件一次 insert 进 bundle 栈。

依赖用 `file:../<仓库名>` 相对路径指向同目录下已 clone 的插件仓库（聚合包与插件平级），
不依赖 git 源 / npm 私有库即可本地安装。

## 聚合清单（27 个）

| 类型 | 数量 | 插件 |
|---|---|---|
| **需 patch insert（20）** | 见下节 | better-sidebar / track / git-identity / genui / workflow / modlens / ui-notify / suggested-replies / whale-girl / qwen-mm(禁用) / multimedia-webui-input / cc-tui / drag-and-drop / stickers / gal / diff-viewer / code-map / sonar / sidechain / llm-fallbacks |
| **纯 client（dsh.client，无需 patch）** | 6 | dsh-ui-progress / dsh-paste-input / dsh-input-history / dsh-web-review(@canglongcl) / dsh-artifact |
| **非 bundle（不可 npm file 依赖）** | 1 | dsh-win-port（无 package.json，Windows 移植脚本，单独处理） |

> 明细：`package.json` 锁定 26 个 file: 依赖（不含 dsh-win-port），
> `cordis.patch.yml` 汇总 20 个 insert 行；纯 client 插件走 `dsh.client` 自动发现，不需要组合行。

## 目录结构

```
dsh-allinone/
├── package.json        # name=@dsh-external/dsh-allinone, dsh.bundle.patch → ./cordis.patch.yml,
│                       # dependencies: 26 个 file:../<插件仓库> 本地依赖
├── cordis.patch.yml    # 聚合 patch：20 个 insert 行 + cc-tui 附加 config 覆盖
└── README.md           # 本文件
```

## 前置

- 已 clone 的 27 个插件仓库位于聚合包同级目录（`/root/research/repos/<插件>`）
- dsh 基线可用（源码版或 npm 版）
- 纯 client 插件需要对应 `@deepseek-ai/dsh-client-*` 官方注入包可解析（需 NPM_TOKEN）

## 安装

**方式一：聚合包 + 本地 file: 依赖（推荐）**

```sh
# 在插件仓库所在目录（/root/research/repos/）下
dsh plugin --profile web add link:/root/research/repos/dsh-allinone
# 或相对：cd /root/research/repos && dsh plugin --profile web add link:./dsh-allinone
```

`link:` 让 dsh 从本地目录解析聚合包及其 `file:../` 依赖，无需发布到 git/npm。

**方式二：若插件仓库有远端（照 dsh-mega git 源模式）**

```sh
dsh plugin --profile web add github:dsh-external/dsh-allinone#<ref>
# 但需先把 27 个插件也发布/推到可解析的 git 源（mega 用 github: 源 + 完整 40 位 hash）
```

> 说明：本整合包依赖锁定为本地 `file:`（聚合包与插件平级），因此 `link:` 方式最直接；
> 若改用远端 git 源，需像 dsh-mega 那样在 dependencies 里逐一把 `file:../<name>` 换成
> `github:<org>/<repo>#<hash>`（可参考 dsh-mega/package.json）。

安装后**重启 web**（或刷新已运行实例），设置页「插件」面板可见全部 27 个插件；
其中 qwen-mm 默认 disabled（opt-in，需 overlay 开启），其余按各自 config 默认运行。

## 维护（增删精选插件）

1. 新 clone 插件 → `package.json` dependencies 加 `file:../<name>`（key 用其 npm 包名）
2. 该插件若有 `cordis.patch.yml`（或 `bundle/cordis.patch.yml`）→ 把 insert 行汇总进聚合 patch
3. 若纯 client（`dsh.client` 声明）→ 只加依赖，不加组合行
4. 验证：隔离 home 跑 `dsh plugin --profile <tmp> add link:...` 全流程，重启后检查 bundles 层

## License

BSD-3-Clause。
