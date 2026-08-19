/** E2E fixture provider：提供 `voice-chat` 服务（F4 vibe-mode requires 载体）。 */
export const name = 'dsh-voice-chat'
export const inject: string[] = []

export function apply(ctx: { provide(service: string, value: unknown): () => void }): void {
  ctx.provide('voice-chat', {
    speak(): string { return 'ok' },
  })
}
