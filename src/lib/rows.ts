import type { Task, Milestone } from './types'
import { sortSiblings } from './sort'

export interface ComputeRowMapResult {
  rowNumberMap: { [taskId: string]: number }
  numberToId: { [number: number]: string }
  visibleRows: Array<{ id: string; type: 'milestone' | 'task'; level: number }>
}

export function computeRowMap(
  tasks: Task[],
  milestones: Milestone[],
  expanded: { [taskId: string]: boolean },
  sortKey: string,
  sortDir: 'asc' | 'desc',
  displaySchedules: { [taskId: string]: { start: string; end: string } },
  filters: {
    status?: string
    category?: string
    assignee?: string
    milestone?: string
    search?: string
  }
): ComputeRowMapResult {
  // Check if any filter is active
  const anyFilter =
    (filters.status && filters.status !== 'All') ||
    (filters.category && filters.category !== 'All') ||
    (filters.assignee && filters.assignee !== 'All') ||
    (filters.milestone && filters.milestone !== 'All') ||
    (filters.search && filters.search.trim())

  // Filter matching function - AND-combined filters
  const matches = (t: Task): boolean => {
    if (filters.status && filters.status !== 'All' && t.status !== filters.status) {
      return false
    }
    if (filters.category && filters.category !== 'All' && t.category !== filters.category) {
      return false
    }
    if (filters.assignee && filters.assignee !== 'All' && t.assignee !== filters.assignee) {
      return false
    }
    if (filters.milestone && filters.milestone !== 'All' && t.milestoneId !== filters.milestone) {
      return false
    }
    if (filters.search && filters.search.trim() && !t.name.toLowerCase().includes(filters.search.trim().toLowerCase())) {
      return false
    }
    return true
  }

  // Build row number map and visible rows
  const rowNumberMap: { [taskId: string]: number } = {}
  const visibleRows: Array<{ id: string; type: 'milestone' | 'task'; level: number }> = []
  let rowCounter = 0

  // Recursively walk a task and all of its descendants (arbitrary depth),
  // pushing rows into `target`. Descendants are only walked while every
  // ancestor along the way is expanded.
  const walk = (
    t: Task,
    level: number,
    target: Array<{ id: string; type: 'milestone' | 'task'; level: number }>
  ) => {
    if (matches(t)) {
      rowCounter++
      rowNumberMap[t.id] = rowCounter
      target.push({ id: t.id, type: 'task', level })
    }

    const isExpanded = expanded[t.id] !== false
    if (isExpanded) {
      const childrenOfTask = tasks.filter((k) => k.parentId === t.id)
      const kids = sortSiblings(childrenOfTask, t.id, sortKey, sortDir, displaySchedules)
      kids.forEach((k) => walk(k, level + 1, target))
    }
  }

  milestones.forEach((m) => {
    // Get top-level tasks for this milestone
    const topLevelTasksInMilestone = tasks.filter((t) => t.milestoneId === m.id && !t.parentId)
    const tops = sortSiblings(topLevelTasksInMilestone, null, sortKey, sortDir, displaySchedules)

    const localRows: Array<{ id: string; type: 'milestone' | 'task'; level: number }> = []

    tops.forEach((t) => walk(t, 0, localRows))

    // Add milestone row if it has children rows or no filter is active
    if (localRows.length > 0 || !anyFilter) {
      visibleRows.push({ id: m.id, type: 'milestone', level: 0 })
      visibleRows.push(...localRows)
    }
  })

  // Tasks not tied to any existing milestone (e.g. no milestones created yet)
  // still need to be rendered, otherwise they're added but never shown.
  const milestoneIds = new Set(milestones.map((m) => m.id))
  const unassignedTopLevel = tasks.filter((t) => !t.parentId && !milestoneIds.has(t.milestoneId as string))
  const sortedUnassigned = sortSiblings(unassignedTopLevel, null, sortKey, sortDir, displaySchedules)

  sortedUnassigned.forEach((t) => walk(t, 0, visibleRows))

  // Build reverse map (number -> id)
  const numberToId: { [number: number]: string } = {}
  Object.keys(rowNumberMap).forEach((id) => {
    numberToId[rowNumberMap[id]] = id
  })

  return {
    rowNumberMap,
    numberToId,
    visibleRows,
  }
}
