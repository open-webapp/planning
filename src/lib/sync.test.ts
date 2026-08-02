import { describe, it, expect, vi } from 'vitest'
import { diffAgainstSnapshot, threeWayMerge, applyResolutions, syncNow } from './sync'
import type { Task, Milestone } from './types'
import type { AppState } from './state'

vi.mock('./googleAuth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
  pullFromSheet: vi.fn().mockResolvedValue({ tasks: [], milestones: [] }),
  pushToSheet: vi.fn().mockResolvedValue({ success: false, message: 'Push failed: 403 - forbidden' }),
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
   * Test 4: Single-field conflict, pick sheet
   * Same task+field changed differently on both sides
   * → one SyncConflict emitted; applyResolutions with {[key]: 'sheet'} yields sheet value.
   */
  it('test 4: single-field conflict, pick sheet', () => {
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
    expect(conflicts[0].sheetValue).toBe('Sheet Name')

    // Apply resolution: pick sheet
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'sheet',
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

    // Resolve: task A picks sheet, task B picks browser, task C stays (no conflict)
    const resolved = applyResolutions(merged, conflicts, {
      'a:name': 'sheet',
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

  it('does not wipe browser tasks when the sheet pull comes back empty despite an existing snapshot', async () => {
    // Reproduces the reported bug: pullFromSheet returning {tasks: [], milestones: []} for a
    // project that has synced before (non-empty lastSyncedSnapshot) used to make threeWayMerge
    // treat every task as "deleted on the sheet side" and wipe them from the browser too.
    const { pullFromSheet, pushToSheet } = await import('./googleAuth')
    vi.mocked(pullFromSheet).mockResolvedValueOnce({ tasks: [], milestones: [] })
    vi.mocked(pushToSheet).mockResolvedValueOnce({ success: true, message: 'ok' })

    const existingTasks = [createTask('a'), createTask('b')]
    const snapshot = { tasks: existingTasks, milestones: [] }

    const state: AppState = {
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          color: '#000',
          spreadsheetId: 'sheet-1',
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

  it('reports SYNC_ERROR instead of SYNC_SUCCESS when the sheet push fails', async () => {
    const state: AppState = {
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          color: '#000',
          spreadsheetId: 'sheet-1',
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
  })
})
