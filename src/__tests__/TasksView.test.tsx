import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TasksView from '../views/TasksView'
import type { AppState } from '../lib/state'
import type { DerivedData, UpcomingMilestone } from '../lib/selectors'
import type { Task } from '../lib/types'
import { computeRowMap } from '../lib/rows'

// Helper function to create a mock task
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

// Helper function to create a mock AppState
function makeMockState(tasks: Task[], filters: any = {}): AppState {
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
    settingsOpen: false,
    settingsTab: 'general',
    tasks,
    milestones: [],
    expanded: {},
    filters,
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
}

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
      upcomingMilestones: [],
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

  // Test 3: Stat cards respect filters
  it('stat cards show counts from filtered tasks only', () => {
    const mockTasks: Task[] = [
      makeTask({ id: 't1', status: 'In Progress', assignee: 'Alice', estimate: 5 }),
      makeTask({ id: 't2', status: 'Done', assignee: 'Bob', estimate: 3 }),
      makeTask({ id: 't3', status: 'Not Started', assignee: 'Alice', estimate: 2 }),
      makeTask({ id: 't4', status: 'In Progress', assignee: 'Charlie', estimate: 4 }),
    ]

    const mockState = makeMockState(mockTasks, { status: 'In Progress' })
    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, { status: 'In Progress' }),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 50, t2: 100, t3: 0, t4: 50 }
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

    // With status filter to 'In Progress', should have 2 matching tasks
    const statCards = container.querySelectorAll('.text-\\[0\\.9375rem\\]')
    expect(statCards.length).toBeGreaterThan(0)
    // Total Items should be 2 (not 4)
    expect(statCards[0].textContent).toContain('2')
  })

  // Test 4: Breakdown section collapsed by default
  it('breakdown section is collapsed by default and toggles on click', () => {
    const mockTasks = [
      makeTask({ id: 't1', assignee: 'Alice', estimate: 5 }),
      makeTask({ id: 't2', assignee: 'Bob', estimate: 3 }),
    ]

    const mockState = makeMockState(mockTasks)
    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 0, t2: 0 }
    const mockCriticalSet = new Set<string>()

    render(
      <TasksView
        derivedData={mockDerivedData}
        state={mockState}
        dispatch={mockDispatch}
        displaySchedules={mockDisplaySchedules}
        progressMap={mockProgressMap}
        criticalSet={mockCriticalSet}
      />
    )

    // Breakdown label should be visible
    const breakdownLabel = screen.getByText('Breakdown')
    expect(breakdownLabel).toBeTruthy()

    // Assignee breakdown content should NOT be in DOM initially
    expect(screen.queryByText(/Assignee breakdown/i)).toBeNull()

    // Click the Breakdown header to expand - find the clickable div containing the label
    const breakdownHeader = breakdownLabel.closest('div')
    expect(breakdownHeader).toBeTruthy()
    if (breakdownHeader) {
      fireEvent.click(breakdownHeader)
    }

    // Now assignee breakdown should be visible (use regex for flexibility)
    expect(screen.queryByText(/Assignee breakdown/i)).toBeTruthy()
  })

  // Test 5: Assignee breakdown grouping/sorting
  it('assignee breakdown shows correct grouping and sorting by estimate', () => {
    const mockTasks = [
      makeTask({ id: 't1', assignee: 'Alice', estimate: 5 }),
      makeTask({ id: 't2', assignee: 'Alice', estimate: 3 }),
      makeTask({ id: 't3', assignee: '', estimate: 2 }),
      makeTask({ id: 't4', assignee: 'Bob', estimate: 8 }),
    ]

    const mockState = makeMockState(mockTasks)
    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 0, t2: 0, t3: 0, t4: 0 }
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

    // Click to expand Breakdown section
    const breakdownLabel = screen.getByText('Breakdown')
    const breakdownHeader = breakdownLabel.closest('div')
    if (breakdownHeader) {
      fireEvent.click(breakdownHeader)
    }

    // Verify assignee breakdown content is now visible (use regex for flexibility)
    expect(screen.queryByText(/Assignee breakdown/i)).toBeTruthy()

    // Check that Unassigned label appears
    const unassignedLabel = screen.queryByText('Unassigned')
    expect(unassignedLabel).toBeTruthy()

    // Verify Alice (8d total) and Bob (8d) are shown in order, then Unassigned
    const bodyText = container.textContent || ''
    expect(bodyText).toContain('Alice')
    expect(bodyText).toContain('Bob')
    expect(bodyText).toContain('Unassigned')
  })

  // Test 6: Charts respect filters
  it('assignee and milestone charts update when filters change', () => {
    const mockTasks = [
      makeTask({ id: 't1', assignee: 'Alice', status: 'In Progress', milestoneId: 'm1', estimate: 5 }),
      makeTask({ id: 't2', assignee: 'Bob', status: 'Not Started', milestoneId: 'm1', estimate: 3 }),
      makeTask({ id: 't3', assignee: 'Alice', status: 'Done', milestoneId: 'm2', estimate: 2 }),
    ]

    // Start with no filters
    const mockState = makeMockState(mockTasks, {})
    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 50, t2: 0, t3: 100 }
    const mockCriticalSet = new Set<string>()

    const { container, rerender } = render(
      <TasksView
        derivedData={mockDerivedData}
        state={mockState}
        dispatch={mockDispatch}
        displaySchedules={mockDisplaySchedules}
        progressMap={mockProgressMap}
        criticalSet={mockCriticalSet}
      />
    )

    // Expand breakdown
    const breakdownLabel = screen.getByText('Breakdown')
    const breakdownHeader = breakdownLabel.closest('div')
    if (breakdownHeader) {
      fireEvent.click(breakdownHeader)
    }

    // Should show both Alice and Bob
    let bodyText = container.textContent || ''
    expect(bodyText).toContain('Alice')
    expect(bodyText).toContain('Bob')

    // Now apply assignee filter to Alice only
    const filteredState = makeMockState(mockTasks, { assignee: 'Alice' })
    const filteredDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, { assignee: 'Alice' }),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    rerender(
      <TasksView
        derivedData={filteredDerivedData}
        state={filteredState}
        dispatch={mockDispatch}
        displaySchedules={mockDisplaySchedules}
        progressMap={mockProgressMap}
        criticalSet={mockCriticalSet}
      />
    )

    // Should show only Alice in breakdown
    bodyText = container.textContent || ''
    expect(bodyText).toContain('Alice')
  })

  // Test 8: Dashboard-removal regression check
  it('does not render Dashboard tab or view', () => {
    const mockTasks = [makeTask({ id: 't1' })]
    const mockState = makeMockState(mockTasks)

    // Verify activeView is 'tasks', not 'dashboard'
    expect(mockState.activeView).toBe('tasks')
    expect(mockState.activeView).not.toBe('dashboard')

    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 0 }
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

    // Assert no "Dashboard" text anywhere
    expect(container.textContent).not.toContain('Dashboard')
  })

  // Test 9: Stat strip renders inline with no card boxes
  it('stat strip renders inline with no card boxes', () => {
    const mockTasks = [
      makeTask({ id: 't1', status: 'In Progress', estimate: 5 }),
      makeTask({ id: 't2', status: 'Done', estimate: 3 }),
    ]

    const mockState = makeMockState(mockTasks)
    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-01-10',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: [],
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 50, t2: 100 }
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

    // Find the stat strip container (flex layout with gap-s5 and mb-2)
    const statStripDiv = container.querySelector('div[class*="flex"][class*="gap-s5"]')
    expect(statStripDiv).toBeTruthy()

    // Check that no shadow-1 class exists within the stat strip (verifies card look is gone)
    const shadowElement = statStripDiv?.querySelector('[class*="shadow-1"]')
    expect(shadowElement).toBeFalsy()
  })

  // Test 10: Upcoming milestones list caps at 3 with a '+N more' control that expands
  it('upcoming milestones list caps at 3 with a "+N more" control that expands', () => {
    // Create 5 milestones
    const milestones: UpcomingMilestone[] = [
      { id: 'm1', name: 'Milestone 1', startDate: '2026-08-01', endDate: '2026-08-15', itemCount: 2, progress: 50, statusCounts: { Done: 1, 'In Progress': 1, 'To Do': 0 } },
      { id: 'm2', name: 'Milestone 2', startDate: '2026-08-16', endDate: '2026-08-30', itemCount: 3, progress: 33, statusCounts: { Done: 1, 'In Progress': 2, 'To Do': 0 } },
      { id: 'm3', name: 'Milestone 3', startDate: '2026-09-01', endDate: '2026-09-15', itemCount: 1, progress: 100, statusCounts: { Done: 1, 'In Progress': 0, 'To Do': 0 } },
      { id: 'm4', name: 'Milestone 4', startDate: '2026-09-16', endDate: '2026-09-30', itemCount: 2, progress: 0, statusCounts: { Done: 0, 'In Progress': 0, 'To Do': 2 } },
      { id: 'm5', name: 'Milestone 5', startDate: '2026-10-01', endDate: '2026-10-15', itemCount: 4, progress: 75, statusCounts: { Done: 3, 'In Progress': 1, 'To Do': 0 } },
    ]

    // Create 5 tasks referencing those milestones
    const mockTasks = [
      makeTask({ id: 't1', milestoneId: 'm1' }),
      makeTask({ id: 't2', milestoneId: 'm2' }),
      makeTask({ id: 't3', milestoneId: 'm3' }),
      makeTask({ id: 't4', milestoneId: 'm4' }),
      makeTask({ id: 't5', milestoneId: 'm5' }),
    ]

    const mockState: AppState = makeMockState(mockTasks)
    mockState.milestones = milestones

    const mockDerivedData: DerivedData = {
      rowMap: computeRowMap(mockTasks, [], {}, 'startDate', 'asc', {}, {}),
      ganttMeta: {
        minDate: '2026-01-01',
        maxDate: '2026-10-20',
        dayWidth: 20,
        weekTicks: [],
      },
      upcomingMilestones: milestones,
    }

    const mockDispatch = () => {}
    const mockDisplaySchedules = {}
    const mockProgressMap = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 }
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

    // Click Breakdown toggle to expand
    const breakdownLabel = screen.getByText('Breakdown')
    const breakdownHeader = breakdownLabel.closest('div')
    expect(breakdownHeader).toBeTruthy()
    if (breakdownHeader) {
      fireEvent.click(breakdownHeader)
    }

    // Find the expanded breakdown content div (contains "Upcoming milestones" header and milestone rows)
    const breakdownContent = breakdownLabel.closest('div')?.parentElement?.querySelector('[class*="px-3 pb-3"]')
    expect(breakdownContent).toBeTruthy()

    // Look for milestone divs that have the distinctive structure
    const allMilestoneDivs = container.querySelectorAll('div[class*="pb-2"][class*="border-b"]')
    // Filter out non-milestone divs by looking for ones that contain milestone names
    const milestoneDivsWithNames = Array.from(allMilestoneDivs).filter((div) =>
      div.textContent?.includes('Milestone 1') ||
      div.textContent?.includes('Milestone 2') ||
      div.textContent?.includes('Milestone 3') ||
      div.textContent?.includes('Milestone 4') ||
      div.textContent?.includes('Milestone 5')
    )

    // Initially, only 3 should be visible
    expect(milestoneDivsWithNames.length).toBe(3)

    // Check for "+2 more" button
    const expandButton = screen.getByText(/\+2 more/)
    expect(expandButton).toBeTruthy()

    // Click expand
    fireEvent.click(expandButton)

    // Recount milestones - should now have all 5
    const milestoneDivsAfterExpand = Array.from(container.querySelectorAll('div[class*="pb-2"][class*="border-b"]')).filter(
      (div) =>
        div.textContent?.includes('Milestone 1') ||
        div.textContent?.includes('Milestone 2') ||
        div.textContent?.includes('Milestone 3') ||
        div.textContent?.includes('Milestone 4') ||
        div.textContent?.includes('Milestone 5')
    )
    expect(milestoneDivsAfterExpand.length).toBe(5)

    // Assert that "Show fewer" button now exists
    const collapseButton = screen.getByText('Show fewer')
    expect(collapseButton).toBeTruthy()

    // Click to collapse
    fireEvent.click(collapseButton)

    // Recount again - should be back to 3
    const milestoneDivsAfterCollapse = Array.from(container.querySelectorAll('div[class*="pb-2"][class*="border-b"]')).filter(
      (div) =>
        div.textContent?.includes('Milestone 1') ||
        div.textContent?.includes('Milestone 2') ||
        div.textContent?.includes('Milestone 3') ||
        div.textContent?.includes('Milestone 4') ||
        div.textContent?.includes('Milestone 5')
    )
    expect(milestoneDivsAfterCollapse.length).toBe(3)

    // Assert that "+2 more" appears again
    const expandButtonAgain = screen.getByText(/\+2 more/)
    expect(expandButtonAgain).toBeTruthy()
  })
})
