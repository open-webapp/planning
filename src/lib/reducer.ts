import type { AppState } from './state'
import * as StateActions from './state'

export interface Action {
  type: string
  [key: string]: any
}

/**
 * Reducer function that handles all state mutations.
 * Converts action objects to state transformations.
 */
export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    // Direct state replacement (for AppState objects passed to dispatch)
    case '__SET_STATE':
      return action.newState

    // Navigation
    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view }

    // Task CRUD
    case 'ADD_TASK':
      return StateActions.addTask(state, action.name)

    case 'UPDATE_TASK':
      return StateActions.updateTask(state, action.taskId, action.patch)

    case 'DELETE_TASK':
      return StateActions.deleteTask(state, action.taskId)

    case 'ADD_SUBTASK':
      return StateActions.addSubtask(state, action.parentTaskId, action.name)

    // Milestone CRUD
    case 'ADD_MILESTONE':
      return StateActions.addMilestone(state, action.name)

    case 'ADD_MILESTONE_AND_MOVE_TASK':
      return StateActions.addMilestoneAndMoveTask(state, action.taskId, action.milestoneName)

    case 'UPDATE_MILESTONE':
      return StateActions.updateMilestone(state, action.milestoneId, action.patch)

    // Tree operations
    case 'TOGGLE_EXPAND':
      return StateActions.toggleExpand(state, action.taskId)

    case 'INDENT_TASK':
      return StateActions.indentTask(state, action.taskId)

    case 'OUTDENT_TASK':
      return StateActions.outdentTask(state, action.taskId)

    case 'MOVE_TASK_TO_POSITION':
      return StateActions.moveTaskToPosition(
        state,
        action.taskId,
        action.newMilestoneId,
        action.newParentId,
        action.beforeTaskId,
        action.afterTaskId,
        action.displaySchedules
      )

    // Filters & Sorting
    case 'SET_FILTER':
      return StateActions.setFilter(state, action.filterKey, action.value)

    case 'TOGGLE_SORT':
      return StateActions.toggleSort(state, action.sortKey)

    // Column resize
    case 'SET_COLUMN_WIDTH':
      return StateActions.setColumnWidth(state, action.columnName, action.width)

    // Overlays & Selection
    case 'OPEN_COMMENTS_OVERLAY':
      return StateActions.openCommentsOverlay(state, action.taskId)

    case 'CLOSE_COMMENTS_OVERLAY':
      return StateActions.closeCommentsOverlay(state)

    case 'OPEN_DEPS_EDITOR':
      return StateActions.openDepsEditor(state, action.taskId)

    case 'CLOSE_DEPS_EDITOR':
      return StateActions.closeDepsEditor(state)

    case 'SELECT_TASK':
      return StateActions.selectTask(state, action.taskId)

    case 'CLOSE_DETAIL':
      return StateActions.closeDetail(state)

    // Dependencies
    case 'ADD_DEPENDENCY':
      return StateActions.addDependency(state, action.taskId, action.depId)

    case 'REMOVE_DEPENDENCY':
      return StateActions.removeDependency(state, action.taskId, action.depId)

    case 'TOGGLE_DEPENDENCY':
      return StateActions.toggleDependency(state, action.taskId, action.depId)

    // Comments
    case 'ADD_COMMENT':
      return StateActions.addComment(state, action.taskId, action.text, action.author)

    // Custom values
    case 'ADD_CUSTOM_VALUE':
      return StateActions.handleValueSelect(state, action.fieldName, action.value)

    // Project management
    case 'CREATE_PROJECT':
      return StateActions.createProject(state, action.name, action.color)

    case 'SWITCH_PROJECT':
      return StateActions.switchProject(state, action.projectId)

    case 'RENAME_PROJECT':
      return StateActions.renameProject(state, action.projectId, action.newName)

    case 'DELETE_PROJECT':
      return StateActions.deleteProject(state, action.projectId)

    case 'UPDATE_PROJECT':
      return StateActions.updateProject(state, action.projectId, action.patch)

    // Settings & Overlays
    case 'OPEN_SETTINGS':
      return StateActions.openSettings(state)

    case 'CLOSE_SETTINGS':
      return StateActions.closeSettings(state)

    case 'SET_SETTINGS_TAB':
      return StateActions.setSettingsTab(state, action.tab)

    // Google Auth (per-project)
    case 'HYDRATE_AUTH_BY_PROJECT':
      return { ...state, authByProject: action.authByProject }

    case 'REQUEST_GOOGLE_TOKEN':
      return { ...state, googleBusy: true, googleStatus: 'Connecting...' }

    case 'SET_GOOGLE_TOKEN':
      return {
        ...StateActions.setProjectGoogleAuth(state, state.activeProjectId, action.email),
        googleStatus: undefined,
        googleBusy: false,
      }

    case 'REVOKE_GOOGLE_TOKEN':
      return StateActions.clearProjectGoogleAuth(state)

    case 'SYNC_STARTED':
      return { ...state, syncBusy: true, syncStatus: undefined, syncError: undefined, syncConflicts: [] }

    case 'SYNC_CONFLICTS_DETECTED':
      return {
        ...state,
        syncBusy: false,
        syncConflicts: action.conflicts,
        syncPendingMerge: action.merged,
        settingsOpen: false,
      }

    case 'SYNC_RESOLVE_CONFLICTS':
      return {
        ...state,
        syncBusy: true,
        syncConflicts: [],
        syncPendingMerge: undefined,
      }

    case 'CLEAR_SYNC_CONFLICTS':
      return {
        ...state,
        syncConflicts: [],
        syncPendingMerge: undefined,
      }

    case 'SYNC_SUCCESS': {
      const syncTime = new Date(action.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
      return {
        ...state,
        ...StateActions.mergeCustomValuesFromTasks(state, action.tasks),
        syncBusy: false,
        syncStatus: `Synced at ${syncTime}`,
        syncError: undefined,
        tasks: action.tasks,
        milestones: action.milestones,
        syncConflicts: [],
        syncPendingMerge: undefined,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                lastSyncedSnapshot: action.snapshot,
                lastSyncedAt: action.timestamp,
              }
            : p
        ),
      }
    }

    case 'SYNC_ERROR':
      return { ...state, syncBusy: false, syncStatus: action.error, syncError: action.rawError }

    case 'CLEAR_SYNC_STATUS':
      return { ...state, syncStatus: undefined, syncError: undefined }

    case 'GOOGLE_TOKEN_ERROR':
      return { ...state, googleBusy: false, googleStatus: action.error }

    case 'GOOGLE_ERROR':
      return { ...state, googleBusy: false, googleStatus: action.error }

    // Comment & Deps text state
    case 'UPDATE_NEW_COMMENT_TEXT':
      return { ...state, newCommentText: action.text }

    case 'UPDATE_DEPS_FILTER_TEXT':
      return { ...state, depsFilterText: action.text }

    default:
      return state
  }
}
