import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TasksView from '../views/TasksView'
import type { AppState } from '../lib/state'
import type { DerivedData } from '../lib/selectors'
import type { Task } from '../lib/types'

describe('TasksView', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  })

  afterEach(() => {
    cleanup()
  })

  // Test 1: header removed
  it('should not render the old header text "Tasks" as a standalone heading', () => {
    // Build a mock state with some tasks
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
          name: 'Test Project',
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

    // Mock DerivedData
    const mockDerivedData: DerivedData = {
      rowMap: {
        visibleRows: [
          { type: 'task', id: 't1', level: 0 },
          { type: 'task', id: 't2', level: 0 },
          { type: 'task', id: 't3', level: 0 },
        ],
        rowNumberMap: { t1: 1, t2: 2, t3: 3 },
      } as any,
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      statCards: {
        totalItems: 3,
        totalEstimateDays: 10,
        completedPercent: 33,
        inProgressCount: 1,
        overdueCount: 0,
      },
      statusBreakdown: [],
      upcomingMilestones: [],
      recentActivity: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 0, t2: 50, t3: 100 }
    const mockCriticalSet = new Set<string>()

    const { container } = render(
      <TasksView
        derivedData={mockDerivedData}
        state={mockState}
        dispatch={mockDispatch}
        displaySchedules={mockDisplaySchedules}
        progressMap={mockProgressMap}
        criticalSet={mockCriticalSet}
      />
    )

    // Assert that no element renders "Tasks" as a standalone heading
    const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const tasksHeading = Array.from(headingElements).some((el) => el.textContent?.trim() === 'Tasks')
    expect(tasksHeading).toBe(false)

    // Assert no text matching /\(\d+ shown\)/ appears anywhere
    const bodyText = container.textContent || ''
    expect(bodyText).not.toMatch(/\(\d+ shown\)/)

    // Assert the rest of the view (column headers, rows) still renders normally
    expect(screen.getByText('#')).toBeTruthy() // Column header
    expect(screen.getByText('Name')).toBeTruthy() // Column header
    expect(screen.getByText('Status')).toBeTruthy() // Column header
    expect(screen.getByText('Task 1')).toBeTruthy() // First task
    expect(screen.getByText('Task 2')).toBeTruthy() // Second task
    expect(screen.getByText('Task 3')).toBeTruthy() // Third task
  })
})
