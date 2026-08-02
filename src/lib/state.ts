import type { Task, Milestone, Project, Comment, SyncConflict } from './types'
import { uid } from './seed'
import { TODAY } from './dates'
import { pushToSheet } from './googleAuth'
import { exportTasksCsv } from './csv'

export interface AppState {
  // Navigation & Project Management
  activeView: 'dashboard' | 'tasks' | 'milestones' | 'timeline'
  activeProjectId: string
  projects: Project[]
  savedProjects: { [projectId: string]: ProjectState } // per-project snapshots for inactive projects

  // Google Auth & Backup
  googleClientId?: string // optional, from env (decision 5/6)
  googleAccessToken?: string
  googleUserEmail?: string
  googleStatus?: string // 'connected' | 'disconnected'
  googleBusy: boolean
  lastSyncedAt?: string // project-level, but tracked in app state too

  // Sync State
  syncBusy: boolean // replaces conditionally reusing googleBusy
  syncStatus?: string // drives toast message, e.g. "Synced at 3:45 PM" or error string
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
  // Add global state fields
  snap.projects = state.projects
  snap.activeProjectId = state.activeProjectId
  snap.activeView = state.activeView
  snap.googleAccessToken = state.googleAccessToken
  snap.googleUserEmail = state.googleUserEmail
  snap.googleStatus = state.googleStatus
  return snap
}

// localStorage key for persisting app state
export const APP_STORAGE_KEY = 'pma_app_state_v1'

// Load persisted app state from localStorage
export function loadPersistedApp(): Partial<AppState> | null {
  try {
    const stored = localStorage.getItem(APP_STORAGE_KEY)
    if (!stored) {
      return null
    }
    return JSON.parse(stored) as Partial<AppState>
  } catch (error) {
    console.error('Failed to load persisted app state:', error)
    return null
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
 * and resets activeView to 'dashboard'.
 */
export function switchProject(state: AppState, projectId: string): AppState {
  // If switching to the same project, just reset view
  if (projectId === state.activeProjectId) {
    return {
      ...state,
      activeView: 'dashboard',
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
    activeView: 'dashboard',
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
    spreadsheetId: null,
    lastSyncedSnapshot: null,
    lastSyncedAt: null,
  }

  return {
    ...state,
    projects: [...state.projects, newProject],
    savedProjects,
    activeProjectId: projectId,
    ...emptyProjectState(),
    activeView: 'dashboard',
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
      activeView: 'dashboard',
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

  const newTasks = tasks.map((x) =>
    x.id === taskId ? { ...x, parentId: prev!.id, milestoneId: prev!.milestoneId } : x
  )

  return {
    ...state,
    tasks: newTasks,
    expanded: { ...state.expanded, [prev.id]: true },
  }
}

/**
 * Outdent a task (remove parent) and re-splice after its former parent's last child.
 */
export function outdentTask(state: AppState, taskId: string): AppState {
  const tasks = state.tasks
  const t = tasks.find((x) => x.id === taskId)
  if (!t || !t.parentId) return state

  const parentId = t.parentId

  // Remove parent from the task
  const promoted = tasks.map((x) => (x.id === taskId ? { ...x, parentId: null } : x))

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
 * Prompts user for confirmation, backs up tasks/milestones to Google Sheets or CSV,
 * then dispatches DELETE_PROJECT action.
 *
 * Logic:
 * 1. Confirm deletion with user (with project name)
 * 2. Resolve task/milestone data:
 *    - If activeProject, use state.tasks/state.milestones
 *    - Otherwise, pull from state.savedProjects[projectId]
 * 3. Backup:
 *    - If googleAccessToken + spreadsheetId: call pushToSheet
 *    - On failure or no token/id: fall back to exportTasksCsv
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
  let backupSucceeded = false

  if (state.googleAccessToken && project.spreadsheetId) {
    // Try Google Sheets backup first
    try {
      const result = await pushToSheet(project.spreadsheetId, state.googleAccessToken, tasks, milestones)
      if (result.success) {
        backupSucceeded = true
        console.log('Project backed up to Google Sheets:', result.message)
      } else {
        console.warn('Google Sheets backup failed:', result.message)
      }
    } catch (error) {
      console.warn('Google Sheets backup error:', error)
    }
  }

  // If Google Sheets backup failed or no token/spreadsheetId, fall back to CSV
  if (!backupSucceeded) {
    try {
      exportTasksCsv(tasks, milestones, project.name)
      console.log('Project backed up to CSV')
    } catch (error) {
      console.error('CSV backup error:', error)
      // Continue to delete anyway (user already confirmed)
    }
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
 * Revoke Google token and clear auth state.
 */
export function revokeGoogleToken(state: AppState): AppState {
  return {
    ...state,
    googleAccessToken: undefined,
    googleUserEmail: undefined,
    googleStatus: 'disconnected',
    googleBusy: false,
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
