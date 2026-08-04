export interface Comment {
  id: string
  author: string
  ts: string // ISO timestamp
  text: string
}

export interface Task {
  id: string
  name: string
  milestoneId: string | null
  parentId: string | null
  category: string
  assignee: string
  status: string
  estimate: number // days
  startDate: string // YYYY-MM-DD
  progress: number // 0-100
  dependencies: string[] // array of task ids
  comments: Comment[]
  notes?: string
}

export interface Milestone {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  color: string // hex or Tailwind color name
  driveFileId: string | undefined
  lastSyncedSnapshot: string | null // JSON-serialized { tasks: Task[]; milestones: Milestone[] } as of last sync
  lastSyncedAt: string | null
  googleAccessToken?: string // per-project OAuth token
  googleUserEmail?: string // per-project user email
}

export interface SyncConflict {
  taskId: string
  taskName: string // for display in case task was renamed on both sides — use browser-side name
  field: keyof Task | '__deleted' // '__deleted' is a pseudo-field marking a deletion-vs-edit conflict
  browserValue: unknown
  driveValue: unknown
}
