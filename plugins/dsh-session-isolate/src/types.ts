/**
 * Public config vocabulary of dsh-session-isolate.
 * @module dsh-session-isolate/types
 */

/** Plugin configuration (all optional in v1). */
export interface SessionIsolateConfig {
  /** Override the worktree host root (defaults to ~/.dsh/worktrees). */
  readonly worktreesRoot?: string
}
