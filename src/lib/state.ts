import type { Task, Milestone, Project, Comment, SyncConflict } from './types'
import { uid } from './seed'
import { TODAY } from './dates'
import { exportTasksCsv } from './csv'
import { drive } from './drive'
import {
  computeOrderBetween,
  getSiblingGroup,
  isGroupBackfilled,
  backfillGroupOrders,
} from './order'

export interface AppState {
  // Navigation & Project Management
  activeView: 'tasks' | 'milestones' | 'timeline'
  activeProjectId: string
  projects: Project[]
  savedProjects: { [projectId: string]: ProjectState } // per-project snapshots for inactive projects

  // Google Auth & Backup (per-project). Hydrated at boot from @open-webapp/drive-sync's
  // per-project connection state; never persisted to localStorage — this is the single
  // source of truth for connection status, replacing the old (buggy, double-persisted)
  // Project.googleAccessToken.
  authByProject: Record<string, { email: string; needsReauth: boolean }>
  googleBusy: boolean
  googleStatus?: string // 'connecting' | 'disconnecting' | error message

  // Sync State
  syncBusy: boolean // replaces conditionally reusing googleBusy
  syncStatus?: string // drives toast message, e.g. "Synced at 3:45 PM" or error string
  // The raw thrown value (often a typed @open-webapp/drive-sync error) behind the
  // last SYNC_ERROR's string message, so the UI can branch on error shape via
  // parseSyncError() instead of re-deriving it from syncStatus's plain string.
  syncError?: unknown
  syncConflicts: SyncConflict[] // empty when no conflict dialog open
  syncPendingMerge?: { tasks: Task[]; milestones: Milestone[] } // fully-merged result awaiting conflict resolution

  // Settings
  settingsOpen: boolean
  settingsTab: 'general' | 'projects'

  // Per-Project Task Data
  tasks: Task[]
  milestones: Milestone[]

  // UI State
  expanded: { [taskId: string]: boolean }
  selectedTaskId?: string
  commentsOverlayId?: string // task id whose comments overlay is open
  depsEditorTaskId?: string // task id whose deps editor is open

  // Filters & Sorting
  filters: {
    status?: string
    category?: string
    assignee?: string
    milestone?: string
    search?: string
  }
  sortKey: string
  sortDir: 'asc' | 'desc'
  columnWidths: { [columnName: string]: number }

  // Dropdowns & Custom Values
  customStatuses: string[]
  customAssignees: string[]
  customCategories: string[]

  // Temporary/Draft State (not persisted)
  newCommentText: string
  depsFilterText: string
  depsDraft: { [taskId: string]: string[] } // draft dependencies for the deps editor
}

export interface ProjectState {
  // Subset of AppState specific to a project
  tasks: Task[]
  milestones: Milestone[]
  expanded: { [taskId: string]: boolean }
  filters: {
    status?: string
    category?: string
    assignee?: string
    milestone?: string
    search?: string
  }
  sortKey: string
  sortDir: 'asc' | 'desc'
  columnWidths: { [columnName: string]: number }
  customStatuses: string[]
  customAssignees: string[]
  customCategories: string[]
}

export function emptyProjectState(): ProjectState {
  return {
    tasks: [],
    milestones: [],
    expanded: {},
    filters: {},
    sortKey: 'startDate',
    sortDir: 'asc',
    columnWidths: {},
    customStatuses: [],
    customAssignees: [],
    customCategories: [],
  }
}

// Array of field names for in-memory per-project snapshots when switching projects
export const PROJECT_STATE_KEYS: string[] = [
  'tasks',
  'milestones',
  'expanded',
  'columnWidths',
  'sortKey',
  'sortDir',
  'filters',
  'customStatuses',
  'customAssignees',
  'customCategories',
  'depsDraft',
  'selectedTaskId',
  'depsEditorTaskId',
  'commentsOverlayId',
  'newCommentText',
]

// Subset of state keys actually written to localStorage (excludes temporary UI state)
export const PERSIST_STATE_KEYS: string[] = [
  'tasks',
  'milestones',
  'expanded',
  'columnWidths',
  'sortKey',
  'sortDir',
  'filters',
  'customStatuses',
  'customAssignees',
  'customCategories',
]

// Creates a snapshot of just the project-specific fields from AppState
export function snapshotProjectState(state: AppState): ProjectState {
  const snap: Partial<ProjectState> = {}
  PROJECT_STATE_KEYS.forEach(k => {
    const key = k as keyof ProjectState
    snap[key] = state[k as keyof AppState] as any
  })
  return snap as ProjectState
}

// Creates subset of state for localStorage (only keys in PERSIST_STATE_KEYS) plus global fields
export function snapshotForPersist(state: AppState): Partial<AppState> {
  const snap: Partial<AppState> = {}
  PERSIST_STATE_KEYS.forEach(k => {
    (snap as any)[k] = (state as any)[k]
  })
  // Add global state fields (note: auth tokens are per-project, stored separately by drive-sync's IndexedDB storage)
  snap.projects = state.projects
  snap.activeProjectId = state.activeProjectId
  snap.activeView = state.activeView
  snap.savedProjects = state.savedProjects
  return snap
}

// localStorage key for persisting app state
export const APP_STORAGE_KEY = 'pma_app_state_v1'

// Load persisted app state from localStorage.
// One-time boot cleanup: older builds mistakenly persisted Project.googleAccessToken /
// Project.googleUserEmail into this blob (they're never supposed to be persisted — see
// AppState.authByProject). Strip them from every project entry before use, and rewrite
// the cleaned blob back to storage so subsequent loads are already clean. Idempotent:
// running this against an already-clean blob is a no-op (no stray fields to strip, no
// rewrite performed).
export function loadPersistedApp(): Partial<AppState> | null {
  try {
    const stored = localStorage.getItem(APP_STORAGE_KEY)
    if (!stored) {
      return null
    }
    const parsed = JSON.parse(stored) as Partial<AppState>

    if (Array.isArray(parsed.projects)) {
      let changed = false
      const cleanedProjects = parsed.projects.map((project: any) => {
        if (
          project &&
          typeof project === 'object' &&
          ('googleAccessToken' in project || 'googleUserEmail' in project)
        ) {
          changed = true
          const { googleAccessToken: _googleAccessToken, googleUserEmail: _googleUserEmail, ...rest } = project
          return rest
        }
        return project
      })

      if (changed) {
        parsed.projects = cleanedProjects
        try {
          localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(parsed))
        } catch (error) {
          console.error('Failed to rewrite cleaned app state:', error)
        }
      }
    }

    return parsed
  } catch (error) {
    console.error('Failed to load persisted app state:', error)
    return null
  }
}

/**
 * Hydrate authByProject at boot from drive-sync's per-project connection state
 * (IndexedDB-backed, so unlike the old googleAuth.ts localStorage read this is
 * necessarily async). Callers render with an empty authByProject on first paint
 * and dispatch the resolved result once this settles — see App.tsx's mount
 * effect and the 'HYDRATE_AUTH_BY_PROJECT' reducer case. Projects with no
 * stored connection get no entry, meaning disconnected.
 */
export async function hydrateAuthByProject(projects: Project[]): Promise<AppState['authByProject']> {
  const result: AppState['authByProject'] = {}
  await Promise.all(
    projects.map(async (project) => {
      const conn = await drive.project(project.id).getConnection()
      if (conn) {
        result[project.id] = { email: conn.email, needsReauth: conn.needsReauth }
      }
    })
  )
  return result
}

/**
 * Record a successful connection/reauth for a project in authByProject.
 */
export function setProjectGoogleAuth(
  state: AppState,
  projectId: string,
  email: string
): AppState {
  return {
    ...state,
    authByProject: {
      ...state.authByProject,
      [projectId]: { email, needsReauth: false },
    },
  }
}

// Save app state to localStorage
export function savePersistedApp(state: AppState): void {
  try {
    const snapshot = snapshotForPersist(state)
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(snapshot))
  } catch (error) {
    console.error('Failed to save app state:', error)
  }
}

/**
 * Switch to a different project.
 * Snapshots the current project into savedProjects, restores the target project,
 * and resets activeView to 'tasks'.
 */
export function switchProject(state: AppState, projectId: string): AppState {
  // If switching to the same project, just reset view
  if (projectId === state.activeProjectId) {
    return {
      ...state,
      activeView: 'tasks',
    }
  }

  // Snapshot current project
  const savedProjects = {
    ...state.savedProjects,
    [state.activeProjectId]: snapshotProjectState(state),
  }

  // Restore target project or use empty state
  const restored = savedProjects[projectId] || emptyProjectState()

  // Remove the restored project from savedProjects so it's the active project
  const updatedSavedProjects = { ...savedProjects }
  delete updatedSavedProjects[projectId]

  return {
    ...state,
    activeProjectId: projectId,
    savedProjects: updatedSavedProjects,
    ...restored,
    activeView: 'tasks',
  }
}

/**
 * Create a new project with the given name and optional color.
 * Snapshots the current project, initializes the new project with empty state,
 * and sets it as the active project.
 */
export function createProject(
  state: AppState,
  name: string,
  color?: string
): AppState {
  const projectId = uid('p')

  // Snapshot current project
  const savedProjects = {
    ...state.savedProjects,
    [state.activeProjectId]: snapshotProjectState(state),
  }

  // Create new project object
  const newProject: Project = {
    id: projectId,
    name,
    color: color || 'netskopeBlue',
    driveFileId: undefined,
    lastSyncedSnapshot: null,
    lastSyncedAt: null,
  }

  return {
    ...state,
    projects: [...state.projects, newProject],
    savedProjects,
    activeProjectId: projectId,
    ...emptyProjectState(),
    activeView: 'tasks',
  }
}

/**
 * Prompt the user for a new project name and create the project.
 * Returns null if the user cancels or enters an empty name.
 */
export function promptNewProject(state: AppState): AppState | null {
  if (typeof window === 'undefined' || !window.prompt) {
    return null
  }

  const name = window.prompt('New project name:')
  if (!name || !name.trim()) {
    return null
  }

  return createProject(state, name.trim())
}

/**
 * Rename a project by ID.
 */
export function renameProject(
  state: AppState,
  projectId: string,
  newName: string
): AppState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, name: newName } : p
    ),
  }
}

/**
 * Delete a project by ID.
 * Refuses to delete if it's the last project.
 * If deleting the active project, switches to another project first.
 */
export function deleteProject(state: AppState, projectId: string): AppState {
  // Cannot delete the last project
  if (state.projects.length <= 1) {
    return state
  }

  // Remove project from projects array
  const projects = state.projects.filter((p) => p.id !== projectId)

  // Remove from savedProjects
  const savedProjects = { ...state.savedProjects }
  delete savedProjects[projectId]

  // If deleting the active project, switch to another project
  if (state.activeProjectId === projectId) {
    const nextProjectId = projects[0].id
    const restored = savedProjects[nextProjectId] || emptyProjectState()
    const updatedSavedProjects = { ...savedProjects }
    delete updatedSavedProjects[nextProjectId]

    return {
      ...state,
      projects,
      savedProjects: updatedSavedProjects,
      activeProjectId: nextProjectId,
      ...restored,
      activeView: 'tasks',
    }
  }

  return {
    ...state,
    projects,
    savedProjects,
  }
}

// ============================================================================
// TREE OPERATIONS
// ============================================================================

/**
 * Ensure manual mode for a task's sibling group, backfilling orders if needed.
 * Internal helper used by moveTaskToPosition and related functions.
 */
function ensureManualModeForGroup(
  state: AppState,
  taskId: string,
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state

  const group = getSiblingGroup(state.tasks, state.milestones, task)
  const needsBackfill = !isGroupBackfilled(group)

  const tasks = needsBackfill
    ? backfillGroupOrders(state.tasks, group, state.sortKey, state.sortDir, displaySchedules)
    : state.tasks

  return { ...state, tasks, sortKey: 'manual', sortDir: 'asc' }
}

/**
 * Move a task to a new position (milestone/parent/order), switching to manual mode.
 * Backfills both the source and target sibling groups to ensure coherent ordering.
 * Propagates milestoneId through the task's entire subtree if milestone changed.
 */
export function moveTaskToPosition(
  state: AppState,
  taskId: string,
  newMilestoneId: string | null,
  newParentId: string | null,
  beforeTaskId: string | undefined,
  afterTaskId: string | undefined,
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state

  // Refuse moves that would make the task its own ancestor (directly, or by
  // nesting it under one of its current descendants) — e.g. dragging a
  // parent row onto one of its own children derives newParentId from the
  // child's parentId, which is the dragged task's own id.
  if (newParentId !== null) {
    let current: Task | undefined = state.tasks.find((t) => t.id === newParentId)
    while (current) {
      if (current.id === taskId) return state
      current = state.tasks.find((t) => t.id === current!.parentId)
    }
  }

  // 1. Enter manual mode + backfill the task's CURRENT group (pre-move),
  //    so its old siblings retain a coherent order after it leaves.
  let next = ensureManualModeForGroup(state, taskId, displaySchedules)

  // 2. Backfill the TARGET group too (it may be untouched), using the
  //    (possibly already-updated) tasks array.
  const targetGroupMembers = next.tasks.filter((t) => {
    if (t.id === taskId) return false
    return t.milestoneId === newMilestoneId && t.parentId === newParentId
  })
  if (!isGroupBackfilled(targetGroupMembers)) {
    next = {
      ...next,
      tasks: backfillGroupOrders(next.tasks, targetGroupMembers, next.sortKey, next.sortDir, displaySchedules),
    }
  }

  // 3. Compute the new order value from the (now-backfilled) neighbors.
  const beforeOrder = beforeTaskId ? next.tasks.find((t) => t.id === beforeTaskId)?.order : undefined
  const afterOrder = afterTaskId ? next.tasks.find((t) => t.id === afterTaskId)?.order : undefined
  const newOrder = computeOrderBetween(beforeOrder, afterOrder)

  // 4. Apply: move the task, propagate milestoneId through the WHOLE subtree, assign order.
  const milestoneChanged = task.milestoneId !== newMilestoneId
  const descendantIds = new Set<string>()
  if (milestoneChanged) {
    const collect = (pid: string) => {
      next.tasks.forEach((t) => {
        if (t.parentId === pid) {
          descendantIds.add(t.id)
          collect(t.id)
        }
      })
    }
    collect(taskId)
  }

  const tasks = next.tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, milestoneId: newMilestoneId, parentId: newParentId, order: newOrder }
    }
    if (descendantIds.has(t.id)) {
      return { ...t, milestoneId: newMilestoneId }
    }
    return t
  })

  return { ...next, tasks }
}

/**
 * Toggle the expanded state of a task by ID.
 */
export function toggleExpand(state: AppState, taskId: string): AppState {
  return {
    ...state,
    expanded: {
      ...state.expanded,
      [taskId]: state.expanded[taskId] === false ? true : false,
    },
  }
}

/**
 * Indent a task under the previous same-milestone sibling (only if sibling exists and task has no parent).
 * Also expands the parent to show the indented task.
 * If in manual mode, assigns an order at the end of the new parent's children.
 */
export function indentTask(state: AppState, taskId: string): AppState {
  const tasks = state.tasks
  const idx = tasks.findIndex((t) => t.id === taskId)
  if (idx < 0) return state

  const t = tasks[idx]
  if (t.parentId) return state // Task already has a parent

  // Find previous same-milestone sibling (non-parent task)
  let prev: Task | null = null
  for (let i = idx - 1; i >= 0; i--) {
    const c = tasks[i]
    if (c.milestoneId !== t.milestoneId) break
    if (!c.parentId) {
      prev = c
      break
    }
  }

  if (!prev) return state // No previous sibling found

  // Compute manual order if in manual mode
  const manualOrder = state.sortKey === 'manual'
    ? (() => {
        const newSiblings = tasks.filter((x) => x.parentId === prev!.id)
        const maxOrder = newSiblings.reduce((m, s) => Math.max(m, s.order || 0), 0)
        return computeOrderBetween(maxOrder || undefined, undefined)
      })()
    : undefined

  const newTasks = tasks.map((x) =>
    x.id === taskId
      ? {
          ...x,
          parentId: prev!.id,
          milestoneId: prev!.milestoneId,
          ...(manualOrder !== undefined ? { order: manualOrder } : {}),
        }
      : x
  )

  return {
    ...state,
    tasks: newTasks,
    expanded: { ...state.expanded, [prev.id]: true },
  }
}

/**
 * Outdent a task (remove parent) and re-splice after its former parent's last child.
 * If in manual mode, assigns an order at the end of the new top-level group.
 */
export function outdentTask(state: AppState, taskId: string): AppState {
  const tasks = state.tasks
  const t = tasks.find((x) => x.id === taskId)
  if (!t || !t.parentId) return state

  const parentId = t.parentId

  // Compute manual order if in manual mode
  const manualOrder = state.sortKey === 'manual'
    ? (() => {
        const topLevelSiblings = tasks.filter((x) => x.parentId === null && x.id !== taskId)
        const maxOrder = topLevelSiblings.reduce((m, s) => Math.max(m, s.order || 0), 0)
        return computeOrderBetween(maxOrder || undefined, undefined)
      })()
    : undefined

  // Remove parent from the task and assign order if in manual mode
  const promoted = tasks.map((x) =>
    x.id === taskId
      ? {
          ...x,
          parentId: null,
          ...(manualOrder !== undefined ? { order: manualOrder } : {}),
        }
      : x
  )

  // Create a temporary array without the promoted task
  const withoutT = promoted.filter((x) => x.id !== taskId)

  // Find the parent position and insert after all its children
  const parentPos = withoutT.findIndex((x) => x.id === parentId)
  let insertPos = parentPos + 1
  while (insertPos < withoutT.length && withoutT[insertPos].parentId === parentId) {
    insertPos++
  }

  // Insert the promoted task at the new position
  withoutT.splice(insertPos, 0, promoted.find((x) => x.id === taskId)!)

  return {
    ...state,
    tasks: withoutT,
  }
}

// ============================================================================
// SELECTION & OVERLAY
// ============================================================================

/**
 * Select a task by ID (set selectedTaskId).
 */
export function selectTask(state: AppState, taskId: string): AppState {
  return {
    ...state,
    selectedTaskId: taskId,
  }
}

/**
 * Close the detail panel (clear selectedTaskId).
 */
export function closeDetail(state: AppState): AppState {
  return {
    ...state,
    selectedTaskId: undefined,
  }
}

/**
 * Open the comments overlay for a task.
 */
export function openCommentsOverlay(state: AppState, taskId: string): AppState {
  return {
    ...state,
    commentsOverlayId: taskId,
  }
}

/**
 * Close the comments overlay.
 */
export function closeCommentsOverlay(state: AppState): AppState {
  return {
    ...state,
    commentsOverlayId: undefined,
  }
}

/**
 * Open the dependencies editor for a task.
 */
export function openDepsEditor(state: AppState, taskId: string): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  return {
    ...state,
    depsEditorTaskId: taskId,
    depsDraft: {
      ...state.depsDraft,
      [taskId]: task?.dependencies || [],
    },
  }
}

/**
 * Close the dependencies editor.
 */
export function closeDepsEditor(state: AppState): AppState {
  const newDepsDraft = { ...state.depsDraft }
  if (state.depsEditorTaskId) {
    delete newDepsDraft[state.depsEditorTaskId]
  }
  return {
    ...state,
    depsEditorTaskId: undefined,
    depsDraft: newDepsDraft,
  }
}

// ============================================================================
// DEPENDENCIES
// ============================================================================

/**
 * Toggle a dependency: add if not present, remove if present.
 */
export function toggleDependency(state: AppState, taskId: string, depId: string): AppState {
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return state

  if ((t.dependencies || []).includes(depId)) {
    return removeDependency(state, taskId, depId)
  } else {
    return addDependency(state, taskId, depId)
  }
}

/**
 * Add a dependency (idempotent, no duplicate).
 */
export function addDependency(state: AppState, taskId: string, depId: string): AppState {
  if (!depId) return state

  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            dependencies: Array.from(new Set([...t.dependencies, depId])),
          }
        : t
    ),
  }
}

/**
 * Remove a dependency.
 */
export function removeDependency(state: AppState, taskId: string, depId: string): AppState {
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, dependencies: t.dependencies.filter((d) => d !== depId) }
        : t
    ),
  }
}

// ============================================================================
// SORTING & FILTERING
// ============================================================================

/**
 * Toggle sort: if sortKey === newKey, flip sortDir; else set sortKey and reset to 'asc'.
 */
export function toggleSort(state: AppState, newKey: string): AppState {
  return {
    ...state,
    sortKey: newKey,
    sortDir: state.sortKey === newKey ? (state.sortDir === 'asc' ? 'desc' : 'asc') : 'asc',
  }
}

/**
 * Update a filter value.
 */
export function setFilter(
  state: AppState,
  filterKey: 'status' | 'category' | 'assignee' | 'milestone' | 'search',
  value: string
): AppState {
  return {
    ...state,
    filters: {
      ...state.filters,
      [filterKey]: value,
    },
  }
}

// ============================================================================
// COLUMN RESIZE
// ============================================================================

/**
 * Set column width, enforcing a minimum of 50px.
 */
export function setColumnWidth(state: AppState, columnName: string, width: number): AppState {
  const minWidth = columnName === 'name' ? 160 : 50
  const enforcedWidth = Math.max(minWidth, width)
  return {
    ...state,
    columnWidths: {
      ...state.columnWidths,
      [columnName]: enforcedWidth,
    },
  }
}

// ============================================================================
// DROPDOWNS & CUSTOM VALUES
// ============================================================================


/**
 * Merge any status/assignee/category values found on the given tasks into the
 * corresponding custom dropdown lists, so values introduced by an external
 * source (e.g. a spreadsheet sync) show up as filter/autocomplete options.
 */
export function mergeCustomValuesFromTasks(
  state: AppState,
  tasks: Task[]
): Pick<AppState, 'customStatuses' | 'customAssignees' | 'customCategories'> {
  const mergeField = (existing: string[], values: (string | undefined)[]) => {
    const merged = [...existing]
    for (const value of values) {
      if (value && !merged.includes(value)) {
        merged.push(value)
      }
    }
    return merged
  }

  return {
    customStatuses: mergeField(state.customStatuses, tasks.map((t) => t.status)),
    customAssignees: mergeField(state.customAssignees, tasks.map((t) => t.assignee)),
    customCategories: mergeField(state.customCategories, tasks.map((t) => t.category)),
  }
}

/**
 * Handle value select from dropdown: either take the value directly or prompt if it's a special "add new" marker.
 */
export function handleValueSelect(
  state: AppState,
  fieldName: 'customStatuses' | 'customAssignees' | 'customCategories',
  value: string
): AppState {
  // Simple implementation: just add the value if provided
  if (!value) return state

  const currentList = state[fieldName]

  // Deduplicate
  if (currentList.includes(value)) {
    return state
  }

  return {
    ...state,
    [fieldName]: [...currentList, value],
  }
}

// ============================================================================
// TASK CRUD
// ============================================================================

/**
 * Update a task with a partial patch (merge).
 */
export function updateTask(state: AppState, taskId: string, patch: Partial<Task>): AppState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  }
}

/**
 * Create a new milestone with the given name.
 */
export function addMilestone(state: AppState, name: string): AppState {
  if (!name || !name.trim()) return state

  const milestone: Milestone = {
    id: uid('m'),
    name: name.trim(),
  }

  return {
    ...state,
    milestones: [...state.milestones, milestone],
  }
}

/**
 * Create a new milestone and move a task to it (atomic operation).
 */
export function addMilestoneAndMoveTask(
  state: AppState,
  taskId: string,
  milestoneName: string
): AppState {
  if (!milestoneName || !milestoneName.trim()) return state

  const milestone: Milestone = {
    id: uid('m'),
    name: milestoneName.trim(),
  }

  return {
    ...state,
    milestones: [...state.milestones, milestone],
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? { ...t, milestoneId: milestone.id, parentId: null }
        : t
    ),
  }
}

/**
 * Update a milestone with a partial patch (merge).
 */
export function updateMilestone(
  state: AppState,
  milestoneId: string,
  patch: Partial<Milestone>
): AppState {
  return {
    ...state,
    milestones: state.milestones.map((m) => (m.id === milestoneId ? { ...m, ...patch } : m)),
  }
}

/**
 * Add a comment to a task.
 */
export function addComment(
  state: AppState,
  taskId: string,
  text: string,
  author: string
): AppState {
  if (!text || !text.trim()) return state

  const comment: Comment = {
    id: uid('c'),
    author,
    ts: new Date().toISOString(),
    text: text.trim(),
  }

  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            comments: [...t.comments, comment],
          }
        : t
    ),
    newCommentText: '',
  }
}

/**
 * Create a new task. If selectedTaskId is set, insert after that task and inherit its properties.
 * Otherwise, append to the task list.
 */
export function addTask(state: AppState, name: string): AppState {
  const taskId = uid('t')
  const anchor = state.selectedTaskId ? state.tasks.find((t) => t.id === state.selectedTaskId) : null

  // Inherit from anchor or use defaults
  const milestoneId = anchor ? anchor.milestoneId : state.milestones[0]?.id || null
  const parentId = anchor ? anchor.parentId : null
  const category = anchor ? anchor.category : ''
  const assignee = anchor ? anchor.assignee : 'Unassigned'
  const startDate = anchor ? anchor.startDate : TODAY

  // Compute order: assign a real order if the anchor's group is backfilled
  let order = 0
  if (anchor) {
    const group = getSiblingGroup(state.tasks, state.milestones, anchor)
    if (isGroupBackfilled(group)) {
      const groupSortedByOrder = [...group].sort((a, b) => a.order - b.order)
      const anchorIdx = groupSortedByOrder.findIndex((t) => t.id === anchor.id)
      const nextSibling = groupSortedByOrder[anchorIdx + 1]
      order = computeOrderBetween(anchor.order, nextSibling?.order)
    }
  } else {
    // No anchor: append to global end with appropriate order if that milestone group is backfilled
    const targetMilestoneId = milestoneId
    const targetParentId = parentId
    const tempTask: Task = {
      id: '__temp__',
      name: '',
      milestoneId: targetMilestoneId,
      parentId: targetParentId,
      category: '',
      assignee: '',
      status: 'Not Started',
      estimate: 1,
      startDate: TODAY,
      progress: 0,
      order: 0,
      dependencies: [],
      comments: [],
    }
    const group = getSiblingGroup(state.tasks, state.milestones, tempTask)
    if (isGroupBackfilled(group)) {
      const groupSortedByOrder = [...group].sort((a, b) => a.order - b.order)
      const lastMember = groupSortedByOrder[groupSortedByOrder.length - 1]
      order = computeOrderBetween(lastMember?.order, undefined)
    }
  }

  const task: Task = {
    id: taskId,
    name,
    milestoneId,
    parentId,
    category,
    assignee,
    status: 'Not Started',
    estimate: 3,
    startDate,
    progress: 0,
    order,
    dependencies: [],
    comments: [],
  }

  let newTasks: Task[]
  if (anchor) {
    const idx = state.tasks.findIndex((t) => t.id === anchor.id)
    newTasks = [...state.tasks.slice(0, idx + 1), task, ...state.tasks.slice(idx + 1)]
  } else {
    newTasks = [...state.tasks, task]
  }

  return {
    ...state,
    tasks: newTasks,
  }
}

/**
 * Move a task to a different milestone (and clear its parent).
 * Also moves all direct children to the new milestone.
 */
export function moveTaskToMilestone(state: AppState, taskId: string, milestoneId: string): AppState {
  return {
    ...state,
    tasks: state.tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, milestoneId, parentId: null }
      }
      if (t.parentId === taskId) {
        return { ...t, milestoneId }
      }
      return t
    }),
  }
}

/**
 * Create a new subtask under a parent task.
 * Inherits milestone, category, assignee, and startDate from parent.
 */
export function addSubtask(state: AppState, parentTaskId: string, name: string): AppState {
  const parent = state.tasks.find((t) => t.id === parentTaskId)
  if (!parent) return state

  const taskId = uid('t')
  const sub: Task = {
    id: taskId,
    name,
    milestoneId: parent.milestoneId,
    parentId: parentTaskId,
    category: parent.category,
    assignee: parent.assignee,
    status: 'Not Started',
    estimate: 2,
    startDate: parent.startDate,
    progress: 0,
    order: 0,
    dependencies: [],
    comments: [],
  }

  return {
    ...state,
    tasks: [...state.tasks, sub],
    selectedTaskId: taskId,
    expanded: { ...state.expanded, [parentTaskId]: true },
  }
}

/**
 * Delete a task and all its direct children.
 * Strip taskId from all other tasks' dependencies.
 * Clear selectedTaskId if the deleted task was selected.
 */
export function deleteTask(state: AppState, taskId: string): AppState {
  const toRemove = new Set<string>([taskId])

  // Find all direct children
  state.tasks.forEach((t) => {
    if (t.parentId === taskId) {
      toRemove.add(t.id)
    }
  })

  // Filter out deleted tasks and strip from dependencies
  const newTasks = state.tasks
    .filter((t) => !toRemove.has(t.id))
    .map((t) => ({
      ...t,
      dependencies: (t.dependencies || []).filter((d) => !toRemove.has(d)),
    }))

  return {
    ...state,
    tasks: newTasks,
    selectedTaskId:
      state.selectedTaskId && toRemove.has(state.selectedTaskId) ? undefined : state.selectedTaskId,
  }
}

// ============================================================================
// PROJECT MANAGEMENT (EXTENDED)
// ============================================================================

/**
 * Update a project with a partial patch (merge).
 */
export function updateProject(
  state: AppState,
  projectId: string,
  patch: Partial<Project>
): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
  }
}

/**
 * Delete a project with backup.
 * Prompts user for confirmation, backs up tasks/milestones to CSV,
 * then dispatches DELETE_PROJECT action.
 *
 * Logic:
 * 1. Confirm deletion with user (with project name)
 * 2. Resolve task/milestone data:
 *    - If activeProject, use state.tasks/state.milestones
 *    - Otherwise, pull from state.savedProjects[projectId]
 * 3. Backup tasks/milestones to CSV export
 * 4. After backup resolves: dispatch DELETE_PROJECT action
 */
export async function deleteProjectWithBackup(
  state: AppState,
  dispatch: (action: { type: string; [key: string]: any }) => void,
  projectId: string
): Promise<void> {
  // Find the project to get its name
  const project = state.projects.find((p) => p.id === projectId)
  if (!project) {
    console.error('Project not found:', projectId)
    return
  }

  // Step 1: Confirm deletion
  if (!window.confirm(`Delete "${project.name}"? This backs up its tasks first.`)) {
    return
  }

  // Step 2: Resolve task/milestone data
  let tasks: Task[]
  let milestones: Milestone[]

  if (state.activeProjectId === projectId) {
    // Active project: use current state
    tasks = state.tasks
    milestones = state.milestones
  } else {
    // Inactive project: pull from savedProjects
    const savedState = state.savedProjects[projectId]
    if (savedState) {
      tasks = savedState.tasks
      milestones = savedState.milestones
    } else {
      // Project not found in savedProjects, use empty state
      tasks = []
      milestones = []
    }
  }

  // Step 3: Backup strategy
  try {
    exportTasksCsv(tasks, milestones, project.name)
    console.log('Project backed up to CSV')
  } catch (error) {
    console.error('CSV backup error:', error)
    // Continue to delete anyway (user already confirmed)
  }

  // Step 4: Delete the project via dispatch
  dispatch({ type: 'DELETE_PROJECT', projectId })
}

// ============================================================================
// SETTINGS & OVERLAYS
// ============================================================================

/**
 * Open the settings overlay.
 * Always resets to the General tab when opening.
 */
export function openSettings(state: AppState): AppState {
  return {
    ...state,
    settingsOpen: true,
    settingsTab: 'general',
  }
}

/**
 * Close the settings overlay.
 */
export function closeSettings(state: AppState): AppState {
  return {
    ...state,
    settingsOpen: false,
  }
}

/**
 * Clear Google auth for the active project (token is removed by drive-sync's
 * disconnect(), called by the REVOKE_GOOGLE_TOKEN handler in App.tsx before
 * this reducer case runs).
 */
export function clearProjectGoogleAuth(state: AppState): AppState {
  const authByProject = { ...state.authByProject }
  delete authByProject[state.activeProjectId]
  return {
    ...state,
    authByProject,
    googleBusy: false,
    googleStatus: undefined,
  }
}

/**
 * Set the active settings tab.
 */
export function setSettingsTab(state: AppState, tab: 'general' | 'projects'): AppState {
  return {
    ...state,
    settingsTab: tab,
  }
}
