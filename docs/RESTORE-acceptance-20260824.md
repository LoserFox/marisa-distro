# 2026-08-24 功能恢复验收清单

> 背景：双 subagent 审计（聊天记录 + 13 个 release 产物）确认「聊到且做了但当前缺失/未生效」共 12 项。
> 用户授权全部恢复（whale-girl 除外），已本地提交 4 个（未 push）。
> 本文档 = 恢复结果 + 真机验收步骤。构建侧生效以「下次从 main 构建 exe」为界。

## 一、已恢复并提交（4 commits，main 未 push）

| 提交 | 内容 | 仓库层验证 |
|---|---|---|
| d0eafaf2 | vendored dsh-whale-widget v0.2.3（从 %TEMP%\DSBW-review 恢复） | 9 文件 SHA-256 与源一致；node --check 过 |
| d0d428b5 | vendored dsh-session-isolate（自研隔离插件）+ cordis fork 适配 | 单测 8/8 过；dist node --check 全过 |
| 04262226 | vendored @dsh-external/change-ledger v0.1.0 + VENDOR.md | dist node --check 全过 |
| 98fefe64 | internal bundle 挂载语义修复 + 三插件接线 + lockfile | generate-profile.test.mjs 过；bundles=12 项 |

生成器修复后 profile bundles（下次构建自动产出）：

```
@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, marisa-bundle,
@r05en1cu/dsh-mygo ×4, dsh-better-sidebar,
@dsh-external/ego-browser, dsh-whale-widget,
dsh-session-isolate, @dsh-external/change-ledger   ← 12 项
```

## 二、12 项状态总表

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 1 | dsh-whale-widget | ✅ 已入库+挂载 | 运行时生效待真机（见下） |
| 2 | dsh-ego-browser | ✅ 挂载恢复（生成器修复） | 8/23 9:59 起断链根因已修；真机确认 ego_* |
| 3 | dsh-session-isolate | ✅ 已入库+挂载 | 挂载后冒烟待真机 |
| 4 | change-ledger 接入 | ✅ 已入库+挂载 | 数据目录沿用 ~/.dsh/change-ledger |
| 5 | whale-girl 桌宠 | ⏭️ 用户明确不需要 | 未动（patch 仍 REMOVED 注释） |
| 6 | dsh-auto-resume exports | ✅ 已确认 HEAD 修复 | 9a950799 恢复 "." 入口；仓库=部署树（SHA256 一致） |
| 7 | 通知原生 toast | ⚠️ 已提交未发布 | 3875f606/9c87527a 在 main；待重建 exe 验证壳侧桥 |
| 8 | 急救模式全家 | ⚠️ 已合入 main，真机验收未完成 | 见第三节 |
| 9 | MyGO 装插件链路 | ✅ 仓库已持有 junction 修复 | c765f03b 已入库；真实桌面安装未行使（见下） |
| 10 | dsh-sidechain 深色 | ⚠️ 已提交（42f7c57d），待实机验收 | 见第三节 |
| 11 | anchored-standard 预设 | ✅ 已在仓库 + 已进 live backend | harness/apps/cli/config/agent-presets 含 5 项 |
| 12 | update_guard + WAL 迁移 | ⚠️ 已合入 main，真机验收未完成 | 见第三节 |

## 三、待真机验收（GUI 空闲时，按序）

1. **重建 exe 前先确认**：`node profiles/marisa/generate-profile.mjs`（MARISA_PROFILE_DIR 指向构建 staging）产出 bundles=12 项；随后走 make-bundle 构建线（注意 NODE_OPTIONS 堆、pnpm 门禁）。
2. **ego-browser**：重启后侧边栏/工具列表出现 ego_* 工具；观察窗打开；`dsh --profile web --dump-config` 可见 ego-browser 行。若 boot 报错，检查 peers 解析（VENDOR.md 记录 rc.2 复评点）。
3. **whale-widget**：右下角小鲸鱼 + 对话气泡（余额走 DEEPSEEK_API_KEY，25s TTL 缓存）；点按音效；记账模式 .dshw-usage.json 归档。8-22 曾「重启验证 TIMEOUT」未确认生效，本次必须等到 UI 出现。
4. **session-isolate**：iso_start 建 worktree/分支 → 改文件 → turn 结束自动提交 iso 分支、主工作区 git status 无变化；iso_fork 子会话 cwd=worktree；iso_export 合并回主 checkout；iso_abort_merge 冲突可 abort；iso_cleanup 清理。
5. **change-ledger**：change_ledger_* 工具出现；turn 快照记录到 ~/.dsh/change-ledger（沿用旧账本）。
6. **toast**：通知设置里选原生 toast → 触发通知出现 Windows 原生 toast（壳侧 MARISA_TOAST_PORT 桥接）。
7. **急救模式**：--rescue 手动入口；minimal 降级（web 模板，无 marisa 插件，URL 打印）；急救页插件级禁用/启用（WAL 单事务语义）；页面挂恢复入口（healthErr 直接切急救页）；WAL 事务 begin/seal/verify（desktop CLI wal 子命令）。
8. **update_guard**：替换 backend 版本时弹框备份确认；MIGRATIONS.json 迁移路径。
9. **MyGO 桌面装插件**：桌面 GUI 里 mygo 面板装一个插件，验证 junction 链接（免 EPERM）。
10. **sidechain 深色**：深色主题下侧栏 token 映射正确（--ds-color-* → --dsw-alias-*）。

## 四、未触碰（其他 agent / 用户保留）

- desktop/main.go、rescue_health.go(+test)、make-bundle.ps1 未提交修改——非本次范围，保持原状
- profiles/marisa/verify-mygo-runtime.mjs 未提交修改——非本次范围
- docs/PLAN-msi-flat-backend-20260823.md——untracked 计划文档，未动
- pnpm-lock.yaml 本次已更新提交（恢复接线必需；此前用户保留的树内修改一并落入该提交）
