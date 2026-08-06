import { describe, it, expect } from 'vitest'
import { computeAssigneeBreakdown } from './selectors'
import type { Task } from './types'

// Helper to create a minimal task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id || 'task-id',
    name: overrides.name || 'Task Name',
    milestoneId: overrides.milestoneId || null,
    parentId: overrides.parentId || null,
    category: overrides.category || 'general',
    assignee: overrides.assignee ?? '',
    status: overrides.status || 'Todo',
    estimate: overrides.estimate ?? 0,
    startDate: overrides.startDate || '2024-01-01',
    progress: overrides.progress ?? 0,
    order: overrides.order ?? 0,
    dependencies: overrides.dependencies || [],
    comments: overrides.comments || [],
  }
}

describe('computeAssigneeBreakdown', () => {
  it('returns empty array for empty input', () => {
    const result = computeAssigneeBreakdown([])
    expect(result).toEqual([])
  })

  it('groups tasks by assignee and sums estimates', () => {
    const tasks = [
      createTask({ id: 't1', assignee: 'Alice', estimate: 5 }),
      createTask({ id: 't2', assignee: 'Alice', estimate: 3 }),
      createTask({ id: 't3', assignee: 'Bob', estimate: 2 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.assignee === 'Alice')).toEqual({
      assignee: 'Alice',
      totalEstimate: 8,
    })
    expect(result.find((r) => r.assignee === 'Bob')).toEqual({
      assignee: 'Bob',
      totalEstimate: 2,
    })
  })

  it('buckets empty string assignee into Unassigned', () => {
    const tasks = [
      createTask({ id: 't1', assignee: '', estimate: 4 }),
      createTask({ id: 't2', assignee: 'Alice', estimate: 3 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.assignee === 'Unassigned')).toEqual({
      assignee: 'Unassigned',
      totalEstimate: 4,
    })
  })

  it('buckets whitespace-only assignee into Unassigned', () => {
    const tasks = [
      createTask({ id: 't1', assignee: '   ', estimate: 5 }),
      createTask({ id: 't2', assignee: 'Bob', estimate: 2 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.assignee === 'Unassigned')).toEqual({
      assignee: 'Unassigned',
      totalEstimate: 5,
    })
  })

  it('groups multiple unassigned tasks into single Unassigned bucket', () => {
    const tasks = [
      createTask({ id: 't1', assignee: '', estimate: 2 }),
      createTask({ id: 't2', assignee: '  ', estimate: 3 }),
      createTask({ id: 't3', assignee: 'Alice', estimate: 1 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toHaveLength(2)
    const unassigned = result.find((r) => r.assignee === 'Unassigned')
    expect(unassigned).toEqual({
      assignee: 'Unassigned',
      totalEstimate: 5,
    })
  })

  it('sorts results by totalEstimate descending', () => {
    const tasks = [
      createTask({ id: 't1', assignee: 'Alice', estimate: 2 }),
      createTask({ id: 't2', assignee: 'Charlie', estimate: 10 }),
      createTask({ id: 't3', assignee: 'Bob', estimate: 5 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result.map((r) => r.assignee)).toEqual(['Charlie', 'Bob', 'Alice'])
    expect(result.map((r) => r.totalEstimate)).toEqual([10, 5, 2])
  })

  it('handles zero estimates (does not filter them out)', () => {
    const tasks = [
      createTask({ id: 't1', assignee: 'Alice', estimate: 0 }),
      createTask({ id: 't2', assignee: 'Bob', estimate: 5 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.assignee === 'Alice')).toEqual({
      assignee: 'Alice',
      totalEstimate: 0,
    })
  })

  it('handles single task with zero estimate', () => {
    const tasks = [createTask({ id: 't1', assignee: 'Alice', estimate: 0 })]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toEqual([
      {
        assignee: 'Alice',
        totalEstimate: 0,
      },
    ])
  })

  it('handles tasks with undefined/missing estimate (treats as 0)', () => {
    const tasks = [
      createTask({ id: 't1', assignee: 'Alice', estimate: undefined as any }),
      createTask({ id: 't2', assignee: 'Alice', estimate: 5 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toEqual([
      {
        assignee: 'Alice',
        totalEstimate: 5,
      },
    ])
  })

  it('handles complex real-world scenario', () => {
    const tasks = [
      createTask({ id: 't1', assignee: 'Alice', estimate: 8 }),
      createTask({ id: 't2', assignee: 'Alice', estimate: 3 }),
      createTask({ id: 't3', assignee: 'Bob', estimate: 5 }),
      createTask({ id: 't4', assignee: '', estimate: 2 }),
      createTask({ id: 't5', assignee: '  ', estimate: 1 }),
      createTask({ id: 't6', assignee: 'Charlie', estimate: 10 }),
      createTask({ id: 't7', assignee: 'Alice', estimate: 4 }),
    ]

    const result = computeAssigneeBreakdown(tasks)

    expect(result).toEqual([
      { assignee: 'Alice', totalEstimate: 15 },
      { assignee: 'Charlie', totalEstimate: 10 },
      { assignee: 'Bob', totalEstimate: 5 },
      { assignee: 'Unassigned', totalEstimate: 3 },
    ])
  })
})
