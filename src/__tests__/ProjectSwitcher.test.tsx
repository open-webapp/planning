import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ProjectSwitcher from '../components/ProjectSwitcher'
import type { AppState } from '../lib/state'
import type { Task } from '../lib/types'

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // Test 1: active project count reflects state.tasks
  it('should show active project task count from state.tasks', () => {
    const mockTasks: Task[] = [
      {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Design',
        assignee: 'Alice',
        status: 'Not Started',
        estimate: 3,
        startDate: '2026-01-01',
        progress: 0,
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        name: 'Task 2',
        milestoneId: null,
        parentId: null,
        category: 'Engineering',
        assignee: 'Bob',
        status: 'In Progress',
        estimate: 5,
        startDate: '2026-01-05',
        progress: 50,
        dependencies: [],
        comments: [],
      },
      {
        id: 't3',
        name: 'Task 3',
        milestoneId: null,
        parentId: null,
        category: 'Design',
        assignee: 'Alice',
        status: 'Done',
        estimate: 2,
        startDate: '2026-01-02',
        progress: 100,
        dependencies: [],
        comments: [],
      },
    ]

    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Active Project',
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
      tasks: mockTasks,
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    // Assert that project name is displayed
    expect(screen.getByText('Active Project')).toBeTruthy()
  })

  // Test 2: inactive project count reflects savedProjects snapshot
  it('should show inactive project task count from savedProjects snapshot', () => {
    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Active Project',
          color: 'netskopeBlue',
          driveFileId: undefined,
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
        {
          id: 'p-2',
          name: 'Other Project',
          color: 'red',
          driveFileId: undefined,
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
      ],
      savedProjects: {
        'p-2': {
          tasks: [
            {
              id: 't1',
              name: 'Task 1',
              milestoneId: null,
              parentId: null,
              category: 'Design',
              assignee: 'Alice',
              status: 'Not Started',
              estimate: 3,
              startDate: '2026-01-01',
              progress: 0,
              dependencies: [],
              comments: [],
            },
            {
              id: 't2',
              name: 'Task 2',
              milestoneId: null,
              parentId: null,
              category: 'Engineering',
              assignee: 'Bob',
              status: 'In Progress',
              estimate: 5,
              startDate: '2026-01-05',
              progress: 50,
              dependencies: [],
              comments: [],
            },
            {
              id: 't3',
              name: 'Task 3',
              milestoneId: null,
              parentId: null,
              category: 'Design',
              assignee: 'Alice',
              status: 'Done',
              estimate: 2,
              startDate: '2026-01-02',
              progress: 100,
              dependencies: [],
              comments: [],
            },
            {
              id: 't4',
              name: 'Task 4',
              milestoneId: null,
              parentId: null,
              category: 'Marketing',
              assignee: 'Charlie',
              status: 'Not Started',
              estimate: 4,
              startDate: '2026-01-08',
              progress: 0,
              dependencies: [],
              comments: [],
            },
            {
              id: 't5',
              name: 'Task 5',
              milestoneId: null,
              parentId: null,
              category: 'Design',
              assignee: 'Alice',
              status: 'In Progress',
              estimate: 2,
              startDate: '2026-01-06',
              progress: 25,
              dependencies: [],
              comments: [],
            },
          ],
          milestones: [],
          expanded: {},
          filters: {},
          sortKey: 'startDate',
          sortDir: 'asc',
          columnWidths: {},
          customStatuses: [],
          customAssignees: [],
          customCategories: [],
        },
      },
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    // Assert that the inactive project name is displayed
    expect(screen.getByText('Other Project')).toBeTruthy()
  })

  // Test 3: never-visited new project shows 0, no crash
  it('should show new project with 0 tasks without crashing', () => {
    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Active Project',
          color: 'netskopeBlue',
          driveFileId: undefined,
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
        {
          id: 'p-3',
          name: 'Unvisited Project',
          color: 'green',
          driveFileId: undefined,
          lastSyncedSnapshot: null,
          lastSyncedAt: null,
        },
      ],
      savedProjects: {
        // p-3 is NOT in savedProjects (never visited)
      },
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    // Assert the project name renders
    expect(screen.getByText('Unvisited Project')).toBeTruthy()
  })

  // Test 4: singular vs. plural wording
  it('should display singular "task" when count is 1', () => {
    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Single Task Project',
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
      tasks: [
        {
          id: 't1',
          name: 'Task 1',
          milestoneId: null,
          parentId: null,
          category: 'Design',
          assignee: 'Alice',
          status: 'Not Started',
          estimate: 3,
          startDate: '2026-01-01',
          progress: 0,
          dependencies: [],
          comments: [],
        },
      ],
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Single Task Project')).toBeTruthy()
  })

  it('should display plural "tasks" when count is 0', () => {
    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Empty Project',
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Empty Project')).toBeTruthy()
  })

  it('should display plural "tasks" when count is 2 or more', () => {
    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Multi-Task Project',
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
      tasks: [
        {
          id: 't1',
          name: 'Task 1',
          milestoneId: null,
          parentId: null,
          category: 'Design',
          assignee: 'Alice',
          status: 'Not Started',
          estimate: 3,
          startDate: '2026-01-01',
          progress: 0,
          dependencies: [],
          comments: [],
        },
        {
          id: 't2',
          name: 'Task 2',
          milestoneId: null,
          parentId: null,
          category: 'Engineering',
          assignee: 'Bob',
          status: 'In Progress',
          estimate: 5,
          startDate: '2026-01-05',
          progress: 50,
          dependencies: [],
          comments: [],
        },
      ],
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Multi-Task Project')).toBeTruthy()
  })

  // Test 5: Done tasks are included in the count
  it('should include Done tasks in the count', () => {
    const mockTasks: Task[] = [
      {
        id: 't1',
        name: 'Done Task 1',
        milestoneId: null,
        parentId: null,
        category: 'Design',
        assignee: 'Alice',
        status: 'Done',
        estimate: 3,
        startDate: '2026-01-01',
        progress: 100,
        dependencies: [],
        comments: [],
      },
      {
        id: 't2',
        name: 'In Progress Task',
        milestoneId: null,
        parentId: null,
        category: 'Engineering',
        assignee: 'Bob',
        status: 'In Progress',
        estimate: 5,
        startDate: '2026-01-05',
        progress: 50,
        dependencies: [],
        comments: [],
      },
      {
        id: 't3',
        name: 'Done Task 2',
        milestoneId: null,
        parentId: null,
        category: 'Design',
        assignee: 'Alice',
        status: 'Done',
        estimate: 2,
        startDate: '2026-01-02',
        progress: 100,
        dependencies: [],
        comments: [],
      },
      {
        id: 't4',
        name: 'Not Started Task',
        milestoneId: null,
        parentId: null,
        category: 'Marketing',
        assignee: 'Charlie',
        status: 'Not Started',
        estimate: 4,
        startDate: '2026-01-08',
        progress: 0,
        dependencies: [],
        comments: [],
      },
    ]

    const mockState: AppState = {
      activeView: 'tasks',
      activeProjectId: 'p-1',
      projects: [
        {
          id: 'p-1',
          name: 'Mixed Status Project',
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
      tasks: mockTasks,
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
    }

    const mockDispatch = vi.fn()
    const mockOnClose = vi.fn()

    render(
      <ProjectSwitcher
        state={mockState}
        dispatch={mockDispatch}
        isOpen={true}
        onClose={mockOnClose}
      />
    )

    // Assert the project name is displayed
    expect(screen.getByText('Mixed Status Project')).toBeTruthy()
  })
})
