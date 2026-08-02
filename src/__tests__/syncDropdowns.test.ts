import { describe, test, expect } from 'vitest'
import { appReducer } from '../lib/reducer'
import type { AppState } from '../lib/state'
import type { Task } from '../lib/types'

const mockState: AppState = {
  activeView: 'tasks',
  activeProjectId: 'p-1',
  projects: [
    {
      id: 'p-1',
      name: 'Project',
      lastSyncedSnapshot: null,
      lastSyncedAt: null,
    } as any,
  ],
  savedProjects: {},
  googleAccessToken: undefined,
  googleUserEmail: undefined,
  googleStatus: undefined,
  googleBusy: false,
  settingsOpen: false,
  settingsTab: 'general',
  tasks: [],
  milestones: [],
  expanded: {},
  filters: {},
  sortKey: 'startDate',
  sortDir: 'asc',
  columnWidths: {},
  customStatuses: ['Not Started'],
  customAssignees: ['Unassigned'],
  customCategories: [],
  newCommentText: '',
  depsFilterText: '',
  depsDraft: {},
  syncBusy: true,
  syncStatus: undefined,
  syncConflicts: [],
}

describe('dropdown options populate after spreadsheet sync', () => {
  test('SYNC_SUCCESS merges new status/assignee/category values from synced tasks into the custom lists', () => {
    const syncedTasks: Task[] = [
      {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Design',
        assignee: 'Alice',
        status: 'In Progress',
        estimate: 3,
        startDate: '2026-01-01',
        dependencies: [],
      } as unknown as Task,
    ]

    const newState = appReducer(mockState, {
      type: 'SYNC_SUCCESS',
      tasks: syncedTasks,
      milestones: [],
      projectId: 'p-1',
      snapshot: {},
      timestamp: Date.now(),
    })

    expect(newState.customStatuses).toContain('In Progress')
    expect(newState.customAssignees).toContain('Alice')
    expect(newState.customCategories).toContain('Design')
    // Pre-existing custom values should be preserved.
    expect(newState.customStatuses).toContain('Not Started')
    expect(newState.customAssignees).toContain('Unassigned')
  })
})
