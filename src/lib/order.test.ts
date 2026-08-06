import { describe, it, expect } from 'vitest'
import {
  computeOrderBetween,
  siblingGroupKey,
  getSiblingGroup,
  isGroupBackfilled,
  backfillGroupOrders,
} from './order'
import type { Task, Milestone } from './types'

describe('order helpers', () => {
  describe('computeOrderBetween', () => {
    it('returns ORDER_GAP when both neighbors undefined', () => {
      expect(computeOrderBetween(undefined, undefined)).toBe(1000)
    })

    it('returns after - ORDER_GAP when before undefined', () => {
      expect(computeOrderBetween(undefined, 5000)).toBe(4000)
    })

    it('returns before + ORDER_GAP when after undefined', () => {
      expect(computeOrderBetween(3000, undefined)).toBe(4000)
    })

    it('returns midpoint when both neighbors defined', () => {
      expect(computeOrderBetween(2000, 4000)).toBe(3000)
    })

    it('handles fractional midpoint correctly', () => {
      expect(computeOrderBetween(1000, 2000)).toBe(1500)
    })

    it('handles edge case with same value', () => {
      expect(computeOrderBetween(1000, 1000)).toBe(1000)
    })
  })

  describe('siblingGroupKey', () => {
    it('keys by parentId when parentId is not null', () => {
      const key1 = siblingGroupKey(null, 'parent1', new Set())
      const key2 = siblingGroupKey('milestone1', 'parent1', new Set())
      expect(key1).toBe(key2)
      expect(key1).toBe('p:parent1')
    })

    it('keys by milestoneId when parentId is null and milestoneId is live', () => {
      const milestoneIds = new Set(['m1'])
      expect(siblingGroupKey('m1', null, milestoneIds)).toBe('m:m1')
    })

    it('keys to __unassigned__ for stale milestoneId', () => {
      expect(siblingGroupKey('stale', null, new Set())).toBe('m:__unassigned__')
    })

    it('keys to __unassigned__ for null milestoneId', () => {
      expect(siblingGroupKey(null, null, new Set())).toBe('m:__unassigned__')
    })

    it('prioritizes parentId over milestoneId', () => {
      const milestoneIds = new Set(['m1', 'm2'])
      const key1 = siblingGroupKey('m1', 'parent1', milestoneIds)
      const key2 = siblingGroupKey('m2', 'parent1', milestoneIds)
      expect(key1).toBe(key2)
      expect(key1).toBe('p:parent1')
    })
  })

  describe('getSiblingGroup', () => {
    it('returns only tasks in the same sibling group', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          parentId: 'p1',
          milestoneId: 'm1',
          order: 0,
          name: 'T1',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't2',
          parentId: 'p1',
          milestoneId: 'm1',
          order: 0,
          name: 'T2',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't3',
          parentId: 'p2',
          milestoneId: 'm1',
          order: 0,
          name: 'T3',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ]
      const milestones: Milestone[] = [{ id: 'm1', name: 'M1' }]
      const group = getSiblingGroup(tasks, milestones, tasks[0])
      expect(group).toHaveLength(2)
      expect(group.map((t) => t.id)).toEqual(['t1', 't2'])
    })

    it('handles milestoneId filter correctly', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          parentId: null,
          milestoneId: 'm1',
          order: 0,
          name: 'T1',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't2',
          parentId: null,
          milestoneId: 'm1',
          order: 0,
          name: 'T2',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't3',
          parentId: null,
          milestoneId: 'm2',
          order: 0,
          name: 'T3',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ]
      const milestones: Milestone[] = [
        { id: 'm1', name: 'M1' },
        { id: 'm2', name: 'M2' },
      ]
      const group = getSiblingGroup(tasks, milestones, tasks[0])
      expect(group).toHaveLength(2)
      expect(group.map((t) => t.id)).toEqual(['t1', 't2'])
    })

    it('groups stale milestoneIds into unassigned bucket', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          parentId: null,
          milestoneId: 'stale1',
          order: 0,
          name: 'T1',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't2',
          parentId: null,
          milestoneId: 'stale2',
          order: 0,
          name: 'T2',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't3',
          parentId: null,
          milestoneId: 'm1',
          order: 0,
          name: 'T3',
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          startDate: '',
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ]
      const milestones: Milestone[] = [{ id: 'm1', name: 'M1' }]
      const group = getSiblingGroup(tasks, milestones, tasks[0]) // t1 with stale1
      expect(group).toHaveLength(2)
      expect(group.map((t) => t.id)).toEqual(['t1', 't2']) // Both stale ones grouped together
    })
  })

  describe('isGroupBackfilled', () => {
    it('returns true for empty group', () => {
      expect(isGroupBackfilled([])).toBe(true)
    })

    it('returns true for singleton', () => {
      const task: Task = {
        id: 't1',
        parentId: null,
        milestoneId: 'm1',
        order: 0,
        name: 'T1',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: [],
        comments: [],
      }
      expect(isGroupBackfilled([task])).toBe(true)
    })

    it('returns false when all-zero', () => {
      const tasks = [
        { id: 't1', order: 0 },
        { id: 't2', order: 0 },
      ] as Task[]
      expect(isGroupBackfilled(tasks)).toBe(false)
    })

    it('returns false when any member is zero', () => {
      const tasks = [
        { id: 't1', order: 1000 },
        { id: 't2', order: 0 },
      ] as Task[]
      expect(isGroupBackfilled(tasks)).toBe(false)
    })

    it('returns true when all-nonzero', () => {
      const tasks = [
        { id: 't1', order: 1000 },
        { id: 't2', order: 2000 },
      ] as Task[]
      expect(isGroupBackfilled(tasks)).toBe(true)
    })
  })

  describe('backfillGroupOrders', () => {
    it('assigns strictly increasing ORDER_GAP multiples in sorted order', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          order: 0,
          name: 'A',
          startDate: '2025-01-01',
          milestoneId: null,
          parentId: null,
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't2',
          order: 0,
          name: 'B',
          startDate: '2025-01-02',
          milestoneId: null,
          parentId: null,
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ]
      const result = backfillGroupOrders(tasks, tasks, 'start', 'asc', {})
      expect(result[0].order).toBe(1000)
      expect(result[1].order).toBe(2000)
      expect(result[1].order > result[0].order).toBe(true)
    })

    it('preserves non-group tasks unchanged', () => {
      const groupTask: Task = {
        id: 't1',
        order: 0,
        name: 'A',
        startDate: '2025-01-01',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        progress: 0,
        dependencies: [],
        comments: [],
      }
      const otherTask: Task = {
        id: 't2',
        order: 5000,
        name: 'Z',
        startDate: '2025-01-05',
        milestoneId: null,
        parentId: 'parent1',
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        progress: 0,
        dependencies: [],
        comments: [],
      }
      const tasks = [groupTask, otherTask]
      const result = backfillGroupOrders(tasks, [groupTask], 'start', 'asc', {})
      expect(result[0].order).toBe(1000) // Changed
      expect(result[1].order).toBe(5000) // Unchanged
      expect(result[1]).toBe(otherTask) // Same reference
    })

    it('handles empty group', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          order: 1000,
          name: 'A',
          startDate: '2025-01-01',
          milestoneId: null,
          parentId: null,
          category: '',
          assignee: '',
          status: '',
          estimate: 0,
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ]
      const result = backfillGroupOrders(tasks, [], 'start', 'asc', {})
      expect(result).toEqual(tasks)
    })
  })
})
