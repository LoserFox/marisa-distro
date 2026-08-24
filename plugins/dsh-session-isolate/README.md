# DSH Session Isolate

每个 DSH session 拥有自己的 Git worktree 与独立分支（`iso/<session>`），
多个 session 并发工作时 git 操作互不干扰：各自的提交落在各自的分支上，
共享工作区（主 checkout）的 index / HEAD / refs / 未提交改动不被任何
session 触碰；主工作区只在用户显式执行 `iso_export` 合并时被修改。

## 机制

- `iso_start`：为当前 session 懒创建 worktree（`~/.dsh/worktrees/<repo>-<session>`）
  与分支，并把主 checkout 的 `node_modules` 等忽略目录 junction 链接过去。
- 自动 turn 提交：每个 `turn/end` 后把 worktree 的全部改动提交到本 session
  的分支（`turn N (session isolation)`），形成该 session 独立的 git 记录。
- `iso_status` / `iso_commit`：查看状态、手动打点。
- `iso_export`：把 session 分支 `--no-ff` 合并回主 checkout（唯一改动共享
  工作区的操作，冲突时用 `iso_abort_merge` 回滚）。
- `iso_fork`：fork 出一个 cwd 指向该 worktree 的新 session（继承父会话的
  对话与工具组合），后续工作完全在新 worktree 中进行。
- `iso_cleanup`：删除 worktree（默认保留分支）。

## 边界

- 仅支持普通 git worktree（submodule/sparse 由 git 自身约束）。
- 不改 session 的 cwd、不动会话日志位置；已有会话的默认文件操作仍在
  原工作区，隔离通过工具指引生效；`iso_fork` 创建的新会话从创建起
  完全隔离。
- 依赖目录（node_modules）junction 共享：安装依赖会互相可见，属预期。
