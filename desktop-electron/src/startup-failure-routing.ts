/**
 * Startup failure routing — port of anywhere dsh-plugin-desktop
 * src/startup-failure-routing.ts (MIT).
 *
 * Headless decision table for failures raised while the Electron main is
 * starting. Error strings are diagnostics, never authority for deciding
 * whether the shell may mutate state.
 */

/** Startup stages tracked while the shell boots (recovery-copy.ts stage list, marisa subset). */
export type DesktopStartupFailureStage =
  | 'electron-ready'
  | 'backend-extract'
  | 'backend-boot'
  | 'backend-ready'
  | 'renderer-startup'

export type DesktopStartupFailureRoute = 'stderr-only' | 'startup-recovery'

export interface DesktopStartupFailureContext {
  readonly appReady: boolean
  readonly stage: DesktopStartupFailureStage
}

/**
 * Route one startup exception without inspecting its message: before the app
 * is ready there is no window to show the recovery page in, so the failure
 * stays stderr-only.
 */
export function routeDesktopStartupFailure(
  context: DesktopStartupFailureContext,
): DesktopStartupFailureRoute {
  if (!context.appReady) return 'stderr-only'
  return 'startup-recovery'
}
