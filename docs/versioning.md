# 版本与发布通道

Marisa 使用独立 SemVer，例如 `v0.1.0`；DSH 版本单独记录，不把发行版直接命名为 rc6。

## 两个维护等级

| 等级 | Git 分支 | 用途 |
|---|---|---|
| Testing | `main` | 跟进最新**已经通过 Marisa 兼容测试**的 DSH rc；发布 GitHub Prerelease |
| Stable/LTS | `lts/rcN` | 从 Testing 人工晋升；只接受安全、严重启动问题和安装器修复 |

上游出现新 rc 时，机器人应立即提出同步候选，但 `main` 不会在验证前追随。一个 Marisa Release 只对应一个 DSH rc，不承诺同一二进制兼容多个 rc。

## LTS 规则

- 分支名使用 `lts/rc6`、`lts/rc7`。
- 不增加新插件或大功能。
- 创建分支时必须在 Release 和本文件记录计划停止维护日期。
- 停止维护后保留 tag 和源代码，不再承诺修复。

## Release 闸门

Release workflow 只能由有写权限的维护者手动运行。维护者必须先完成桌面验收、创建 `v*` tag，再在 Actions 中输入该 tag 并确认验收。普通 push、PR 和定时任务没有发布权限。
