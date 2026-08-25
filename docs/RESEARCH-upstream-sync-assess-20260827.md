# 上游同步评估报告

> 生成：`node scripts/upstream-sync-assess.mjs`。判断口径：git 组件比较登记 baseline 与上游 HEAD/最新稳定 tag；npm 快照比较登记 version 与 dist-tags.latest。

| 组件 | mode | 当前 pin | 上游最新 | 判定 | 建议动作 |
|---|---|---|---|---|---|
| harness | mirror | `b150a551b8d4` | `b150a551b8d4` | ✅ OK | HEAD（b150a551b8d4）即 baseline |
| mygo | fork | `e65eb56fe2d9` | `43bb29683680` | ⚠️ NO-STABLE→人工 | HEAD 漂移到 43bb29683680 但无稳定 tag（rc 生态常态）；人工评估后 pin |
| dsh_workflow | fork | `44b83c182aa0` | `44b83c182aa0 / tag refs/tags/v0.1.3` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.1.3（5e4c3667c081）：见 docs/plugins/dsh_workflow.md |
| dsh-a2a | mirror | `220de3a5cf8b` | `1618e5519681` | ⚠️ NO-STABLE→人工 | HEAD 漂移到 1618e5519681 但无稳定 tag（rc 生态常态）；人工评估后 pin |
| dsh-artifact | mirror | `cad2c4dacccf` | `cad2c4dacccf` | ✅ OK | HEAD（cad2c4dacccf）即 baseline |
| dsh-better-sidebar | fork | `npm 0.16.0` | `0.16.0` | ✅ OK | 已是最新 |
| dsh-code-map | mirror | `c90e37d02da5` | `c90e37d02da5 / tag refs/tags/v0.0.1` | ⬆️ UPDATE-稳定 | 同步到 tag refs/tags/v0.0.1（209b0064bfae）：scripts/sync-upstream.mjs dsh-code-map 自动树替换 |
| dsh-diff-viewer | fork | `d576c00cc7db` | `d576c00cc7db / tag refs/tags/v0.1.1` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.1.1（63eff60e3a1e）：见 docs/plugins/dsh-diff-viewer.md |
| dsh-drag-and-drop | mirror | `09088d689086` | `3b70ec46926a / tag refs/tags/v0.1.6` | ⬆️ UPDATE-稳定 | 同步到 tag refs/tags/v0.1.6（3b70ec46926a）：scripts/sync-upstream.mjs dsh-drag-and-drop 自动树替换 |
| dsh-genui | fork | `ae8006d890d5` | `ae8006d890d5 / tag refs/tags/v0.7.2` | ✅ OK | 基线即最新稳定 tag refs/tags/v0.7.2 |
| dsh-git-identity | fork | `39c608ca8e07` | `39c608ca8e07` | ✅ OK | HEAD（39c608ca8e07）即 baseline |
| dsh-input-history | fork | `eaf9aab70df9` | `2235ca96a410 / tag refs/tags/v0.1.1` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.1.1（c7ffe27dc1d9）：见 docs/plugins/dsh-input-history.md |
| dsh-llm-fallbacks | fork | `npm 0.3.2` | `0.3.4` | ⬆️ UPDATE-稳定 | 同步到 npm 0.3.4：重新 vendored 快照，复查 minimumReleaseAgeExclude 与 lifecycle 脚本 |
| dsh-multimedia-webui-input | mirror | `fecdc67a4789` | `fecdc67a4789` | ✅ OK | HEAD（fecdc67a4789）即 baseline |
| dsh-paste-input | mirror | `2fa32218af50` | `59223c5668b3 / tag refs/tags/v0.1.2` | ⬆️ UPDATE-稳定 | 同步到 tag refs/tags/v0.1.2（02cae25b2b12）：scripts/sync-upstream.mjs dsh-paste-input 自动树替换 |
| dsh-sidechain | fork | `9dc75fefc1f7` | `b7fcacf9d451 / tag refs/tags/v0.6.4` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.6.4（fb36f6a629ed）：见 docs/plugins/dsh-sidechain.md |
| dsh-sonar | mirror | `1de51055a30e` | `1de51055a30e` | ✅ OK | HEAD（1de51055a30e）即 baseline |
| dsh-stickers | fork | `1703f09915db` | `1703f09915db` | ✅ OK | HEAD（1703f09915db）即 baseline |
| dsh-suggested-replies | fork | `eb7e41b82ae8` | `eb7e41b82ae8 / tag refs/tags/v0.1.0` | ✅ OK | 基线即最新稳定 tag refs/tags/v0.1.0 |
| dsh-track | fork | `49991c6ee0be` | `fd000f69da4a / tag refs/tags/v0.6.0` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.6.0（fc3f1dfe95ce）：见 docs/plugins/dsh-track.md |
| dsh-ui-progress | fork | `e8ffef3bce21` | `31f6cb97f422 / tag refs/tags/v0.9.1` | ⬆️ UPDATE-稳定 | 重放 diff 到 refs/tags/v0.9.1（67fc66dccff9）：见 docs/plugins/dsh-ui-progress.md |
| dsh-update-check | fork | `67a766806e42` | `—` | ❌ FIRST-PARTY | 本地第一方插件（repository 即本仓库），不适用上游同步 |
| dsh-bash-terminal | fork | `npm 0.3.14` | `0.3.14` | ✅ OK | 已是最新 |
| modlens | fork | `npm 3.24.2` | `3.24.2` | ✅ OK | 已是最新 |
| dsh-web-review | mirror | `npm 0.3.0` | `0.3.0` | ✅ OK | 已是最新 |
| dsh-web-ui-approval-notify | fork | `865d2f6fc93f` | `865d2f6fc93f / tag refs/tags/v0.1.3` | ✅ OK | 基线即最新稳定 tag refs/tags/v0.1.3 |
| interpreters | mirror | `npm 0.2.3` | `0.2.3` | ✅ OK | 已是最新 |
| mnemon | mirror | `npm 0.2.13` | `1.3.0` | ⬆️ UPDATE-稳定 | 同步到 npm 1.3.0：重新 vendored 快照，复查 minimumReleaseAgeExclude 与 lifecycle 脚本 |
| ya-workspace-sidebar | fork | `npm 0.3.3` | `0.3.3` | ✅ OK | 已是最新 |
| yet-another-subagent | mirror | `npm 0.1.6` | `0.1.6` | ✅ OK | 已是最新 |
| dsh-auto-resume | fork | `2c515d6a3d78` | `—` | ❌ FIRST-PARTY | 本地第一方插件（repository 即本仓库），不适用上游同步 |
| dsh-ego-browser | internal | `—` | `—` | ⏸ INTERNAL | 自研组件（无上游） |
| dsh-whale-widget | internal | `—` | `—` | ⏸ INTERNAL | 自研组件（无上游） |
| dsh-session-isolate | internal | `—` | `—` | ⏸ INTERNAL | 自研组件（无上游） |
| dsh-change-ledger | mirror | `ae742c65689c` | `3f1b45796eea` | ⚠️ NO-STABLE→人工 | HEAD 漂移到 3f1b45796eea 但无稳定 tag（rc 生态常态）；人工评估后 pin |

共 35 组件：14 个建议同步，0 个查询失败。
