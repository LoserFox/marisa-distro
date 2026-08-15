export type ViewContentType = 'memory' | 'skill' | 'teamwork'
export type ViewReadMode = 'direct' | 'expand' | 'query'
export type ViewWriteMode = 'record' | 'target' | 'background'
export type ViewPrimitive = ViewReadMode | ViewWriteMode
export type ViewLocale = 'zh-CN' | 'en-US'
export type ViewMotion = 'full' | 'reduced'
export type ViewOperation = 'add' | 'replace' | 'remove'
export type CandidateStatus = 'pending' | 'accepted' | 'rejected'
export type TeamworkState = 'queued' | 'active' | 'waiting' | 'blocked' | 'done'

export interface ViewSource {
  id: string
  label: string
  type: ViewContentType
  readMode: ViewReadMode
  enabled: boolean
  provider: 'local-preview' | 'mnemond'
  updatedAt: string
}

export interface TeamworkProjection {
  owner?: string
  state: TeamworkState
  progress?: number
}

export interface ViewEntry {
  id: string
  sourceId: string
  type: ViewContentType
  readMode: ViewReadMode
  writeMode: ViewWriteMode
  writeTarget?: string
  title: string
  summary: string
  content: string
  revision: number
  acceptedAt: string
  revokedAt?: string
  replaces?: string
  derivedFrom?: string
  teamwork?: TeamworkProjection
}

export interface ViewCandidate {
  id: string
  operation: ViewOperation
  sourceId: string
  type: ViewContentType
  readMode: ViewReadMode
  writeMode: ViewWriteMode
  writeTarget?: string
  title: string
  summary: string
  content: string
  targetId?: string
  derivedFrom?: string
  teamwork?: TeamworkProjection
  status: CandidateStatus
  proposedBy: 'user' | 'model' | 'background'
  proposedAt: string
  decidedAt?: string
}

export interface ViewActivity {
  id: string
  action: 'read' | 'proposed' | 'accepted' | 'rejected' | 'source-enabled' | 'source-disabled'
  subjectId: string
  label: string
  actor: 'user' | 'model' | 'background' | 'system'
  primitive?: ViewPrimitive
  contentType?: ViewContentType
  at: string
}

export interface ViewSnapshot {
  id: string
  generation: number
  builtAt: string
  workspace: string
  digest: string
  entries: ViewEntry[]
  sourceRevisions: Record<string, string>
}

export interface PersistedViewState {
  schemaVersion: 1
  generation: number
  sources: ViewSource[]
  entries: ViewEntry[]
  candidates: ViewCandidate[]
  activity: ViewActivity[]
}

export interface ViewStatus {
  provider: 'local-preview'
  workspace: string
  active: ViewSnapshot
  next: ViewSnapshot
  pendingActivation: boolean
  sources: ViewSource[]
  candidates: ViewCandidate[]
  activity: ViewActivity[]
  ui: ViewUiConfig
  configuration?: ViewConfigurationStatus
}

export interface ViewUiConfig {
  locale: ViewLocale
  refreshIntervalMs: number
  motion: ViewMotion
  backgroundReviewEnabled: boolean
  backgroundReviewIntervalMs: number
}

export interface ViewConfigurationStatus {
  available: boolean
  writable: boolean
  applies: 'live'
  revision: number
  user: Partial<ViewUiConfig>
}

export const SONAR_READ_RPC = '/dsh-sonar.view.read'
export const SONAR_WRITE_RPC = '/dsh-sonar.view.write'
