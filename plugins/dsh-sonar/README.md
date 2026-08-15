# dsh-sonar

dsh-sonar 是 View Infra 在 DSH/Cordis Runtime 中的集成项目。用户通过 `/view` 用自然语言描述项目应当怎样被看见、记住、协作或改进，LLM 自主选择 View 操作路径；Memory、Skill、Teamwork 和 Self-evolution 是这些数据流转形成的能力，而不是几套平行系统。

```text
/view 发布任务开始时直接提供发布约束，详细检查步骤需要时再展开。
```

当前仓库包含一个最小可运行插件：

- Host：构建带代际的 Active View；候选确认后立即切换到新代，并提供查询、来源控制、Prompt 和 `view` 模型工具；
- Command：原生 `/view <自然语言>` 命令将用户原话交给当前 Agent，由 LLM 查询、读取或提出候选；
- Client：通过一个原生 `◇ View` 会话页提供自然语言入口、当前 View、待确认变化、View 描述和能力配置；
- Provider：当前为明确标识的 `local-preview`，用于验证操作和 UI；mnemond 接入边界保持独立。

```bash
npm install
npm test
npm run build
dsh plugin --profile web add .
# 将 "dsh-sonar" 加入 web profile 的 dsh.profile.bundles
dsh web
```

产品使用方式见 [自然语言驱动的 View](./docs/product/natural-language-view.md)，架构边界与验证方式见 [docs](./docs/README.md)。

`workspace` 默认取 `DSH_WORKSPACE_ROOT` 或启动目录，也可以在 `sonar-view-host` Cordis 条目中显式配置：

```yaml
- id: sonar-view-host
  config:
    workspace: /absolute/path/to/project
    locale: zh-CN
    refreshIntervalMs: 500
    motion: full
    backgroundReviewEnabled: true
    backgroundReviewIntervalMs: 15000
```

`locale` 支持 `zh-CN` 与 `en-US`。以上 Cordis 配置是部署基线；安装插件后也可以在 DSH 的「设置 → 插件配置 → View 基础设施」中调整语言、刷新间隔、动画和后台整理。界面保存的用户覆盖位于 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`）：

```yaml
dsh-sonar:
  locale: en-US
  refreshIntervalMs: 500
  motion: reduced
  backgroundReviewEnabled: false
  backgroundReviewIntervalMs: 30000
```

这些覆盖由 Host 校验并实时生效，恢复部署配置会清空覆盖值。`workspace` 和 `storagePath` 仍只属于 Cordis 部署配置，避免界面在运行中切换项目或权威状态位置。看板不会另存一份浏览器偏好。
