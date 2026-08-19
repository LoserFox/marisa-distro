/**
 * `mygo config <plugin>` 的行 config 读写（r6 收敛）：实现已移入 mygo
 * 核心 `src/row-config.ts`（面板共用），本文件 re-export 保持既有引用。
 * @module @r05en1cu/dsh-mygo-cli/config
 */

export {
  readRowConfig,
  upsertRowConfig,
  writeRowConfig,
  listPatchRowIds,
  readProfilePatchText,
} from '@r05en1cu/dsh-mygo'
export type { ConfigRowResult } from '@r05en1cu/dsh-mygo'
