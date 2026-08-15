# 安装

**简体中文** | [English](./INSTALL.en.md)

> **版本选择**：`v0.9.1`（默认）面向 DSH 快照 snapshot0810（`snapshots/20260810T155924Z`），同时兼容 snapshot0811（`snapshots/20260811T152241Z`）与最终快照 snapshot0812（`snapshots/20260812T172954Z-final`）；`v0.9.0` 面向 snapshot0809（`snapshots/20260809T140917Z`）；`v0.8.0` 面向 snapshot0808（`snapshots/20260808T121140Z`）；`v0.6.0` 面向 snapshot0807（`snapshots/20260807T130646Z`）；`v0.1.0` 面向 snapshot0805（`snapshots/20260805T134133Z`），按旧方式安装。版本对应详见 [README.md](README.md#版本对应--version-compatibility)。

> **npm 发版**：`v0.9.1` 兼容 DSH npm 发版 `@deepseek-ai/dsh@0.0.1-rc.5`（dist-tag `next`，即最终快照 snapshot0812 的 npm 发版）与 `@deepseek-ai/dsh@0.0.1-rc.2`（snapshot0811 的 npm 发版），实测运行/类型/启动清单通过。0811 起 vendored cordis 更名为 `@deepseek-ai/cordis`——本插件已把类型导入与 peer 迁移至 `@deepseek-ai/cordis`（`^4.0.1-rc.1`，npm rc.5 基线上为 `4.0.1-rc.4`），纯 `npm install` 不再报 ERESOLVE。经 `dsh plugin`/pnpm 安装自动处理。

前置：**DSH 已构建快照**（`~/.dsh/source/current` 指向含 `lib/` 产物的快照——`cordis` 与各 `@deepseek-ai/dsh-client-*` 的 `link:` 开发依赖从该快照解析）+ `dsh web` 运行中。本插件是**纯浏览器 half 插件**（宿主 half 为空，v0.8.0 起不再自带 `report_progress` 工具与上报引导；浏览器 half：进度呈现），安装 = ① 包可被配置树解析 + ② 配置里加一行。

## snapshot0810（v0.9.1）——profile 安装方式

```sh
# 1. 克隆仓库，构建产物已入库，无需构建
git clone https://github.com/lhh010/dsh-ui-progress.git
cd dsh-ui-progress && pnpm install

# 2. 装进 web profile（等价于在 $DSH_HOME/profiles/web 下执行 pnpm add）
dsh plugin --profile web add link:/path/to/dsh-ui-progress
#   或固定 tag 的 git 依赖：
#   dsh plugin --profile web add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.9.1'
```

> snapshot0809 用户固定 `#v0.9.0`（0809 构建）；snapshot0808 用户固定 `#v0.8.0`（0808 构建，同样兼容 0809 宿主）；snapshot0807 用户固定 `#v0.6.0`（旧 slot 契约 `conversation.chat.toolview`，不适用于 0808/0809）。

> v0.8.0 起宿主 half 为空（不再注册 `report_progress` 工具与上报引导）：升级安装后**无需重启 `dsh web`**，浏览器 half 刷新页面即生效。0809 宿主在激活时校验 `dshClient` 包的构建产物（缺失抛 `ClientPackageCompositionError` 并拒绝启动）——升级快照或改源码后必须重新 `pnpm run build` 再启动。

配置行（`$DSH_HOME/profiles/web/cordis.patch.yml`，热重载，无需重启）：

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## snapshot0805（v0.1.0）——旧安装方式

### 路径一：克隆 + link 装进 harness（推荐）

```sh
# 1. 克隆仓库，构建产物已入库，无需构建
git clone https://github.com/lhh010/dsh-ui-progress.git
cd dsh-ui-progress && pnpm install

# 2. 让包装进 harness 依赖链（在 DSH 快照根目录，~/.dsh/source/current 指向的那个）
pnpm add -w link:/path/to/dsh-ui-progress
```

> 若你的 pnpm 因 store 版本不匹配拒绝 `pnpm add -w`，可手动 symlink 代替：
> `mkdir -p node_modules/@dsh-external && ln -s /path/to/dsh-ui-progress node_modules/@dsh-external/dsh-ui-progress`

### 路径二：git 依赖（固定 commit/tag，无隐式 latest）

```sh
# 在 harness 根目录执行；<commit> 为发布 commit（0805 用 tag v0.1.0）
pnpm add '@dsh-external/dsh-ui-progress@github:lhh010/dsh-ui-progress#v0.1.0'
```

### 配置行（0805 旧机制）

`~/.dsh/config.yaml`（不存在则创建）：

```yaml
- insert:
    - id: dsh-ui-progress
      name: '@dsh-external/dsh-ui-progress'
```

## 重启 `dsh web`

插件集合变更按「重启生效」纪律（0805 旧机制下适用；0806 profile 方式配置行热重载，无需重启）。v0.8.0 宿主 half 为空，浏览器 half 的更新只需刷新页面。停掉当前 web（Ctrl+C）后重新启动。

## 验证

会话运行中：输入框上方常驻进度条左侧加载圈旋转，运行中显示实时已耗时、**实时 token 生成速率**（自校准估算 + 1s 滑动窗口平滑，模型生成中显示，如 `12.3 tok/s`，每秒更新一次）与 ETA（模型上报时）。有 todos 列表的会话显示真实完成比例，无 todos 的会话填充固定 100%。手动停止会话或 API 出错中断后，进度条切换为**橘红色**"已中断"态；中断后再次发送并正常完成，进度条恢复绿色完成态。
