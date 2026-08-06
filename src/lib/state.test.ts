import { describe, it, expect, beforeEach } from 'vitest'
import { moveTaskToPosition, addTask } from './state'
import { appReducer } from './reducer'
import type { Task, Milestone } from './types'
import type { AppState } from './state'

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    name: 'New Task',
    milestoneId: null,
    parentId: null,
    category: 'Product',
    assignee: 'Unassigned',
    status: 'Not Started',
    estimate: 3,
    startDate: '2026-08-01',
    progress: 0,
    order: 0,
    dependencies: [],
    comments: [],
    ...overrides,
  }
}

function makeMockState(overrides: Partial<AppState> = {}): AppState {
  return {
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
    ...overrides,
  }
}

describe('moveTaskToPosition', () => {
  let state: AppState

  beforeEach(() => {
    state = makeMockState({
      milestones: [{ id: 'm1', name: 'M1' }],
      tasks: [
        makeTask({ id: 't1', parentId: null, milestoneId: 'm1', order: 0 }),
        makeTask({ id: 't2', parentId: null, milestoneId: 'm1', order: 0 }),
        makeTask({ id: 't3', parentId: null, milestoneId: 'm1', order: 0 }),
      ],
    })
  })

  it('enters manual mode on first move', () => {
    expect(state.sortKey).not.toBe('manual')
    const result = moveTaskToPosition(state, 't1', 'm1', null, 't2', undefined, {})
    expect(result.sortKey).toBe('manual')
    expect(result.sortDir).toBe('asc')
  })

  it('changes moved task order when moving within same group', () => {
    const before = state.tasks[0].order
    const result = moveTaskToPosition(state, 't1', 'm1', null, 't2', 't3', {})
    expect(result.sortKey).toBe('manual')
    const movedTask = result.tasks.find((t) => t.id === 't1')
    expect(movedTask!.order).not.toBe(before)
    expect(movedTask!.order).toBeGreaterThan(0) // Should be backfilled
  })

  it('does not re-backfill already-backfilled groups', () => {
    // First move backfills
    let result = moveTaskToPosition(state, 't1', 'm1', null, undefined, 't2', {})
    const t2OrderAfterFirstMove = result.tasks.find((t) => t.id === 't2')!.order
    // Second move should not change t2's order
    result = moveTaskToPosition(result, 't3', 'm1', null, 't2', undefined, {})
    expect(result.tasks.find((t) => t.id === 't2')!.order).toBe(t2OrderAfterFirstMove)
  })

  it('propagates milestoneId through entire subtree on cross-group move', () => {
    const m2: Milestone = { id: 'm2', name: 'M2' }
    state.milestones.push(m2)
    // t2 is child of t1
    state.tasks[1].parentId = 't1'
    // t4 is child of t2
    state.tasks.push(makeTask({ id: 't4', parentId: 't2', milestoneId: 'm1', order: 0 }))

    const result = moveTaskToPosition(state, 't1', 'm2', null, undefined, undefined, {})
    expect(result.tasks.find((t) => t.id === 't1')!.milestoneId).toBe('m2')
    expect(result.tasks.find((t) => t.id === 't2')!.milestoneId).toBe('m2') // child
    expect(result.tasks.find((t) => t.id === 't4')!.milestoneId).toBe('m2') // grandchild
  })

  it('computes correct order between two backfilled neighbors', () => {
    // Setup with backfilled orders
    state.tasks[0].order = 1000
    state.tasks[1].order = 3000
    state.tasks[2].order = 5000
    state.sortKey = 'manual'

    const result = moveTaskToPosition(state, 't3', 'm1', null, 't1', 't2', {})
    const movedTask = result.tasks.find((t) => t.id === 't3')
    expect(movedTask!.order).toBeGreaterThan(1000)
    expect(movedTask!.order).toBeLessThan(3000)
  })

  it('handles move to after without before', () => {
    state.tasks[0].order = 1000
    state.tasks[1].order = 2000
    state.tasks[2].order = 3000
    state.sortKey = 'manual'

    // Move t1 to position with no before (making it last)
    const result = moveTaskToPosition(state, 't1', 'm1', null, 't3', undefined, {})
    const movedTask = result.tasks.find((t) => t.id === 't1')
    // When t3 is before the moved t1 and there's no after, order = 3000 + 1000 = 4000
    expect(movedTask!.order).toBeGreaterThan(3000)
  })

  it('handles move to before without after', () => {
    state.tasks[0].order = 1000
    state.tasks[1].order = 2000
    state.tasks[2].order = 3000
    state.sortKey = 'manual'

    // Move t3 to position before t1 (no after, so t3 becomes first)
    const result = moveTaskToPosition(state, 't3', 'm1', null, undefined, 't1', {})
    const movedTask = result.tasks.find((t) => t.id === 't3')
    // When there's no before and t1 is after, order = 1000 - 1000 = 0 (or computes to something less than 1000)
    expect(movedTask!.order).toBeLessThan(1000)
  })

  it('returns state unchanged if task not found', () => {
    const result = moveTaskToPosition(state, 'nonexistent', 'm1', null, undefined, undefined, {})
    expect(result).toBe(state)
  })

  it('handles subtree propagation with multiple levels', () => {
    const m2: Milestone = { id: 'm2', name: 'M2' }
    state.milestones.push(m2)
    // Create hierarchy: t1 > t2 > t4 > t5
    state.tasks[1].parentId = 't1'
    state.tasks.push(makeTask({ id: 't4', parentId: 't2', milestoneId: 'm1', order: 0 }))
    state.tasks.push(makeTask({ id: 't5', parentId: 't4', milestoneId: 'm1', order: 0 }))

    const result = moveTaskToPosition(state, 't1', 'm2', null, undefined, undefined, {})
    expect(result.tasks.find((t) => t.id === 't1')!.milestoneId).toBe('m2')
    expect(result.tasks.find((t) => t.id === 't2')!.milestoneId).toBe('m2')
    expect(result.tasks.find((t) => t.id === 't4')!.milestoneId).toBe('m2')
    expect(result.tasks.find((t) => t.id === 't5')!.milestoneId).toBe('m2')
  })
})

describe('addTask order-aware insertion', () => {
  let state: AppState

  beforeEach(() => {
    state = makeMockState({
      milestones: [{ id: 'm1', name: 'M1' }],
      selectedTaskId: undefined,
      tasks: [
        makeTask({ id: 't1', parentId: null, milestoneId: 'm1', order: 1000, name: 'T1' }),
        makeTask({ id: 't2', parentId: null, milestoneId: 'm1', order: 2000, name: 'T2' }),
      ],
    })
  })

  it('inserts order between anchor and next sibling when group backfilled', () => {
    state.selectedTaskId = 't1'
    const result = addTask(state, 'New Task')
    // Find the new task (should be inserted after t1)
    const newTask = result.tasks.find((t) => t.name === 'New Task')
    expect(newTask).toBeDefined()
    // When inserted after t1 (order 1000) and before t2 (order 2000), should be between them
    if (newTask) {
      expect(newTask.order).toBeGreaterThan(1000)
      expect(newTask.order).toBeLessThan(2000)
    }
  })

  it('leaves order 0 when group not backfilled', () => {
    state.tasks[0].order = 0
    state.tasks[1].order = 0
    state.selectedTaskId = 't1'
    const result = addTask(state, 'New Task')
    const newTask = result.tasks[result.tasks.length - 1]
    expect(newTask.order).toBe(0)
  })

  it('inherits properties from anchor task', () => {
    state.selectedTaskId = 't1'
    const result = addTask(state, 'New Task')
    const newTask = result.tasks[result.tasks.length - 1]
    expect(newTask.milestoneId).toBe('m1')
    expect(newTask.parentId).toBe(null)
  })

  it('uses defaults when no anchor', () => {
    state.selectedTaskId = undefined
    const result = addTask(state, 'New Task')
    const newTask = result.tasks[result.tasks.length - 1]
    expect(newTask.milestoneId).toBe('m1') // First milestone
    expect(newTask.parentId).toBe(null)
    expect(newTask.assignee).toBe('Unassigned')
    expect(newTask.status).toBe('Not Started')
    expect(newTask.estimate).toBe(3)
  })

  it('inserts new task after anchor in array', () => {
    state.selectedTaskId = 't1'
    const result = addTask(state, 'New Task')
    const anchorIdx = result.tasks.findIndex((t) => t.id === 't1')
    const newTaskIdx = result.tasks.length - 1
    // New task should be right after anchor (or close to it depending on implementation)
    expect(newTaskIdx).toBeGreaterThan(anchorIdx)
  })

  it('appends to end when no anchor and no backfill needed', () => {
    state.tasks[0].order = 0
    state.tasks[1].order = 0
    state.selectedTaskId = undefined
    const originalLength = state.tasks.length
    const result = addTask(state, 'New Task')
    expect(result.tasks.length).toBe(originalLength + 1)
    expect(result.tasks[result.tasks.length - 1].id).not.toBe('t1')
  })

  it('creates task with unique ID', () => {
    state.selectedTaskId = undefined
    const result1 = addTask(state, 'Task 1')
    const result2 = addTask(result1, 'Task 2')
    const ids = new Set(result2.tasks.map((t) => t.id))
    expect(ids.size).toBe(result2.tasks.length) // All unique
  })
})

describe('moveTaskToPosition via reducer', () => {
  it('dispatches through appReducer correctly', () => {
    let state = makeMockState({
      milestones: [{ id: 'm1', name: 'M1' }],
      tasks: [
        makeTask({ id: 't1', parentId: null, milestoneId: 'm1', order: 0 }),
        makeTask({ id: 't2', parentId: null, milestoneId: 'm1', order: 0 }),
      ],
    })

    state = appReducer(state, {
      type: 'MOVE_TASK_TO_POSITION',
      taskId: 't1',
      newMilestoneId: 'm1',
      newParentId: null,
      beforeTaskId: 't2',
      afterTaskId: undefined,
      displaySchedules: {},
    })

    expect(state.sortKey).toBe('manual')
    expect(state.tasks.find((t) => t.id === 't1')!.order).toBeGreaterThan(0)
  })
})
