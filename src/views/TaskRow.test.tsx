import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskRow from './TaskRow'
import type { Task } from '../lib/types'
import type { AppState } from '../lib/state'

function makeTask(overrides: Partial<Task> = {}): Task {
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
    authByProject: {},
    settingsOpen: false,
    settingsTab: 'general',
    tasks: [makeTask({ id: 't1' })],
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

describe('TaskRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders task name', () => {
    const task = makeTask({ name: 'Build API' })
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
      />
    )

    expect(screen.getByDisplayValue('Build API')).toBeTruthy()
  })

  it('dispatches SELECT_TASK on row click', () => {
    const task = makeTask({ id: 't1', name: 'Test Task' })
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
      />
    )

    // Click the main row container
    const row = container.querySelector('[class*="flex"][class*="group"][class*="border-b"]')
    if (row) {
      fireEvent.click(row)
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SELECT_TASK',
          taskId: 't1',
        })
      )
    }
  })

  it('renders grip handle with proper classes when dragDisabled is false', () => {
    const task = makeTask()
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
        dragDisabled={false}
      />
    )

    const gripHandle = container.querySelector('[class*="cursor-grab"]')
    expect(gripHandle).toBeTruthy()
    expect(gripHandle?.classList.contains('cursor-not-allowed')).toBe(false)
  })

  it('renders grip handle with disabled appearance when dragDisabled is true', () => {
    const task = makeTask()
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
        dragDisabled={true}
      />
    )

    const gripHandle = container.querySelector('[class*="cursor-not-allowed"]')
    expect(gripHandle).toBeTruthy()
    expect(gripHandle?.getAttribute('title')).toContain('Clear filters to reorder')
  })

  it('shows tooltip on grip handle when drag is disabled', () => {
    const task = makeTask()
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
        dragDisabled={true}
      />
    )

    const gripHandle = container.querySelector('[title*="Clear filters"]')
    expect(gripHandle).toBeTruthy()
  })

  it('applies selected styling when isSelected is true', () => {
    const task = makeTask()
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={true}
        state={state}
        dispatch={dispatch}
      />
    )

    const row = container.querySelector('[class*="bg-\\[color-mix"]')
    expect(row).toBeTruthy()
  })

  it('renders textarea with task name', () => {
    const task = makeTask({ name: 'Original Name' })
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    const { container } = render(
      <TaskRow
        task={task}
        taskNumber={1}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
      />
    )

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeTruthy()
    expect(textarea?.value).toBe('Original Name')
  })

  it('renders task number in correct column', () => {
    const task = makeTask()
    const state = makeMockState({ tasks: [task] })
    const dispatch = vi.fn()

    const columns = [
      { name: 'number', label: '#', key: 'number' },
      { name: 'name', label: 'Task', key: 'name' },
    ]

    render(
      <TaskRow
        task={task}
        taskNumber={42}
        level={0}
        columns={columns}
        getColumnWidth={() => 200}
        displaySchedules={{}}
        progress={0}
        isCritical={false}
        hasChildren={false}
        isExpanded={false}
        isSelected={false}
        state={state}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('42')).toBeTruthy()
  })
})
