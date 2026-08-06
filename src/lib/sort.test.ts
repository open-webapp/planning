import { describe, it, expect } from 'vitest'
import { sortSiblings } from './sort'
import type { Task } from './types'

describe('sortSiblings with manual mode', () => {
  it('sorts by order field ascending when sortKey === manual', () => {
    const tasks: Task[] = [
      {
        id: 't3',
        order: 3000,
        name: 'Z',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't1',
        order: 1000,
        name: 'A',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        order: 2000,
        name: 'B',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, 'manual', 'asc', {})
    expect(sorted.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('sorts descending when sortDir is desc', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        order: 1000,
        name: 'A',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        order: 2000,
        name: 'B',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, 'manual', 'desc', {})
    expect(sorted.map((t) => t.id)).toEqual(['t2', 't1'])
  })

  it('preserves relative array order for ties (stability)', () => {
    const tasks: Task[] = [
      {
        id: 't2',
        order: 0,
        name: 'B',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't1',
        order: 0,
        name: 'A',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, 'manual', 'asc', {})
    // Both have order 0, so original order preserved
    expect(sorted.map((t) => t.id)).toEqual(['t2', 't1'])
  })

  it('respects parentId filtering with manual sort', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        parentId: 'parent1',
        order: 2000,
        name: 'T1',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: null,
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        parentId: 'parent2',
        order: 1000,
        name: 'T2',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: null,
        dependencies: [],
        comments: [],
      },
      {
        id: 't3',
        parentId: 'parent1',
        order: 1000,
        name: 'T3',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: null,
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, 'parent1', 'manual', 'asc', {})
    expect(sorted.map((t) => t.id)).toEqual(['t3', 't1'])
  })

  it('returns empty array when no tasks match parentId filter', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        parentId: 'parent1',
        order: 1000,
        name: 'T1',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: null,
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, 'parent2', 'manual', 'asc', {})
    expect(sorted).toEqual([])
  })

  it('handles null parentId correctly', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        parentId: null,
        order: 1000,
        name: 'T1',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        parentId: null,
        order: 2000,
        name: 'T2',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, 'manual', 'asc', {})
    expect(sorted.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('sorts by other fields when sortKey is not manual', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        order: 2000,
        name: 'Zebra',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        order: 1000,
        name: 'Apple',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, 'name', 'asc', {})
    expect(sorted.map((t) => t.id)).toEqual(['t2', 't1'])
  })

  it('returns original array when sortKey is empty', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        order: 2000,
        name: 'Z',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        order: 1000,
        name: 'A',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        parentId: null,
        milestoneId: 'm1',
        dependencies: [],
        comments: [],
      },
    ]
    const sorted = sortSiblings(tasks, null, '', 'asc', {})
    expect(sorted).toEqual(tasks)
  })
})
