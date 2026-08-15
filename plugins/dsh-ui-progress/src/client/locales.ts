/** `progress` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'bar.idle': '会话就绪',
  'bar.running': '正在执行',
  'bar.thinking': '正在思考',
  'bar.todos': '已完成 {done}/{total}',
  'bar.turn': '第 {turn} 轮',
  'bar.tools': '{count} 个工具调用',
  'bar.tool': '工具 {name}',
  'bar.waiting': '等待输入',
  'bar.elapsed': '已耗时 {duration}',
  'bar.eta': '预计剩余 {duration}',
  'bar.tokenRate': '{rate} tok/s',
  'bar.lastTurn': '上回合 {duration}',
  'bar.interrupted': '已中断',
  'bar.pendingApproval': '等待审批',
  'bar.pendingQuestion': '需要选择',
  'bar.pendingPlan': '等待计划审阅',
  'bar.pendingSubagentApproval': '子代理等待审批',
  'bar.pendingSubagentQuestion': '子代理需要选择',
  'bar.pendingSubagentPlan': '子代理等待计划审阅',
  'bar.pendingSubagentCount': '子代理 {count} 项待处理',
} satisfies Record<string, string>

/** The progress namespace key union. */
export type ProgressKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'bar.idle': 'Session idle',
  'bar.running': 'Executing',
  'bar.thinking': 'Thinking',
  'bar.todos': 'Done {done}/{total}',
  'bar.turn': 'Turn {turn}',
  'bar.tools': '{count} tool calls',
  'bar.tool': 'Tool {name}',
  'bar.waiting': 'Waiting for input',
  'bar.elapsed': 'Elapsed {duration}',
  'bar.eta': 'ETA {duration}',
  'bar.tokenRate': '{rate} tok/s',
  'bar.lastTurn': 'Last turn {duration}',
  'bar.interrupted': 'Interrupted',
  'bar.pendingApproval': 'Awaiting approval',
  'bar.pendingQuestion': 'Needs selection',
  'bar.pendingPlan': 'Awaiting plan review',
  'bar.pendingSubagentApproval': 'Subagent awaiting approval',
  'bar.pendingSubagentQuestion': 'Subagent needs selection',
  'bar.pendingSubagentPlan': 'Subagent awaiting plan review',
  'bar.pendingSubagentCount': 'Subagent {count} pending',
} satisfies Record<ProgressKey, string>
