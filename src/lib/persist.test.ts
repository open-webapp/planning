import { describe, it, expect, beforeEach } from 'vitest'
import { savePersistedApp, loadPersistedApp } from './state'

describe('refresh repro', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }
  })

  it('persists savedProjects (inactive project data) across reload', () => {
    const state: any = {
      activeView: 'tasks',
      activeProjectId: 'p1',
      projects: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      savedProjects: { p2: { tasks: [{ id: 't1', name: 'inactive task' }] } },
      tasks: [{ id: 't2', name: 'active task' }],
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

    savePersistedApp(state)
    const loaded = loadPersistedApp()

    expect((loaded as any)?.savedProjects).toEqual(state.savedProjects)
  })
})
