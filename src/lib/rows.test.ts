import { describe, it, expect } from 'vitest'
import { computeRowMap, taskMatchesFilters, filterTasksByFilters } from './rows'
import type { Task } from './types'
import type { TaskFilters } from './rows'

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

describe('taskMatchesFilters', () => {
  describe('empty filters', () => {
    it('matches all tasks when filters are empty', () => {
      const task = makeTask({ id: 't1', status: 'In Progress', category: 'Backend' })
      expect(taskMatchesFilters(task, {})).toBe(true)
    })

    it('matches all tasks when filters object is empty', () => {
      const task = makeTask({ id: 't1' })
      const filters: TaskFilters = {}
      expect(taskMatchesFilters(task, filters)).toBe(true)
    })
  })

  describe('status filter', () => {
    it('filters by exact status match', () => {
      const task = makeTask({ id: 't1', status: 'In Progress' })
      expect(taskMatchesFilters(task, { status: 'In Progress' })).toBe(true)
      expect(taskMatchesFilters(task, { status: 'Not Started' })).toBe(false)
    })

    it('treats "All" as no-op for status', () => {
      const task = makeTask({ id: 't1', status: 'Not Started' })
      expect(taskMatchesFilters(task, { status: 'All' })).toBe(true)
    })
  })

  describe('category filter', () => {
    it('filters by exact category match', () => {
      const task = makeTask({ id: 't1', category: 'Backend' })
      expect(taskMatchesFilters(task, { category: 'Backend' })).toBe(true)
      expect(taskMatchesFilters(task, { category: 'Frontend' })).toBe(false)
    })

    it('treats "All" as no-op for category', () => {
      const task = makeTask({ id: 't1', category: 'Design' })
      expect(taskMatchesFilters(task, { category: 'All' })).toBe(true)
    })
  })

  describe('assignee filter', () => {
    it('filters by exact assignee match', () => {
      const task = makeTask({ id: 't1', assignee: 'Alice' })
      expect(taskMatchesFilters(task, { assignee: 'Alice' })).toBe(true)
      expect(taskMatchesFilters(task, { assignee: 'Bob' })).toBe(false)
    })

    it('treats "All" as no-op for assignee', () => {
      const task = makeTask({ id: 't1', assignee: 'Charlie' })
      expect(taskMatchesFilters(task, { assignee: 'All' })).toBe(true)
    })
  })

  describe('milestone filter', () => {
    it('filters by exact milestone match', () => {
      const task = makeTask({ id: 't1', milestoneId: 'm1' })
      expect(taskMatchesFilters(task, { milestone: 'm1' })).toBe(true)
      expect(taskMatchesFilters(task, { milestone: 'm2' })).toBe(false)
    })

    it('treats "All" as no-op for milestone', () => {
      const task = makeTask({ id: 't1', milestoneId: 'm1' })
      expect(taskMatchesFilters(task, { milestone: 'All' })).toBe(true)
    })
  })

  describe('search filter', () => {
    it('filters by substring search (case-insensitive)', () => {
      const task = makeTask({ id: 't1', name: 'Build Authentication System' })
      expect(taskMatchesFilters(task, { search: 'Auth' })).toBe(true)
      expect(taskMatchesFilters(task, { search: 'auth' })).toBe(true)
      expect(taskMatchesFilters(task, { search: 'Build' })).toBe(true)
      expect(taskMatchesFilters(task, { search: 'Nonexistent' })).toBe(false)
    })

    it('treats empty/whitespace search as no-op', () => {
      const task = makeTask({ id: 't1', name: 'Some Task' })
      expect(taskMatchesFilters(task, { search: '' })).toBe(true)
      expect(taskMatchesFilters(task, { search: '   ' })).toBe(true)
    })

    it('performs case-insensitive search', () => {
      const task = makeTask({ id: 't1', name: 'Create Dashboard' })
      expect(taskMatchesFilters(task, { search: 'DASHBOARD' })).toBe(true)
      expect(taskMatchesFilters(task, { search: 'dashboard' })).toBe(true)
      expect(taskMatchesFilters(task, { search: 'Dashboard' })).toBe(true)
    })
  })

  describe('combined filters', () => {
    it('ANDs multiple filters together', () => {
      const task = makeTask({
        id: 't1',
        status: 'In Progress',
        category: 'Backend',
        assignee: 'Alice',
      })
      // All match
      expect(
        taskMatchesFilters(task, {
          status: 'In Progress',
          category: 'Backend',
          assignee: 'Alice',
        })
      ).toBe(true)
      // One fails
      expect(
        taskMatchesFilters(task, {
          status: 'In Progress',
          category: 'Backend',
          assignee: 'Bob',
        })
      ).toBe(false)
      // Multiple fail
      expect(
        taskMatchesFilters(task, {
          status: 'Not Started',
          category: 'Frontend',
          assignee: 'Bob',
        })
      ).toBe(false)
    })

    it('handles "All" values correctly in combined filters', () => {
      const task = makeTask({
        id: 't1',
        status: 'In Progress',
        category: 'Backend',
      })
      // "All" treated as no-op, other filter matches
      expect(
        taskMatchesFilters(task, {
          status: 'All',
          category: 'Backend',
        })
      ).toBe(true)
      // "All" treated as no-op, other filter doesn't match
      expect(
        taskMatchesFilters(task, {
          status: 'All',
          category: 'Frontend',
        })
      ).toBe(false)
    })

    it('combines status, category, assignee, milestone, and search', () => {
      const task = makeTask({
        id: 't1',
        name: 'Implement Authentication',
        status: 'In Progress',
        category: 'Backend',
        assignee: 'Alice',
        milestoneId: 'm1',
      })
      expect(
        taskMatchesFilters(task, {
          status: 'In Progress',
          category: 'Backend',
          assignee: 'Alice',
          milestone: 'm1',
          search: 'Auth',
        })
      ).toBe(true)
      // Fails on search
      expect(
        taskMatchesFilters(task, {
          status: 'In Progress',
          category: 'Backend',
          assignee: 'Alice',
          milestone: 'm1',
          search: 'Nonexistent',
        })
      ).toBe(false)
    })
  })
})

describe('filterTasksByFilters', () => {
  it('returns empty array for empty task list', () => {
    const result = filterTasksByFilters([], { status: 'In Progress' })
    expect(result).toEqual([])
  })

  it('returns all tasks when filters are empty', () => {
    const tasks = [
      makeTask({ id: 't1' }),
      makeTask({ id: 't2' }),
      makeTask({ id: 't3' }),
    ]
    const result = filterTasksByFilters(tasks, {})
    expect(result).toEqual(tasks)
  })

  it('filters tasks by status', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'In Progress' }),
      makeTask({ id: 't2', status: 'Not Started' }),
      makeTask({ id: 't3', status: 'In Progress' }),
    ]
    const result = filterTasksByFilters(tasks, { status: 'In Progress' })
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.id)).toEqual(['t1', 't3'])
  })

  it('filters tasks by multiple criteria', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'In Progress', assignee: 'Alice' }),
      makeTask({ id: 't2', status: 'In Progress', assignee: 'Bob' }),
      makeTask({ id: 't3', status: 'Not Started', assignee: 'Alice' }),
    ]
    const result = filterTasksByFilters(tasks, {
      status: 'In Progress',
      assignee: 'Alice',
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('returns flat list (not hierarchical)', () => {
    const tasks = [
      makeTask({ id: 't1', parentId: null }),
      makeTask({ id: 't2', parentId: 't1' }),
      makeTask({ id: 't3', parentId: 't2' }),
    ]
    const result = filterTasksByFilters(tasks, {})
    expect(result).toHaveLength(3)
    // Flat list returned, no tree structure
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('computeRowMap', () => {
  it('shows a task with no milestone in a project with zero milestones', () => {
    const tasks = [makeTask({ id: 't1', milestoneId: null })]
    const result = computeRowMap(tasks, [], {}, 'startDate', 'asc', {}, {})

    expect(result.rowNumberMap['t1']).toBeDefined()
    expect(result.visibleRows.some((r) => r.id === 't1' && r.type === 'task')).toBe(true)
  })

  it('still shows a task whose milestoneId does not match any existing milestone', () => {
    const tasks = [makeTask({ id: 't1', milestoneId: 'stale-milestone' })]
    const result = computeRowMap(tasks, [{ id: 'm1', name: 'M1' }], {}, 'startDate', 'asc', {}, {})

    expect(result.rowNumberMap['t1']).toBeDefined()
  })

  it('filters tasks using TaskFilters in computeRowMap', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'In Progress', milestoneId: 'm1' }),
      makeTask({ id: 't2', status: 'Not Started', milestoneId: 'm1' }),
    ]
    const milestones = [{ id: 'm1', name: 'M1' }]
    const result = computeRowMap(tasks, milestones, {}, 'startDate', 'asc', {}, { status: 'In Progress' })

    expect(result.rowNumberMap['t1']).toBeDefined()
    expect(result.rowNumberMap['t2']).toBeUndefined()
  })

  it('renders rows in order-based sequence with manual sort', () => {
    const tasks = [
      makeTask({ id: 't3', order: 3000, name: 'Third', milestoneId: 'm1' }),
      makeTask({ id: 't1', order: 1000, name: 'First', milestoneId: 'm1' }),
      makeTask({ id: 't2', order: 2000, name: 'Second', milestoneId: 'm1' }),
    ]
    const milestones = [{ id: 'm1', name: 'M1' }]
    const result = computeRowMap(tasks, milestones, {}, 'manual', 'asc', {}, {})

    // Verify all tasks are visible
    expect(result.rowNumberMap['t1']).toBeDefined()
    expect(result.rowNumberMap['t2']).toBeDefined()
    expect(result.rowNumberMap['t3']).toBeDefined()

    // Verify they appear in order-based sequence
    const visibleTaskRows = result.visibleRows.filter((r) => r.type === 'task')
    const visibleIds = visibleTaskRows.map((r) => r.id)
    expect(visibleIds).toEqual(['t1', 't2', 't3'])
  })

  it('shows all 6 tasks with no milestones', () => {
    const tasks = [
      makeTask({ id: 't1', name: 'Unnamed1', milestoneId: null }),
      makeTask({ id: 't2', name: 'Unnamed2', milestoneId: null }),
      makeTask({ id: 't3', name: 'Unnamed3', milestoneId: null }),
      makeTask({ id: 't4', name: 'Unnamed4', milestoneId: null }),
      makeTask({ id: 't5', name: 'Unnamed5', milestoneId: null }),
      makeTask({ id: 't6', name: 'Unnamed6', milestoneId: null }),
    ]
    const result = computeRowMap(tasks, [], {}, 'startDate', 'asc', {}, {})

    expect(result.rowNumberMap['t1']).toBeDefined()
    expect(result.rowNumberMap['t2']).toBeDefined()
    expect(result.rowNumberMap['t3']).toBeDefined()
    expect(result.rowNumberMap['t4']).toBeDefined()
    expect(result.rowNumberMap['t5']).toBeDefined()
    expect(result.rowNumberMap['t6']).toBeDefined()

    const visibleTaskRows = result.visibleRows.filter((r) => r.type === 'task')
    expect(visibleTaskRows).toHaveLength(6)
  })

  it('hides child tasks when parent is collapsed', () => {
    const tasks = [
      makeTask({ id: 't1', name: 'Parent1', parentId: null }),
      makeTask({ id: 't2', name: 'Child1', parentId: 't1' }),
      makeTask({ id: 't3', name: 'Child2', parentId: 't1' }),
      makeTask({ id: 't4', name: 'Parent2', parentId: null }),
      makeTask({ id: 't5', name: 'Child3', parentId: 't4' }),
      makeTask({ id: 't6', name: 'Child4', parentId: 't4' }),
    ]
    // Collapse both parents
    const expanded = { 't1': false, 't4': false }
    const result = computeRowMap(tasks, [], expanded, 'startDate', 'asc', {}, {})

    // Should show only the parents, not the children
    const visibleTaskRows = result.visibleRows.filter((r) => r.type === 'task')
    expect(visibleTaskRows).toHaveLength(2)
    expect(visibleTaskRows.map((r) => r.id)).toEqual(['t1', 't4'])
  })

  it('shows all 6 flat tasks without sortKey (sortKey is falsy)', () => {
    const tasks = [
      makeTask({ id: 't1', name: 'Unnamed1', milestoneId: null, parentId: null }),
      makeTask({ id: 't2', name: 'Unnamed2', milestoneId: null, parentId: null }),
      makeTask({ id: 't3', name: 'Unnamed3', milestoneId: null, parentId: null }),
      makeTask({ id: 't4', name: 'Unnamed4', milestoneId: null, parentId: null }),
      makeTask({ id: 't5', name: 'Unnamed5', milestoneId: null, parentId: null }),
      makeTask({ id: 't6', name: 'Unnamed6', milestoneId: null, parentId: null }),
    ]
    // Test with empty sortKey
    const result = computeRowMap(tasks, [], {}, '', 'asc', {}, {})

    const visibleTaskRows = result.visibleRows.filter((r) => r.type === 'task')
    expect(visibleTaskRows).toHaveLength(6)
    expect(visibleTaskRows.map((r) => r.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6'])
  })
})
