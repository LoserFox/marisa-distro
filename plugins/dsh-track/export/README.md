# dsh-track 数据与可视化导出（2026-08-18）

给重新设计可视化的 agent 的完整自包含材料。三个文件：

## 文件

| 文件 | 大小 | 内容 |
|---|---|---|
| `track-calendar-view.html` | 1.3 MB | **自包含可视化**：内嵌全部数据 + 原生 JS 日历纱线（3 tab：日历纱线/矩阵/会话表），浏览器直接打开即可交互（筛选来源/项目、hover/点击节点） |
| `track-calendar-data-light.json` | 1.3 MB | 日历数据 + 每会话执行摘要（user messages / turns / tools / repos） |
| `track-calendar-data-full.json` | 25 MB | **全量数据**：calendar + store 全部表（projects/issues/links/commits/captures/decisions/epics）+ 151 个会话执行图（59k 节点完整结构） |

## 数据模型（calendar 部分）

```jsonc
calendar: {
  days: 8,                    // 可视窗口天数（数据范围）
  dayBase: "2026-08-09T00:00:00Z", // 第 0 天的零点
  projects: [{ id, name, hue }],   // 8 个真实 git 仓库
  sessions: [{
    id, title, origin,       // origin: user | subagent | auto
    userMsgCount,            // 用户消息数
    startDay, activeDays[],  // 活跃日
    perDay: [{ day, dom, events, multi }],  // 每天主导项目+事件量
    segments: [{             // 需求段
      day, proj, req,        // req = 需求标题
      reqMessageId,          // 跳回对话的锚点
      instr: [{text,messageId}], // 指示（用户补充）
      events, turns:[{outcome}], tools[]
    }]
    switches, nReq, nInstr,  // 项目切换次数/需求数/指示数
    projects: [projId...]    // 该 session 触碰的全部仓库（多项目）
  }]
  requirements: [{ id, sessionId, proj, req, day, events, messageId, origin }] // 纱线节点
  links: [{ from, to, kind: 'forked-from'|'derives'|'executed-in', toSession? }] // 跨节点连线
}
```

## 关键语义（当前实现）

- **节点 = 需求**（issue/capture），位置 = (天 × 项目泳道)，大小 = 该需求工作量（log2 压缩事件数）
- **泳道 = 项目**（git 仓库：dsh-track / dsh-harness-ops / test-fakechris / turtle-ui / gstack / brew / dsh-skill-session-recovery / Involute）
- **session 可跨多项目**：projects = 它 tool call 触碰的全部仓库
- **连线**：紫=子代理继承(forked-from)、黄虚线=需求派生(derives)、青虚线=跨会话共执行(executed-in)
- **金环** = 跨项目缠绕（session 触碰 ≥2 仓库）
- **origin 过滤**：用户输入(默认开) / 子代理(默认关) / 自动(默认关)

## sessionsDetail（每会话执行树摘要，light/full 里都有）

```jsonc
sessionsDetail: [{
  sessionId, title, cwd,     // cwd = 工作目录（注意：不是项目！项目=repos）
  repos: [{url, root, name}], // 实际触碰的 git 仓库 ← 项目归属的依据
  parentSession,             // 子代理继承的父会话（forked-from 的来源）
  createdAt,                 // 会话开始
  userMsgs: [{seq,title,messageId,at}],  // 用户消息（需求锚点）
  turns: [{seq,seqEnd,outcome,at}],      // 回合结局 completed/aborted/error/blocked
  tools: [{seq,name,err}],   // 工具调用
}]
```

## 数据事实（2026-08-18 实测）

- 151 会话：99 用户 / 39 子代理 / 13 自动；36 个多项目会话
- 100 需求节点；22 条连线（16 forked-from + 6 executed-in）；derives 为 0（sync 未写 parentId）
- 95 issue：83 done，其中只有 9 条有 implements commit 证据（Better Harness 研究的核心 gap）
- 462 条 link：implements 162 / landed-in 132 / executed-in 101 / forked-from 47 等，均有 evidenceKind/confidence 分级（P1）

## 给重新设计者的建议（当前图的问题）

1. **点之间联系仍少**：links 只有 22 条进日历。全量 link 表有 462 条（含 implements→commit、landed-in），但 commit 不是日历节点——可考虑把 commit 作为独立层/节点加入
2. **derives 空**：需求派生关系（issue.parentId）sync 没写，图上没有黄虚线——可考虑从 executed-in/session 顺序推导需求谱系
3. **0 项目 session 多**（68 个）：多是 mock/测试会话，可视化时可过滤或折叠
4. **点布局**：同天同泳道需求水平扇形错开（大的居中），可继续优化防重叠
