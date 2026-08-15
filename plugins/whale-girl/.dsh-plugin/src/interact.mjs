// /interact 路由的纯逻辑：动作分发与跨源校验（无宿主依赖，可单测）。
// 契约：applyAction 输入 (state, action, replies)，返回 { status, body }，错误码语义集中于此；
// 投喂/玩耍是纯乐趣互动（零负反馈）：状态不变，只回一句宠物回话；宠物"说话"由客户端气泡展示。
// replies 是配置化的回话池（src/config.mjs DEFAULTS.replies——用户可自定义追加）；
// 空池/缺动作时回退内置（互动不因配置损坏而崩）。
// isCrossOrigin 输入 (headers, host)，Sec-Fetch-Site 优先、其次 Origin，都缺省视为同源。

// 内置回话池（配置缺失/损坏时的兜底；权威默认值在 src/config.mjs DEFAULTS.replies）。
const FALLBACK_REPLIES = {
  feed: ['「啊呜——谢谢投喂！」', '「好好吃，能量满满！」', '「嘻嘻，投喂成功！」'],
  play: ['「嘿嘿，再来一次！」', '「玩得好开心～」', '「我赢了！再来！」'],
}

/** 按动作返回互动结果（状态不变）。replies 为 { feed: string[], play: string[] } 配置值。 */
export function applyAction(state, action, replies = null) {
  if (action === 'feed' || action === 'play') {
    const pool = replies?.[action]?.length > 0 ? replies[action] : FALLBACK_REPLIES[action]
    return {
      status: 200,
      body: { pet: state, reply: pool[Math.floor(Math.random() * pool.length)] },
    }
  }
  return { status: 400, body: { error: `unknown action "${action}"; expected "feed" or "play"` } }
}

/** 跨源判定（CSRF 面）：返回 true 表示跨源（应拒绝）。 */
export function isCrossOrigin(headers, host) {
  const site = headers['sec-fetch-site']
  if (site !== undefined) return site !== 'same-origin' && site !== 'none'
  const origin = headers['origin']
  if (origin !== undefined) {
    try {
      return new URL(origin).host !== host
    } catch {
      return true
    }
  }
  return false
}
