# Maintenance 说明

`maintenance/upstreams.json` 是 Marisa 仓库边界和上游跟踪的机器可读基线。`pnpm test:repository` 会用它校验 `plugins/`、profile manifest 和差异文档的一致性。

## Schema v1

```jsonc
{
  "schemaVersion": 1,
  "harness": {
    "mode": "mirror",                // harness 只跟踪上游；发行版差异放在根 workspace/profile
    "path": "harness",
    "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
    "baseline": "99f6f02fecdb7dff40c3fbc9470f5907c29f74ca", // 导入的上游 commit
    "baselineReviewed": "2026-08-18", // 最近一次基线复核日期
    "dshVersion": "0.1.0-rc.7",       // Marisa 当前锁定的 DSH rc
    "channel": "next",                // next = rc 预发布；main/testing = 开发；lts/rcN = stable/lts
    "diffDocument": "docs/upstream-diff.md"
  },
  "plugins": [
    {
      "id": "dsh-a2a",                 // 必须等于 plugins/<id> 目录名
      "source": "git",                 // git 或 npm；缺省 git
      "mode": "mirror",                // mirror 或 fork
      "repository": "https://github.com/dsh-external/dsh-a2a.git",
      "baseline": "<40 hex commit>"    // git 组件必填
    },
    {
      "id": "dsh-web-review",
      "source": "npm",
      "mode": "mirror",
      "repository": "https://github.com/CanglongCl/dsh-web-review.git",
      "version": "0.1.0"               // npm 快照必填；禁止填写 baseline
    }
  ]
}
```

## 规则

- `plugins/` 下每个目录必须且只能出现一次。
- `git` 组件要求完整 40 位 commit；`npm` 组件要求 `version`，仓库未知时 `repository` 可以为 `null`。
- `fork` 必须提供 `diffDocument` 且文件存在；`mirror` 不得带 `diffDocument`。harness 的上游 pin 使用 `mirror`，其 rc7 说明文档仅记录基线和同步验证，不代表 harness 内有本地源码 patch。
- vendored npm 快照的 `package.json` 中禁止 `prepare`、`prepublishOnly`、`preinstall`、`install`、`postinstall` 生命周期脚本：发布 tarball 自带构建产物，安装期构建没有完整源码。
- `profiles/marisa/plugins.json` 是 profile 生成器使用的目录/包名映射，与 `upstreams.json` 必须同集合、同 source。
- 插件是否进入默认组合由 profile/bundle patch 决定，不由 `upstreams.json` 的上游基线 metadata 决定。

## 常用命令

```powershell
pnpm test:repository    # 校验本文件、目录、差异文档、profile manifest
pnpm upstream:check     # 检查 Git 组件是否落后于上游 HEAD；npm 快照需人工检查
node scripts/sync-upstream.mjs <harness|plugin-id>   # 生成同步候选（mirror 自动替换）
```

新增插件时先按上面的 Schema 登记，再创建 `plugins/<id>/` 和必要的 `docs/plugins/<id>.md`；fork 插件还要在 PR 里写清本地差异和重放动作。
