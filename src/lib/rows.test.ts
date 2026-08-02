import { describe, it, expect } from 'vitest'
import { computeRowMap } from './rows'
import type { Task } from './types'

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
    dependencies: [],
    comments: [],
    ...overrides,
  }
}

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
})
