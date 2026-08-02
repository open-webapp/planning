import { describe, it, expect } from 'vitest'
import { computeBaseSchedules, computeDisplaySchedules, computeProgressMap, computeCriticalSet, isDependentOn } from './scheduling'
import type { Task } from './types'

describe('scheduling', () => {
  /**
   * Test 1: Single task, no deps
   * A task starting Monday with estimate=3 working days → end = start + 3 working days (skips weekend)
   */
  it('single task no deps', () => {
    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Single Task',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 3,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const result = base['task-1']
    expect(result).toBeDefined()
    expect(result.start).toBe('2026-07-27') // Monday
    // 3 working days: Tue, Wed, Thu → ends Thursday 2026-07-30
    expect(result.end).toBe('2026-07-30')
  })

  /**
   * Test 2: Dependency ordering (finish-to-start)
   * Task B depends on A; A ends day X → B's start is nextWorkingDay(X+1), never before A finishes
   */
  it('dependency ordering finish-to-start', () => {
    const tasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'task-b',
        name: 'Task B',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27', // Monday, but depends on A
        progress: 0,
        dependencies: ['task-a'],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const resultA = base['task-a']
    const resultB = base['task-b']
    // Task A: 2 working days from Monday = Tue, Wed → ends 2026-07-29 (Wed)
    expect(resultA.start).toBe('2026-07-27')
    expect(resultA.end).toBe('2026-07-29')
    // Task B: must start after A ends, so starts 2026-07-30 (Thu)
    // 2 working days from Thu = Fri, Mon → ends 2026-08-03
    expect(resultB.start).toBe('2026-07-30')
    expect(resultB.end).toBe('2026-08-03')
  })

  /**
   * Test 3: Weekend/working-day skipping
   * Saturday startDate pushed to Monday; addWorkingDays(Friday, 1) lands Monday not Saturday
   */
  it('weekend working-day skipping', () => {
    const tasks: Task[] = [
      {
        id: 'task-sat',
        name: 'Task Starting Saturday',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-08-01', // Saturday
        progress: 0,
        dependencies: [],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const result = base['task-sat']
    // Saturday pushed to Monday
    expect(result.start).toBe('2026-08-03') // Monday
    // 1 working day from Monday = Tuesday
    expect(result.end).toBe('2026-08-04')
  })

  /**
   * Test 4: Multiple dependencies — latest wins
   * Task C depends on A, B → C's start driven by dependency ending latest
   */
  it('multiple dependencies latest wins', () => {
    const tasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'task-b',
        name: 'Task B',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 5,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'task-c',
        name: 'Task C',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27', // Monday, but depends on both A and B
        progress: 0,
        dependencies: ['task-a', 'task-b'],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const resultA = base['task-a']
    const resultB = base['task-b']
    const resultC = base['task-c']
    // Task A: 2 working days from Mon = Tue, Wed → ends Wed 2026-07-29
    expect(resultA.end).toBe('2026-07-29')
    // Task B: 5 working days from Mon = Tue, Wed, Thu, Fri, Mon → ends Mon 2026-08-03
    expect(resultB.end).toBe('2026-08-03')
    // Task C: must start after B (latest), so starts Tue 2026-08-04
    // 2 working days from Tue = Wed, Thu → ends Thu 2026-08-06
    expect(resultC.start).toBe('2026-08-04')
    expect(resultC.end).toBe('2026-08-06')
  })

  /**
   * Test 5: Parent/child display rollup
   * Parent's display start/end = min(start)/max(end) across children's *display* schedules
   */
  it('parent child display rollup', () => {
    const tasks: Task[] = [
      {
        id: 'parent',
        name: 'Parent Task',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 0,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'child-1',
        name: 'Child 1',
        milestoneId: null,
        parentId: 'parent',
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'child-2',
        name: 'Child 2',
        milestoneId: null,
        parentId: 'parent',
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 3,
        startDate: '2026-07-27', // Monday
        progress: 0,
        dependencies: [],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const display = computeDisplaySchedules(tasks, base)
    // Child 1: 2 working days from Mon = Tue, Wed → ends Wed 2026-07-29
    expect(display['child-1'].start).toBe('2026-07-27')
    expect(display['child-1'].end).toBe('2026-07-29')
    // Child 2: 3 working days from Mon = Tue, Wed, Thu → ends Thu 2026-07-30
    expect(display['child-2'].start).toBe('2026-07-27')
    expect(display['child-2'].end).toBe('2026-07-30')
    // Parent: min(start)=2026-07-27, max(end)=2026-07-30
    expect(display['parent'].start).toBe('2026-07-27')
    expect(display['parent'].end).toBe('2026-07-30')
  })

  /**
   * Test 6: Progress rollup
   * Parent progress = rounded average of children's progress (test: 0/50/100 → 50)
   */
  it('progress rollup', () => {
    const tasks: Task[] = [
      {
        id: 'parent',
        name: 'Parent Task',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 0,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'child-1',
        name: 'Child 1',
        milestoneId: null,
        parentId: 'parent',
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'child-2',
        name: 'Child 2',
        milestoneId: null,
        parentId: 'parent',
        category: 'Test',
        assignee: 'Test',
        status: 'In Progress',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 50,
        dependencies: [],
        comments: [],
      },
      {
        id: 'child-3',
        name: 'Child 3',
        milestoneId: null,
        parentId: 'parent',
        category: 'Test',
        assignee: 'Test',
        status: 'Done',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 100,
        dependencies: [],
        comments: [],
      },
    ]
    const prog = computeProgressMap(tasks)
    // Children: 0, 50, 100 → average = 50
    expect(prog['parent']).toBe(50)
    expect(prog['child-1']).toBe(0)
    expect(prog['child-2']).toBe(50)
    expect(prog['child-3']).toBe(100)
  })

  /**
   * Test 7: Critical path picks longest chain
   * Two paths to same region, one longer → computeCriticalSet includes latest end date leaf, walks backward via latest-ending dependency
   */
  it('critical path picks longest chain', () => {
    const tasks: Task[] = [
      {
        id: 'start',
        name: 'Start Task',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 'path-a-1',
        name: 'Path A Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['start'],
        comments: [],
      },
      {
        id: 'path-b-1',
        name: 'Path B Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 5,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['start'],
        comments: [],
      },
      {
        id: 'end',
        name: 'End Task',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['path-a-1', 'path-b-1'],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    const crit = computeCriticalSet(tasks, base)
    // Path B is longer (5 days), so it should be in critical path
    expect(crit.has('path-b-1')).toBe(true)
    // End task should be in critical path
    expect(crit.has('end')).toBe(true)
    // Start should be in critical path
    expect(crit.has('start')).toBe(true)
  })

  /**
   * Test 8: Critical path cycle guard
   * Pathological task depending transitively on itself → no infinite loop, returns properly
   */
  it('critical path cycle guard', () => {
    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['task-2'],
        comments: [],
      },
      {
        id: 'task-2',
        name: 'Task 2',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['task-1'],
        comments: [],
      },
    ]
    const base = computeBaseSchedules(tasks)
    // Should not throw, should handle cycle gracefully
    const crit = computeCriticalSet(tasks, base)
    expect(crit).toBeDefined()
    expect(crit.size).toBeGreaterThan(0)
  })

  /**
   * Test 9: isDependentOn transitive
   * A→B, B→C → isDependentOn(A,C)=true; isDependentOn(C,A)=false; self-cycle doesn't loop
   */
  it('isDependentOn transitive', () => {
    const tasks: Task[] = [
      {
        id: 'task-a',
        name: 'Task A',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['task-b'],
        comments: [],
      },
      {
        id: 'task-b',
        name: 'Task B',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['task-c'],
        comments: [],
      },
      {
        id: 'task-c',
        name: 'Task C',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 1,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: [],
        comments: [],
      },
    ]
    // A depends on B, B depends on C → A transitively depends on C
    expect(isDependentOn(tasks, 'task-a', 'task-c')).toBe(true)
    // C does not depend on A
    expect(isDependentOn(tasks, 'task-c', 'task-a')).toBe(false)
    // Self-cycle guard test
    const cycleTaskA: Task = {
      id: 'cycle-a',
      name: 'Cycle A',
      milestoneId: null,
      parentId: null,
      category: 'Test',
      assignee: 'Test',
      status: 'Not Started',
      estimate: 1,
      startDate: '2026-07-27',
      progress: 0,
      dependencies: ['cycle-b'],
      comments: [],
    }
    const cycleTaskB: Task = {
      id: 'cycle-b',
      name: 'Cycle B',
      milestoneId: null,
      parentId: null,
      category: 'Test',
      assignee: 'Test',
      status: 'Not Started',
      estimate: 1,
      startDate: '2026-07-27',
      progress: 0,
      dependencies: ['cycle-a'],
      comments: [],
    }
    const cycleTasks = [cycleTaskA, cycleTaskB]
    // Should not loop infinitely
    expect(isDependentOn(cycleTasks, 'cycle-a', 'cycle-b')).toBe(true)
    expect(isDependentOn(cycleTasks, 'cycle-a', 'cycle-a')).toBe(true)
  })

  /**
   * Test 10: Missing/dangling dependency
   * Task refs non-existent dependency id → computeBaseSchedules returns {start:TODAY, end:TODAY}, doesn't throw
   */
  it('missing dangling dependency', () => {
    const tasks: Task[] = [
      {
        id: 'task-orphan',
        name: 'Task with Dangling Dep',
        milestoneId: null,
        parentId: null,
        category: 'Test',
        assignee: 'Test',
        status: 'Not Started',
        estimate: 2,
        startDate: '2026-07-27',
        progress: 0,
        dependencies: ['non-existent-task'],
        comments: [],
      },
    ]
    // Should not throw
    expect(() => {
      computeBaseSchedules(tasks)
    }).not.toThrow()
    const base = computeBaseSchedules(tasks)
    const result = base['task-orphan']
    // Dangling dependency defaults to TODAY ('2026-07-31'); nextWorkingDay(2026-08-01) = 2026-08-03
    // So task starts after the non-existent dependency's "end"
    expect(result).toBeDefined()
    expect(result.start).toBe('2026-08-03')
    expect(result.end).toBe('2026-08-05') // 2 working days from Mon 2026-08-03
  })
})
