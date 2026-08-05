import type { Task, Milestone } from './types'
import type { ComputeRowMapResult } from './rows'
import { computeRowMap } from './rows'
import { TODAY, addDays } from './dates'

export interface GanttMetadata {
  minDate: string
  maxDate: string
  dayWidth: number
  weekTicks: Array<{ date: string; weekNumber: number }>
}

export interface StatCards {
  totalItems: number
  totalEstimateDays: number
  completedPercent: number
  inProgressCount: number
  overdueCount: number
}

export interface AssigneeBreakdown {
  assignee: string // 'Unassigned' for empty/falsy task.assignee
  totalEstimate: number
}

export interface UpcomingMilestone {
  id: string
  name: string
  startDate: string
  endDate: string
  progress: number
  itemCount: number
  statusCounts: { [status: string]: number }
}

export interface DerivedData {
  // Row numbering (for Tasks view)
  rowMap: ComputeRowMapResult

  // Gantt metadata
  ganttMeta: GanttMetadata

  // Milestone aggregates
  upcomingMilestones: UpcomingMilestone[]
}

/**
 * Computes all derived state needed for Tasks/Gantt views
 */
export function computeDerivedData(
  tasks: Task[],
  milestones: Milestone[],
  expanded: { [taskId: string]: boolean },
  sortKey: string,
  sortDir: 'asc' | 'desc',
  filters: Record<string, string>,
  displaySchedules: { [taskId: string]: { start: string; end: string } },
  progressMap: { [taskId: string]: number }
): DerivedData {
  // 1. Row numbering - call computeRowMap with current state
  const rowMap = computeRowMap(
    tasks,
    milestones,
    expanded,
    sortKey,
    sortDir,
    displaySchedules,
    filters as any
  )

  // 2. Gantt metadata
  const ganttMeta = computeGanttMetadata(tasks, displaySchedules)

  // 3. Upcoming milestones
  const upcomingMilestones = computeUpcomingMilestones(
    tasks,
    milestones,
    displaySchedules,
    progressMap
  )

  return {
    rowMap,
    ganttMeta,
    upcomingMilestones,
  }
}

/**
 * Compute gantt metadata including date bounds, day width, and week ticks
 */
function computeGanttMetadata(
  tasks: Task[],
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): GanttMetadata {
  let minDate: string | null = null
  let maxDate: string | null = null

  // Find min and max dates across all tasks
  tasks.forEach((t) => {
    const disp = displaySchedules[t.id]
    if (disp) {
      if (!minDate || disp.start < minDate) minDate = disp.start
      if (!maxDate || disp.end > maxDate) maxDate = disp.end
    }
  })

  // Use defaults if no tasks with schedules
  if (!minDate) {
    minDate = TODAY
    maxDate = addDays(TODAY, 14)
  }

  // Expand range by 3 days on each side
  minDate = addDays(minDate as string, -3)
  maxDate = addDays(maxDate as string, 3)

  const dayWidth = 24

  // Generate week ticks for every Monday from minDate to maxDate
  const weekTicks: Array<{ date: string; weekNumber: number }> = []
  let currentDate = minDate
  while (currentDate <= maxDate) {
    const d = new Date(currentDate + 'T00:00:00')
    // Move to the next Monday if not already on Monday
    const dayOfWeek = d.getDay()
    if (dayOfWeek !== 1) {
      // 1 = Monday
      const daysUntilMonday = (1 - dayOfWeek + 7) % 7
      d.setDate(d.getDate() + (daysUntilMonday || 7))
    }
    currentDate = d.toISOString().slice(0, 10)

    if (currentDate <= maxDate) {
      const weekNumber = getWeekNumber(new Date(currentDate + 'T00:00:00'))
      weekTicks.push({ date: currentDate, weekNumber })
      currentDate = addDays(currentDate, 7)
    }
  }

  return {
    minDate,
    maxDate,
    dayWidth,
    weekTicks,
  }
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return weekNum
}

/**
 * Compute dashboard stat cards
 */
export function computeStatCards(
  tasks: Task[],
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): StatCards {
  const totalItems = tasks.length

  // Total estimate days over top-level tasks only
  const topLevelTasks = tasks.filter((t) => !t.parentId)
  const totalEstimateDays = topLevelTasks.reduce((sum, t) => sum + (t.estimate || 0), 0)

  // Completed percent
  const doneCount = tasks.filter((t) => t.status === 'Done').length
  const completedPercent = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0

  // In progress count
  const inProgressCount = tasks.filter((t) =>
    ['In Progress', 'Started'].includes(t.status)
  ).length

  // Overdue count: status !== 'Done' AND display-end < TODAY
  const overdueCount = tasks.filter((t) => {
    if (t.status === 'Done') return false
    const disp = displaySchedules[t.id]
    return disp && disp.end < TODAY
  }).length

  return {
    totalItems,
    totalEstimateDays,
    completedPercent,
    inProgressCount,
    overdueCount,
  }
}

/**
 * Sum task.estimate grouped by task.assignee, sorted descending by total.
 * Tasks with an empty/falsy assignee are grouped into 'Unassigned' (not dropped).
 */
export function computeAssigneeBreakdown(tasks: Task[]): AssigneeBreakdown[] {
  const totals: { [assignee: string]: number } = {}

  tasks.forEach((t) => {
    const key = t.assignee && t.assignee.trim() ? t.assignee : 'Unassigned'
    totals[key] = (totals[key] || 0) + (t.estimate || 0)
  })

  return Object.entries(totals)
    .map(([assignee, totalEstimate]) => ({ assignee, totalEstimate }))
    .sort((a, b) => b.totalEstimate - a.totalEstimate)
}

/**
 * Compute upcoming milestones (progress < 100) sorted by end date
 */
export function computeUpcomingMilestones(
  tasks: Task[],
  milestones: Milestone[],
  displaySchedules: { [taskId: string]: { start: string; end: string } },
  progressMap: { [taskId: string]: number }
): UpcomingMilestone[] {
  const milestoneData = milestones.map((m) => {
    const milestoneTaskIds = tasks
      .filter((t) => t.milestoneId === m.id)
      .map((t) => t.id)

    // Compute start and end dates from display schedules
    const starts = milestoneTaskIds
      .map((id) => displaySchedules[id]?.start || TODAY)
      .sort()
    const ends = milestoneTaskIds
      .map((id) => displaySchedules[id]?.end || TODAY)
      .sort()

    const startDate = starts.length > 0 ? starts[0] : TODAY
    const endDate = ends.length > 0 ? ends[ends.length - 1] : TODAY

    // Compute progress: average of task progress
    const progress =
      milestoneTaskIds.length > 0
        ? Math.round(
            milestoneTaskIds.reduce((sum, id) => sum + (progressMap[id] || 0), 0) /
              milestoneTaskIds.length
          )
        : 0

    // Count tasks per status
    const statusCounts: { [status: string]: number } = {}
    tasks.forEach((t) => {
      if (t.milestoneId === m.id) {
        if (!statusCounts[t.status]) {
          statusCounts[t.status] = 0
        }
        statusCounts[t.status]++
      }
    })

    return {
      id: m.id,
      name: m.name,
      startDate,
      endDate,
      progress,
      itemCount: milestoneTaskIds.length,
      statusCounts,
    }
  })

  // Filter to progress < 100 and sort by endDate ascending
  return milestoneData
    .filter((m) => m.progress < 100)
    .sort((a, b) => (a.endDate < b.endDate ? -1 : 1))
}

