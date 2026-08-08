import { describe, test, expect, beforeEach } from 'vitest'
import { openSettings, closeSettings, loadPersistedApp, APP_STORAGE_KEY } from '../lib/state'
import { appReducer } from '../lib/reducer'
import type { AppState } from '../lib/state'

// Mock AppState
const mockState: AppState = {
  activeView: 'tasks',
  activeProjectId: 'p-1',
  projects: [
    {
      id: 'p-1',
      name: 'Test Project',
      color: 'netskopeBlue',
      driveFileId: undefined,
      lastSyncedSnapshot: null,
      lastSyncedAt: null,
    },
  ],
  savedProjects: {},
  googleBusy: false,
  authByProject: {},
  settingsOpen: false,
  settingsTab: 'general',
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
  newCommentText: '',
  depsFilterText: '',
  depsDraft: {},
  syncBusy: false,
  syncStatus: undefined,
  syncConflicts: [],
}

describe('Settings functionality', () => {
  test('openSettings should set settingsOpen to true', () => {
    const newState = openSettings(mockState)
    expect(newState.settingsOpen).toBe(true)
  })

  test('closeSettings should set settingsOpen to false', () => {
    const openState = { ...mockState, settingsOpen: true }
    const newState = closeSettings(openState)
    expect(newState.settingsOpen).toBe(false)
  })

  test('reducer should handle __SET_STATE action with AppState', () => {
    const newAppState = { ...mockState, settingsOpen: true }
    const result = appReducer(mockState, {
      type: '__SET_STATE',
      newState: newAppState,
    })
    expect(result.settingsOpen).toBe(true)
  })

  test('reducer should handle OPEN_SETTINGS action', () => {
    const result = appReducer(mockState, { type: 'OPEN_SETTINGS' })
    expect(result.settingsOpen).toBe(true)
  })

  test('reducer should handle CLOSE_SETTINGS action', () => {
    const openState = { ...mockState, settingsOpen: true }
    const result = appReducer(openState, { type: 'CLOSE_SETTINGS' })
    expect(result.settingsOpen).toBe(false)
  })

  test('openSettings should reset settingsTab to general', () => {
    const stateOnProjects = { ...mockState, settingsTab: 'projects' as const }
    const newState = openSettings(stateOnProjects)
    expect(newState.settingsTab).toBe('general')
  })

  test('reducer should handle OPEN_SETTINGS and reset tab to general', () => {
    const stateOnProjects = { ...mockState, settingsOpen: true, settingsTab: 'projects' as const }
    const result = appReducer(stateOnProjects, { type: 'OPEN_SETTINGS' })
    expect(result.settingsOpen).toBe(true)
    expect(result.settingsTab).toBe('general')
  })

  test('reducer should handle SET_SETTINGS_TAB action', () => {
    const result = appReducer(mockState, { type: 'SET_SETTINGS_TAB', tab: 'projects' })
    expect(result.settingsTab).toBe('projects')
  })
})

describe('loadPersistedApp boot cleanup', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    }
  })

  test('strips googleAccessToken/googleUserEmail from old-shape persisted projects', () => {
    const oldShapeBlob = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Legacy Project',
          color: 'netskopeBlue',
          driveFileId: undefined,
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
          googleAccessToken: 'stale-token',
          googleUserEmail: 'stale@example.com',
        },
      ],
      savedProjects: {},
    }
    ;(globalThis as any).localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(oldShapeBlob))

    const loaded = loadPersistedApp()

    expect(loaded?.projects?.[0]).not.toHaveProperty('googleAccessToken')
    expect(loaded?.projects?.[0]).not.toHaveProperty('googleUserEmail')
    expect(loaded?.projects?.[0]).toMatchObject({ id: 'p-1', name: 'Legacy Project' })

    // The cleaned blob should have been rewritten to storage...
    const rewritten = JSON.parse((globalThis as any).localStorage.getItem(APP_STORAGE_KEY))
    expect(rewritten.projects[0]).not.toHaveProperty('googleAccessToken')
    expect(rewritten.projects[0]).not.toHaveProperty('googleUserEmail')

    // ...and running it again is a no-op (idempotent): no stale fields left to strip,
    // and the second load matches the first exactly.
    const loadedAgain = loadPersistedApp()
    expect(loadedAgain).toEqual(loaded)
  })
})
