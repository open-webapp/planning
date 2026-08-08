import type { Task } from './types'

export function sortSiblings(
  tasks: Task[],
  parentId: string | null,
  sortKey: string,
  sortDir: 'asc' | 'desc',
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): Task[] {
  // Filter to siblings with the same parentId first
  const siblings = tasks.filter(t => t.parentId === parentId)

  if (!sortKey) return siblings

  const dir = sortDir === 'desc' ? -1 : 1

  const val = (t: Task) => {
    switch (sortKey) {
      case 'name':
        return t.name.toLowerCase()
      case 'category':
        return t.category
      case 'status':
        return t.status
      case 'assignee':
        return t.assignee
      case 'start':
        return t.startDate
      case 'estimate':
        return t.estimate || 0
      case 'end':
        return displaySchedules[t.id] ? displaySchedules[t.id].end : t.startDate
      case 'progress':
        return t.progress || 0
      case 'manual':
        return t.order || 0
      default:
        return 0
    }
  }

  return [...siblings].sort((a, b) => {
    const av = val(a)
    const bv = val(b)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}
