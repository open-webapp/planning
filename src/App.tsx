import { useEffect, useReducer, useCallback, useRef } from 'react'
import type { AppState } from './lib/state'
import {
  openSettings,
  loadPersistedApp,
  savePersistedApp,
  deleteProjectWithBackup,
} from './lib/state'
import { appReducer } from './lib/reducer'
import { seedData } from './lib/seed'
import { computeDerivedData } from './lib/selectors'
import { computeBaseSchedules, computeDisplaySchedules, computeProgressMap, computeCriticalSet } from './lib/scheduling'
import AppShell from './components/AppShell'
import Toolbar from './components/Toolbar'
import DashboardView from './views/DashboardView'
import TasksView from './views/TasksView'
import MilestonesView from './views/MilestonesView'
import TimelineView from './views/TimelineView'
import {
  TaskDetailsOverlay,
  DepsPickerOverlay,
  SettingsOverlay,
  SyncConflictOverlay,
  SyncToast,
} from './overlays'
import { requestAccessToken, revokeToken, pushToSheet, pullFromSheet } from './lib/googleAuth'
import { syncNow } from './lib/sync'
import { exportTasksCsv } from './lib/csv'

/**
 * Initialize app state from localStorage or seed data
 */
function initializeState(): AppState {
  const persisted = loadPersistedApp()
  if (persisted && persisted.projects && persisted.projects.length > 0) {
    return {
      activeView: 'dashboard',
      activeProjectId: persisted.activeProjectId || '',
      projects: persisted.projects || [],
      savedProjects: persisted.savedProjects || {},
      googleAccessToken: persisted.googleAccessToken,
      googleUserEmail: persisted.googleUserEmail,
      googleStatus: persisted.googleStatus,
      googleBusy: false,
      syncBusy: false,
      syncConflicts: [],
      settingsOpen: false,
      settingsTab: 'general',
      tasks: persisted.tasks || [],
      milestones: persisted.milestones || [],
      expanded: persisted.expanded || {},
      filters: persisted.filters || {},
      sortKey: persisted.sortKey || 'startDate',
      sortDir: persisted.sortDir || 'asc',
      columnWidths: persisted.columnWidths || {},
      customStatuses: persisted.customStatuses || [],
      customAssignees: persisted.customAssignees || [],
      customCategories: persisted.customCategories || [],
      newCommentText: '',
      depsFilterText: '',
      depsDraft: {},
    }
  }

  // Initialize with seed data
  const { tasks, milestones } = seedData()
  const projectId = 'p-default'

  return {
    activeView: 'dashboard',
    activeProjectId: projectId,
    projects: [
      {
        id: projectId,
        name: 'Main Project',
        color: 'netskopeBlue',
        spreadsheetId: null,
        lastSyncedSnapshot: null,
        lastSyncedAt: null,
      },
    ],
    savedProjects: {},
    googleAccessToken: undefined,
    googleUserEmail: undefined,
    googleStatus: undefined,
    googleBusy: false,
    syncBusy: false,
    syncConflicts: [],
    settingsOpen: false,
    settingsTab: 'general',
    tasks,
    milestones,
    expanded: {},
    filters: {},
    sortKey: 'startDate',
    sortDir: 'asc',
    columnWidths: {},
    customStatuses: [],
    customAssignees: [],
    customCategories: [],
    newCommentText: '',
    depsFilterText: '',
    depsDraft: {},
  }
}

type DispatchAction = any

/**
 * Custom dispatch wrapper that handles async actions and AppState objects
 */
function useAppDispatch(baseState: AppState, baseDispatch: React.Dispatch<DispatchAction>) {
  const stateRef = useRef(baseState)

  // Update ref when state changes
  useEffect(() => {
    stateRef.current = baseState
  }, [baseState])

  return useCallback((action: DispatchAction) => {
    // If action is an AppState object (no type property), replace state directly
    if (action && typeof action === 'object' && !('type' in action)) {
      // This is an AppState object, set it directly
      baseDispatch({ type: '__SET_STATE', newState: action })
      return
    }

    // Handle async actions before dispatching to reducer
    if (action.type === 'REQUEST_GOOGLE_TOKEN') {
      requestAccessToken(
        ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/userinfo.email'],
        async (token: string) => {
          try {
            // Fetch user info to get email
            const userInfoResponse = await fetch(
              'https://www.googleapis.com/oauth2/v3/userinfo',
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            )
            if (userInfoResponse.ok) {
              const userInfo = await userInfoResponse.json()
              baseDispatch({
                type: 'SET_GOOGLE_TOKEN',
                token,
                email: userInfo.email,
              })
            } else {
              baseDispatch({
                type: 'GOOGLE_TOKEN_ERROR',
                error: 'Failed to fetch user info',
              })
            }
          } catch (error) {
            console.error('Error fetching user info:', error)
            baseDispatch({
              type: 'GOOGLE_TOKEN_ERROR',
              error: 'Failed to fetch user info',
            })
          }
        }
      ).catch((error) => {
        console.error('Token request failed:', error)
        baseDispatch({
          type: 'GOOGLE_TOKEN_ERROR',
          error: error.message,
        })
      })
    } else if (action.type === 'REVOKE_GOOGLE_TOKEN') {
      const token = stateRef.current.googleAccessToken
      if (token) {
        revokeToken()
          .then(() => {
            baseDispatch(action)
          })
          .catch((error) => {
            console.error('Token revocation failed:', error)
            baseDispatch(action)
          })
      } else {
        baseDispatch(action)
      }
    } else if (action.type === 'SYNC_STARTED' && action.operation === 'backup') {
      const state = stateRef.current
      const activeProject = state.projects.find((p) => p.id === state.activeProjectId)

      if (!state.googleAccessToken || !activeProject?.spreadsheetId) {
        baseDispatch({
          type: 'SYNC_ERROR',
          error: 'Not connected or no spreadsheet ID',
        })
        return
      }

      // Dispatch to reducer to set syncBusy
      baseDispatch(action)

      pushToSheet(activeProject.spreadsheetId, state.googleAccessToken, state.tasks, state.milestones)
        .then((result) => {
          if (result.success) {
            baseDispatch({
              type: 'SYNC_SUCCESS',
              message: result.message,
              projectId: state.activeProjectId,
              tasks: state.tasks,
              milestones: state.milestones,
              timestamp: new Date().toISOString(),
            })
          } else {
            baseDispatch({
              type: 'SYNC_ERROR',
              error: result.message,
            })
          }
        })
        .catch((error) => {
          console.error('Backup failed:', error)
          baseDispatch({
            type: 'SYNC_ERROR',
            error: error.message || 'Backup failed',
          })
        })
    } else if (action.type === 'SYNC_STARTED' && action.operation === 'restore') {
      const state = stateRef.current
      const activeProject = state.projects.find((p) => p.id === state.activeProjectId)

      if (!state.googleAccessToken || !activeProject?.spreadsheetId) {
        baseDispatch({
          type: 'SYNC_ERROR',
          error: 'Not connected or no spreadsheet ID',
        })
        return
      }

      // Dispatch to reducer to set syncBusy
      baseDispatch(action)

      pullFromSheet(activeProject.spreadsheetId, state.googleAccessToken, state.milestones)
        .then((result) => {
          if (result === null) {
            baseDispatch({
              type: 'SYNC_ERROR',
              error: 'Sheet or tabs not found. Have you synced yet?',
            })
          } else {
            baseDispatch({
              type: 'SYNC_SUCCESS',
              tasks: result.tasks,
              milestones: result.milestones,
              projectId: state.activeProjectId,
              message: 'Restore complete',
              timestamp: new Date().toISOString(),
            })
          }
        })
        .catch((error) => {
          console.error('Restore failed:', error)
          baseDispatch({
            type: 'SYNC_ERROR',
            error: error.message || 'Restore failed',
          })
        })
    } else {
      baseDispatch(action)
    }
  }, [baseDispatch])
}

function App() {
  const [state, baseDispatch] = useReducer(appReducer, undefined, initializeState)
  const dispatch = useAppDispatch(state, baseDispatch)

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    savePersistedApp(state)
  }, [state])

  // Compute scheduling and derived data
  const baseSchedules = computeBaseSchedules(state.tasks)
  const displaySchedules = computeDisplaySchedules(state.tasks, baseSchedules)
  const progressMap = computeProgressMap(state.tasks)
  const criticalSet = computeCriticalSet(state.tasks, baseSchedules)

  const derivedState = computeDerivedData(
    state.tasks,
    state.milestones,
    state.expanded,
    state.sortKey,
    state.sortDir,
    state.filters,
    displaySchedules,
    progressMap
  )

  const handleViewChange = (view: 'dashboard' | 'tasks' | 'milestones' | 'timeline') => {
    baseDispatch({ type: 'SET_ACTIVE_VIEW', view })
  }

  const handleSettingsClick = () => {
    dispatch(openSettings(state))
  }

  const handleSyncClick = () => {
    syncNow(state, dispatch)
  }

  const handleExportCsv = () => {
    const activeProject = state.projects.find((p) => p.id === state.activeProjectId)
    exportTasksCsv(state.tasks, state.milestones, activeProject?.name || 'project')
  }

  const handleDeleteProject = (projectId: string) => {
    return deleteProjectWithBackup(state, dispatch, projectId)
  }

  const handleAddTask = () => {
    baseDispatch({ type: 'ADD_TASK', name: 'Unnamed' })
  }

  const renderView = () => {
    switch (state.activeView) {
      case 'dashboard':
        return <DashboardView derivedData={derivedState} state={state} dispatch={dispatch} />
      case 'tasks':
        return (
          <TasksView
            derivedData={derivedState}
            state={state}
            dispatch={dispatch}
            displaySchedules={displaySchedules}
            progressMap={progressMap}
            criticalSet={criticalSet}
          />
        )
      case 'milestones':
        return <MilestonesView derivedData={derivedState} state={state} dispatch={dispatch} />
      case 'timeline':
        return (
          <TimelineView
            derivedData={derivedState}
            state={state}
            dispatch={dispatch}
            displaySchedules={displaySchedules}
            criticalSet={criticalSet}
          />
        )
      default:
        return <div>View not found</div>
    }
  }

  return (
    <AppShell
      state={state}
      dispatch={dispatch}
      onViewChange={handleViewChange}
      onSettingsClick={handleSettingsClick}
      onSyncClick={handleSyncClick}
      onExportCsv={handleExportCsv}
      toolbar={<Toolbar state={state} dispatch={dispatch} onAddTask={handleAddTask} />}
    >
      {renderView()}

      {/* Overlays */}
      <TaskDetailsOverlay
        state={state}
        dispatch={dispatch}
      />
      <DepsPickerOverlay
        state={state}
        dispatch={dispatch}
      />
      <SyncConflictOverlay
        state={state}
        dispatch={dispatch}
      />
      <SettingsOverlay
        state={state}
        dispatch={dispatch}
        onDeleteProject={handleDeleteProject}
      />
      <SyncToast
        state={state}
        dispatch={dispatch}
      />
    </AppShell>
  )
}

export default App
