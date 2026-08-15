# git-identity

DSH **profile bundle**（0812+ 的官方插件系统）：让 DSH 内产生的所有 git 提交使用
环境自身的作者身份。优先读取 gh CLI 的登录账号（name 取 login，email 取 GitHub
noreply 地址 `<id>+<login>@users.noreply.github.com`），其次启动环境的
`GIT_AUTHOR_*`、`git config --global` 兜底。

## 为什么需要它

DSH 的 agent 会话通过 bash 工具执行 `git commit`。历史上一旦某个会话显式
`-c user.name="DSH Agent"` 或改掉了 git 配置，后续提交就会带着错误的作者。
本插件在加载时把解析到的身份写入 `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 四个环境变量，
DSH 的 subprocess 层会把 `process.env`（剔除凭据）传给每个 bash 子进程，而 git 的
环境变量优先级高于一切 git config——所以 DSH 内任何路径发起的提交都必然使用该身份。

同时幂等同步回 `git config --global`，让插件进程外的普通终端提交也保持一致
（仅当 global 配置缺失或被改错时写回）。

## 安装（0812 profile bundle 系统）

```sh
# 从本仓库 checkout 安装到 profile（web / headless 等），bundle 声明自动加入组合层
dsh plugin --profile web add /path/to/dsh-git-identity
dsh plugin --profile headless add /path/to/dsh-git-identity
# 验证
dsh --profile web --dump-config | grep git-identity
```

安装后需重启目标 profile 的 DSH 进程（组合层变更不参与 HMR 热更新）。

## 身份解析优先级

1. 插件配置 `{ name, email }`（显式钉死，最稳；未登录 gh 时可在此配置）
2. gh CLI 登录账号（`gh api user`）
3. 启动环境的 `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL`
4. `git config --global user.name` / `user.email` 兜底

全部解析不到时只告警、不注入，绝不凭空编造身份。

## 配置

```yaml
# 在 bundle 的 patch 里给行加 config（可选；不配置则按上述优先级自动解析）
- insert:
    - id: git-identity
      name: '@loserfox/git-identity'
      config:
        name: LoserFox
        email: 57448027+LoserFox@users.noreply.github.com
```

## 开发

编辑 `index.mjs` 后无需构建（纯 ESM，零依赖）。`package.json` 的
`dsh.bundle.patch` 声明本包是一个 profile bundle；`cordis.patch.yml` 是它贡献的
组合层。
