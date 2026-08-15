# Agent Note: Guarded-mutation errors append the recovery instruction at the model boundary

Status: implemented

[English](2026-08-03-fs-tool-error-remedy.md) | 中文

## Problem

受防护的 `write` 与 `edit` 失败以只陈述条件、不给出唯一正确恢复方式的消息到达模型：`FS_STALE_VERSION`（"file changed since it was read"）与 `FS_NOT_OBSERVED`（"edit requires reading … first"）。模型必须自行猜测恢复方式是重新读取（或首次读取）后重试，而基于结构化错误码路由的重试/权限/UI 层看到的也是同一段消息文本。提供方拥有的消息属于存储接缝的面向机器词汇（[filesystem capability seam](../architecture/2026-06-17-filesystem-capability-seam.md)），因此恢复指令不能放在那里，否则会把面向模型的措辞泄漏给 `FsError` 的每个消费者。

## Decision

`dsh-tool-fs` 拥有一个面向模型的错误包装 `remediateFsError`（位于 `src/error.ts`），在 `write.ts` 与 `edit.ts` 中于沙箱拒绝映射之后应用。它为两个受防护变更错误码追加恢复指令，其余错误原样透传：

- `FS_STALE_VERSION`（包括缺失的编辑目标——它与陈旧错误共用同一错误码）追加 `— re-read the file, then retry`。
- `FS_NOT_OBSERVED` 追加 `— read the file, then retry`。

结构化 `FsError` 错误码保持不变，使重试/权限/UI 层继续基于它路由；原始错误作为 `cause` 链入。提供方消息保持面向机器且不变。

在 `edit.ts` 中，`fs/edit-intent` waterfall 现在与提供方变更位于同一个 `try` 内，因此策略插件从 intent 槽抛出的 `FS_NOT_OBSERVED` 拒绝也会获得恢复指令——两条拒绝路径都以相同的恢复措辞到达模型。

## Alternatives considered

- **在 `dsh-fs` / `dsh-fs-local` 的提供方消息中追加恢复指令。** 被拒绝：这些消息是面向机器的接缝词汇，除模型表面外还被重试、权限与 UI 层消费；面向模型的措辞应位于模型边界，即 `dsh-tool-fs` 已经拥有结果格式化之处（[filesystem capability seam](../architecture/2026-06-17-filesystem-capability-seam.md)）。
- **改为在提示词引导中加入恢复方式。** 被拒绝：失败发生在任务中途；静态指令无法可靠地影响重试决策，而错误消息恰好在模型必须行动时出现。
- **用新的 `FsError` 错误码表达恢复指令。** 被拒绝：这两种失败本就是重试层已处理的相同条件；拆分错误码会让语义相同的路由分叉。

## Consequences

两个错误码的模型可见文本发生变化；`fs-policy-reject` 无密钥快照被重新录制，`dsh-tool-fs` 与 `dsh-fs-policy` 的 README 逐字固定追加后的文本。单元测试直接覆盖包装器（恢复指令文本、错误码保留、cause 链、其他错误码与非 `FsError` 值的透传），组装后的工具路径断言两个错误码的恢复指令都到达模型。

恢复指令不是承诺：已删除的观察目标无法被解除阻塞，因为重新读取缺失文件会以 `FS_NOT_FOUND` 失败且不记录观察。这一死胡同在集成测试中以 fail-closed 方式固定——在目标重新存在并被新鲜观察之前，重试的变更以相同方式失败。
