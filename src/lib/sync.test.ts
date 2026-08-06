import { describe, it, expect, vi } from 'vitest'
import { diffAgainstSnapshot, threeWayMerge, applyResolutions, syncNow, resolveSyncConflicts } from './sync'
import type { Task, Milestone } from './types'
import type { AppState } from './state'

vi.mock('./googleAuth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
  getDriveCsvContent: vi.fn().mockResolvedValue(null),
  updateDriveCsvFile: vi.fn().mockRejectedValue(new Error('Push failed: 403 - forbidden')),
}))

vi.mock('./csv', () => ({
  parseTasksCsvString: vi.fn().mockReturnValue({ tasks: [], milestones: [] }),
  buildTasksCsvString: vi.fn().mockReturnValue(''),
}))

// Helper to create a test task
function createTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    name: `Task ${id}`,
    milestoneId: null,
    parentId: null,
    category: 'Default',
    assignee: 'Unassigned',
    status: 'Not Started',
    estimate: 5,
    startDate: '2026-08-01',
    progress: 0,
    order: 0,
    dependencies: [],
    comments: [],
    ...overrides,
  }
}

// Helper to create a test milestone
function createMilestone(id: string, overrides?: Partial<Milestone>): Milestone {
  return {
    id,
    name: `Milestone ${id}`,
    ...overrides,
  }
}

describe('sync engine', () => {
  /**
   * Test 1: No-conflict two-way sync
   * Browser has task A field changed, sheet has task B field changed (different tasks)
   * → threeWayMerge returns both changes applied, zero conflicts.
   */
  it('test 1: no-conflict two-way sync', () => {
    const snapshot = {
      tasks: [
        createTask('a', { name: 'Task A', status: 'Not Started' }),
        createTask('b', { name: 'Task B', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'Task A Modified', status: 'Not Started' }), // browser changed task A's name
        createTask('b', { name: 'Task B', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [
        createTask('a', { name: 'Task A', status: 'Not Started' }),
        createTask('b', { name: 'Task B', status: 'In Progress' }), // sheet changed task B's status
      ],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks).toHaveLength(2)
    expect(merged.tasks[0].name).toBe('Task A Modified') // browser change
    expect(merged.tasks[1].status).toBe('In Progress') // sheet change
  })

  /**
   * Test 2: Sheet-only changes
   * Browser identical to snapshot, sheet has 2 field edits
   * → merge result equals sheet state, zero conflicts, browser fields not touched.
   */
  it('test 2: sheet-only changes', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Task A', estimate: 5 })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Task A', estimate: 5 })], // identical to snapshot
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Task A Sheet Name', estimate: 10 })], // sheet changed both fields
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks[0].name).toBe('Task A Sheet Name')
    expect(merged.tasks[0].estimate).toBe(10)
  })

  /**
   * Test 3: Browser-only changes
   * Sheet identical to snapshot, browser has edits
   * → merge result equals browser state, zero conflicts.
   */
  it('test 3: browser-only changes', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Task A', status: 'Not Started' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Task A Browser', status: 'Done' })], // browser changed both fields
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Task A', status: 'Not Started' })], // identical to snapshot
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks[0].name).toBe('Task A Browser')
    expect(merged.tasks[0].status).toBe('Done')
  })

  /**
   * Test 4: Single-field conflict, pick drive
   * Same task+field changed differently on both sides
   * → one SyncConflict emitted; applyResolutions with {[key]: 'drive'} yields drive value.
   */
  it('test 4: single-field conflict, pick drive', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Original Name' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Browser Name' })],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Sheet Name' })],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].field).toBe('name')
    expect(conflicts[0].browserValue).toBe('Browser Name')
    expect(conflicts[0].driveValue).toBe('Sheet Name')

    // Apply resolution: pick drive
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'drive',
    })

    expect(resolved.tasks[0].name).toBe('Sheet Name')
  })

  /**
   * Test 5: Single-field conflict, pick browser
   * Same task+field changed differently on both sides
   * → applyResolutions with {[key]: 'browser'} yields browser value.
   */
  it('test 5: single-field conflict, pick browser', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Original Name' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Browser Name' })],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Sheet Name' })],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    // Apply resolution: pick browser
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'browser',
    })

    expect(resolved.tasks[0].name).toBe('Browser Name')
  })

  /**
   * Test 6: Multiple simultaneous conflicts
   * 3 different tasks each with one conflicting field
   * → 3 SyncConflict entries, all independently resolvable.
   */
  it('test 6: multiple simultaneous conflicts', () => {
    const snapshot = {
      tasks: [
        createTask('a', { name: 'A', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Not Started' }),
        createTask('c', { name: 'C', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'A Browser', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Done' }),
        createTask('c', { name: 'C', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [
        createTask('a', { name: 'A Sheet', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'In Progress' }),
        createTask('c', { name: 'C', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    // Task A has name conflict, Task B has status conflict, Task C has no conflict (no changes on either side)
    expect(conflicts).toHaveLength(2)
    expect(conflicts.map(c => c.taskId).sort()).toEqual(['a', 'b'])

    // Resolve: task A picks drive, task B picks browser, task C stays (no conflict)
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'drive',
      'b:status': 'browser',
    })

    expect(resolved.tasks[0].name).toBe('A Sheet')
    expect(resolved.tasks[1].status).toBe('Done')
  })

  /**
   * Test 7: First-ever sync (snapshot === null)
   * All current browser tasks treated as "browser-only added"
   * → no conflicts, merged equals browser state.
   */
  it('test 7: first-ever sync (snapshot === null)', () => {
    const snapshot = null

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'Task A' }),
        createTask('b', { name: 'Task B' }),
      ],
      milestones: [createMilestone('m1', { name: 'Milestone 1' })],
    }

    const sheetCurrent = {
      tasks: [],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks).toHaveLength(2)
    expect(merged.milestones).toHaveLength(1)
    expect(merged.tasks[0].name).toBe('Task A')
    expect(merged.tasks[1].name).toBe('Task B')
    expect(merged.milestones[0].name).toBe('Milestone 1')
  })

  /**
   * Test 8: Comments merge (from task 8)
   * Local comment added + sheet comment on same task, both present, no conflict.
   */
  it('test 8: comments merge (local + sheet)', () => {
    const localComment = {
      id: 'comment-local-1',
      author: 'Local User',
      ts: '2026-08-01T10:00:00Z',
      text: 'Local comment',
    }

    const sheetComment = {
      id: 'comment-sheet-1',
      author: 'Sheet User',
      ts: '2026-08-01T11:00:00Z',
      text: 'Sheet comment',
    }

    const snapshot = {
      tasks: [createTask('a', { name: 'Task A', comments: [] })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Task A', comments: [localComment] })],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Task A', comments: [sheetComment] })],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks[0].comments).toHaveLength(2)
    expect(merged.tasks[0].comments.map(c => c.id).sort()).toEqual(['comment-local-1', 'comment-sheet-1'])
  })

  /**
   * Test 9: Task deleted on one side, edited on other
   * → conflict emitted with '__deleted' pseudo-field.
   */
  it('test 9: task deleted on one side, edited on other', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Task A', status: 'Not Started' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [], // browser deleted task A
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Task A Edited', status: 'Done' })], // sheet edited task A
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    // Deletion conflict (one side deleted, other edited) should be detected
    expect(conflicts.length).toBeGreaterThan(0)
  })

  /**
   * Test 10: Task added on one side only
   * → keep it, no conflict.
   */
  it('test 10: task added on one side only', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Task A' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'Task A' }),
        createTask('b', { name: 'Task B Browser' }), // browser added task B
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Task A' })], // sheet has no task B
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks).toHaveLength(2)
    expect(merged.tasks[1].name).toBe('Task B Browser')
  })

  /**
   * Test 11: Both sides changed the same field the same way
   * → no conflict (silently converge).
   */
  it('test 11: both sides changed same field same way', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Original', status: 'Not Started' })],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [createTask('a', { name: 'Updated', status: 'Done' })],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [createTask('a', { name: 'Updated', status: 'Done' })], // same change as browser
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(0)
    expect(merged.tasks[0].name).toBe('Updated')
    expect(merged.tasks[0].status).toBe('Done')
  })

  /**
   * Additional test: Verify diffAgainstSnapshot with null snapshot treats all as added
   */
  it('diffAgainstSnapshot: null snapshot adds all tasks', () => {
    const snapshot = null
    const current = {
      tasks: [createTask('a'), createTask('b')],
      milestones: [createMilestone('m1')],
    }

    const changes = diffAgainstSnapshot(current, snapshot)

    expect(changes.tasks.addedIds.size).toBe(2)
    expect(changes.tasks.removedIds.size).toBe(0)
    expect(changes.tasks.modifiedIds.size).toBe(0)
    expect(changes.milestones.addedIds.size).toBe(1)
    expect(changes.milestones.removedIds.size).toBe(0)
    expect(changes.milestones.modifiedIds.size).toBe(0)
  })

  /**
   * Additional test: diffAgainstSnapshot detects removals
   */
  it('diffAgainstSnapshot: detects removed tasks', () => {
    const snapshot = {
      tasks: [createTask('a'), createTask('b')],
      milestones: [],
    }

    const current = {
      tasks: [createTask('a')], // task b removed
      milestones: [],
    }

    const changes = diffAgainstSnapshot(current, snapshot)

    expect(changes.tasks.removedIds.size).toBe(1)
    expect(changes.tasks.removedIds.has('b')).toBe(true)
  })

  /**
   * Additional test: diffAgainstSnapshot detects field modifications
   */
  it('diffAgainstSnapshot: detects field modifications', () => {
    const snapshot = {
      tasks: [createTask('a', { name: 'Original', estimate: 5 })],
      milestones: [],
    }

    const current = {
      tasks: [createTask('a', { name: 'Modified', estimate: 10 })],
      milestones: [],
    }

    const changes = diffAgainstSnapshot(current, snapshot)

    expect(changes.tasks.modifiedIds.has('a')).toBe(true)
    const taskAChanges = changes.tasks.modifiedIds.get('a')!
    expect(taskAChanges.has('name')).toBe(true)
    expect(taskAChanges.has('estimate')).toBe(true)
    expect(taskAChanges.get('name')?.oldValue).toBe('Original')
    expect(taskAChanges.get('name')?.newValue).toBe('Modified')
  })

  /**
   * Additional test: comments field is not included in diff
   */
  it('diffAgainstSnapshot: skips comments field', () => {
    const snapshot = {
      tasks: [
        createTask('a', {
          name: 'Task',
          comments: [{ id: 'c1', author: 'A', ts: '2026-08-01', text: 'Old' }],
        }),
      ],
      milestones: [],
    }

    const current = {
      tasks: [
        createTask('a', {
          name: 'Task',
          comments: [
            { id: 'c1', author: 'A', ts: '2026-08-01', text: 'Old' },
            { id: 'c2', author: 'B', ts: '2026-08-02', text: 'New' },
          ],
        }),
      ],
      milestones: [],
    }

    const changes = diffAgainstSnapshot(current, snapshot)

    // Task 'a' should not be marked as modified because only comments changed
    expect(changes.tasks.modifiedIds.has('a')).toBe(false)
  })

  /**
   * Additional test: Complex scenario with mixed adds/removes/modifications
   */
  it('complex scenario: adds, removes, and modifications', () => {
    const snapshot = {
      tasks: [
        createTask('a', { name: 'A', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Not Started' }),
        createTask('c', { name: 'C', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'A Modified', status: 'Not Started' }), // modified
        // task b removed
        createTask('c', { name: 'C', status: 'Not Started' }), // unchanged
        createTask('d', { name: 'D New', status: 'Not Started' }), // added
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [
        createTask('a', { name: 'A', status: 'In Progress' }), // modified (different)
        createTask('b', { name: 'B', status: 'Not Started' }), // unchanged
        createTask('c', { name: 'C', status: 'Done' }), // modified
        // task d doesn't exist in sheet
      ],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    // Task A: browser changed name, sheet changed status (different fields) → no conflict
    // Task B: browser removed, sheet unchanged → no conflict (respects removal)
    // Task C: browser unchanged, sheet changed status → no conflict (sheet-only change)
    // Task D: browser added, sheet doesn't have → no conflict (added)
    expect(conflicts).toHaveLength(0)

    // Tasks in merge should include a, c, d (b was removed by browser)
    expect(merged.tasks.map(t => t.id).sort()).toEqual(['a', 'c', 'd'])
    // Verify merged values
    expect(merged.tasks.find(t => t.id === 'a')?.name).toBe('A Modified') // browser change
    expect(merged.tasks.find(t => t.id === 'a')?.status).toBe('In Progress') // sheet change
    expect(merged.tasks.find(t => t.id === 'c')?.status).toBe('Done') // sheet change
    expect(merged.tasks.find(t => t.id === 'd')?.name).toBe('D New') // browser added
  })

  it('does not wipe browser tasks when the Drive pull comes back empty despite an existing snapshot', async () => {
    // Reproduces the reported bug: getDriveCsvContent returning null for a
    // project that has synced before (non-empty lastSyncedSnapshot) used to make threeWayMerge
    // treat every task as "deleted on the Drive side" and wipe them from the browser too.
    const { getDriveCsvContent, updateDriveCsvFile } = await import('./googleAuth')
    vi.mocked(getDriveCsvContent).mockResolvedValueOnce(null)
    vi.mocked(updateDriveCsvFile).mockResolvedValueOnce(undefined)

    const existingTasks = [createTask('a'), createTask('b')]
    const snapshot = { tasks: existingTasks, milestones: [] }

    const state: AppState = {
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          color: '#000',
          driveFileId: 'drive-file-1',
          lastSyncedSnapshot: JSON.stringify(snapshot),
          lastSyncedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      tasks: existingTasks,
      milestones: [],
    } as unknown as AppState

    const dispatch = vi.fn()
    await syncNow(state, dispatch)

    const successCall = dispatch.mock.calls.find(call => call[0].type === 'SYNC_SUCCESS')
    expect(successCall).toBeDefined()
    expect(successCall![0].tasks.map((t: Task) => t.id).sort()).toEqual(['a', 'b'])
  })

  it('resolveSyncConflicts applies "drive" choices and pushes the resolved data (accept-drive did nothing before this fix)', async () => {
    const { updateDriveCsvFile } = await import('./googleAuth')
    vi.mocked(updateDriveCsvFile).mockResolvedValueOnce(undefined)

    const pendingMerge = {
      tasks: [createTask('a', { name: 'Browser Name', status: 'In Progress' })],
      milestones: [],
    }
    const conflicts = [
      {
        taskId: 'a',
        taskName: 'Browser Name',
        field: 'name' as const,
        browserValue: 'Browser Name',
        driveValue: 'Drive Name',
      },
    ]

    const state: AppState = {
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          color: '#000',
          driveFileId: 'drive-file-1',
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
      ],
      tasks: pendingMerge.tasks,
      milestones: [],
      syncPendingMerge: pendingMerge,
      syncConflicts: conflicts,
    } as unknown as AppState

    const dispatch = vi.fn()
    await resolveSyncConflicts(state, dispatch, { 'a:name': 'drive' })

    const successCall = dispatch.mock.calls.find(call => call[0].type === 'SYNC_SUCCESS')
    expect(successCall).toBeDefined()
    expect(successCall![0].tasks.find((t: Task) => t.id === 'a')?.name).toBe('Drive Name')

    const errorCall = dispatch.mock.calls.find(call => call[0].type === 'SYNC_ERROR')
    expect(errorCall).toBeUndefined()
  })

  /**
   * Phase 4: Bulk conflict resolution (>5 conflicts)
   *
   * Test 12: Round-trip with 6 field conflicts (no deletions)
   * 6 tasks, each with one field conflicted on both sides.
   * → threeWayMerge returns 6 conflicts; applyResolutions with all choices
   * set to 'drive' yields all sheet-side values; all 'browser' yields all
   * browser-side values.
   */
  it('test 12: bulk round-trip with 6 field conflicts (no deletions)', () => {
    const taskIds = ['a', 'b', 'c', 'd', 'e', 'f']

    const snapshot = {
      tasks: taskIds.map(id => createTask(id, { name: `Task ${id}`, status: 'Not Started' })),
      milestones: [],
    }

    const browserCurrent = {
      tasks: taskIds.map(id => createTask(id, { name: `Task ${id}`, status: `Browser-${id}` })),
      milestones: [],
    }

    const sheetCurrent = {
      tasks: taskIds.map(id => createTask(id, { name: `Task ${id}`, status: `Sheet-${id}` })),
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(6)
    expect(conflicts.map(c => c.taskId).sort()).toEqual(taskIds)

    // Bulk-accept sheet (drive) version for all conflicts
    const driveChoices: { [key: string]: 'drive' | 'browser' } = {}
    conflicts.forEach(c => {
      driveChoices[`${c.taskId}:${c.field}`] = 'drive'
    })
    const resolvedDrive = applyResolutions(merged, conflicts, driveChoices)
    taskIds.forEach(id => {
      const task = resolvedDrive.tasks.find(t => t.id === id)
      expect(task?.status).toBe(`Sheet-${id}`)
    })

    // Bulk-accept browser version for all conflicts
    const browserChoices: { [key: string]: 'drive' | 'browser' } = {}
    conflicts.forEach(c => {
      browserChoices[`${c.taskId}:${c.field}`] = 'browser'
    })
    const resolvedBrowser = applyResolutions(merged, conflicts, browserChoices)
    taskIds.forEach(id => {
      const task = resolvedBrowser.tasks.find(t => t.id === id)
      expect(task?.status).toBe(`Browser-${id}`)
    })
  })

  /**
   * Test 13: Mixed bulk conflicts (6 field conflicts + 1 deletion conflict)
   * 5 tasks with field conflicts + 1 task with a deletion conflict (browser
   * deletes, sheet edits). Bulk resolution should apply the chosen side to
   * every field conflict while leaving the deleted-but-edited task present
   * (the '__deleted' pseudo-field is skipped as a no-op).
   */
  it('test 13: mixed bulk conflicts (5 field conflicts + 1 deletion conflict)', () => {
    const fieldTaskIds = ['a', 'b', 'c', 'd', 'e']
    const deletedTaskId = 'z'

    const snapshot = {
      tasks: [
        ...fieldTaskIds.map(id => createTask(id, { name: `Task ${id}`, status: 'Not Started' })),
        createTask(deletedTaskId, { name: 'Task Z', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        ...fieldTaskIds.map(id => createTask(id, { name: `Task ${id}`, status: `Browser-${id}` })),
        // browser deleted task z (not present)
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [
        ...fieldTaskIds.map(id => createTask(id, { name: `Task ${id}`, status: `Sheet-${id}` })),
        createTask(deletedTaskId, { name: 'Task Z Edited', status: 'Done' }), // sheet edited task z
      ],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    // 5 field conflicts + 1 deletion conflict
    expect(conflicts).toHaveLength(6)
    const deletionConflict = conflicts.find(c => c.taskId === deletedTaskId)
    expect(deletionConflict).toBeDefined()
    expect(deletionConflict?.field).toBe('__deleted')

    // Bulk-resolve: 'drive' for all non-deletion conflicts, skip the deletion conflict
    // (mirrors handleBulkAcceptDrive/handleBulkAcceptBrowser in SyncConflictOverlay.tsx)
    const driveChoices: { [key: string]: 'drive' | 'browser' } = {}
    conflicts.forEach(c => {
      if (c.field === '__deleted') return
      driveChoices[`${c.taskId}:${c.field}`] = 'drive'
    })
    const resolvedDrive = applyResolutions(merged, conflicts, driveChoices)

    fieldTaskIds.forEach(id => {
      const task = resolvedDrive.tasks.find(t => t.id === id)
      expect(task?.status).toBe(`Sheet-${id}`)
    })
    // Deleted-but-edited task is still present (kept via mergeTask, '__deleted' is a no-op)
    const keptTaskDrive = resolvedDrive.tasks.find(t => t.id === deletedTaskId)
    expect(keptTaskDrive).toBeDefined()
    expect(keptTaskDrive?.name).toBe('Task Z Edited')

    // Bulk-resolve: 'browser' for all non-deletion conflicts
    const browserChoices: { [key: string]: 'drive' | 'browser' } = {}
    conflicts.forEach(c => {
      if (c.field === '__deleted') return
      browserChoices[`${c.taskId}:${c.field}`] = 'browser'
    })
    const resolvedBrowser = applyResolutions(merged, conflicts, browserChoices)

    fieldTaskIds.forEach(id => {
      const task = resolvedBrowser.tasks.find(t => t.id === id)
      expect(task?.status).toBe(`Browser-${id}`)
    })
    const keptTaskBrowser = resolvedBrowser.tasks.find(t => t.id === deletedTaskId)
    expect(keptTaskBrowser).toBeDefined()
    expect(keptTaskBrowser?.name).toBe('Task Z Edited')
  })

  /**
   * Test 14: Regression check - 5-or-fewer conflicts still apply per-conflict
   * resolutions correctly (individual UI path, not bulk).
   */
  it('test 14: regression - 3 conflicts resolved individually still work', () => {
    const snapshot = {
      tasks: [
        createTask('a', { name: 'A', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Not Started' }),
        createTask('c', { name: 'C', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserCurrent = {
      tasks: [
        createTask('a', { name: 'A Browser', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Browser Status' }),
        createTask('c', { name: 'C Browser', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const sheetCurrent = {
      tasks: [
        createTask('a', { name: 'A Sheet', status: 'Not Started' }),
        createTask('b', { name: 'B', status: 'Sheet Status' }),
        createTask('c', { name: 'C Sheet', status: 'Not Started' }),
      ],
      milestones: [],
    }

    const browserChanges = diffAgainstSnapshot(browserCurrent, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetCurrent, snapshot)

    const { merged, conflicts } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserCurrent, sheetCurrent)

    expect(conflicts).toHaveLength(3)

    // Individually resolve: a -> drive, b -> browser, c -> drive
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'drive',
      'b:status': 'browser',
      'c:name': 'drive',
    })

    expect(resolved.tasks.find(t => t.id === 'a')?.name).toBe('A Sheet')
    expect(resolved.tasks.find(t => t.id === 'b')?.status).toBe('Browser Status')
    expect(resolved.tasks.find(t => t.id === 'c')?.name).toBe('C Sheet')
  })

  it('reports SYNC_ERROR when the Drive push fails', async () => {
    const state: AppState = {
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          color: '#000',
          driveFileId: 'drive-file-1',
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
      ],
      tasks: [createTask('a')],
      milestones: [],
    } as unknown as AppState

    const dispatch = vi.fn()
    await syncNow(state, dispatch)

    const dispatchedTypes = dispatch.mock.calls.map(call => call[0].type)
    expect(dispatchedTypes).toContain('SYNC_ERROR')
    expect(dispatchedTypes).not.toContain('SYNC_SUCCESS')

    const errorCall = dispatch.mock.calls.find(call => call[0].type === 'SYNC_ERROR')
    expect(errorCall).toBeDefined()
    expect(errorCall![0].error).toContain('Push failed')
  })

  /**
   * Regression: the CSV format has no Order/Parent columns, so parseTasksCsvString
   * hardcodes order:0 and parentId:null on every parsed row. Prior to the fix, treating
   * that as a real "sheet changed this field" diff wiped manual drag order and subtask
   * nesting on every sync, even with no real edit on either side.
   */
  it('does not let the lossy CSV round-trip clobber order/parentId', () => {
    const browserTasks = [
      createTask('t1', { order: 1000, parentId: null }),
      createTask('t2', { order: 500, parentId: 't1' }),
    ]
    const snapshot = { tasks: browserTasks.map((t) => ({ ...t })), milestones: [] as Milestone[] }
    // Sheet side as it comes back from parseTasksCsvString: order/parentId always reset.
    const sheetTasks = browserTasks.map((t) => ({ ...t, order: 0, parentId: null }))

    const browserData = { tasks: browserTasks, milestones: [] }
    const sheetData = { tasks: sheetTasks, milestones: [] }

    const browserChanges = diffAgainstSnapshot(browserData, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetData, snapshot, ['order', 'parentId'])

    const { merged } = threeWayMerge(browserChanges, sheetChanges, snapshot, browserData, sheetData)

    const child = merged.tasks.find((t) => t.id === 't2')!
    expect(child.order).toBe(500)
    expect(child.parentId).toBe('t1')
  })
})
