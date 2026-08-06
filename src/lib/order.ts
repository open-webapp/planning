import type { Task, Milestone } from './types'
import { sortSiblings } from './sort'

/** Gap used when appending past an end (no neighbor on that side). */
const ORDER_GAP = 1000

/**
 * Fractional/gap-based index: returns a value strictly between `before` and
 * `after` (both optional — omit the side that has no neighbor). Only the
 * single moved task's `order` is ever written by callers of this function;
 * neighbors are untouched.
 */
export function computeOrderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return ORDER_GAP
  if (before === undefined) return after! - ORDER_GAP
  if (after === undefined) return before + ORDER_GAP
  return (before + after) / 2
}

/**
 * Sibling-group key matching computeRowMap's actual grouping:
 * - parentId !== null: keyed purely by parentId (a parent task belongs to
 *   exactly one milestone, so parentId alone disambiguates the group).
 * - parentId === null: keyed by milestoneId, UNLESS that milestoneId doesn't
 *   correspond to a live milestone, in which case every such "orphaned" task
 *   collapses into one shared '__unassigned__' bucket — mirroring
 *   computeRowMap's `unassignedTopLevel` (src/lib/rows.ts:104), which lumps
 *   every non-live milestoneId into a single flat sortSiblings(...) call.
 */
export function siblingGroupKey(
  milestoneId: string | null,
  parentId: string | null,
  milestoneIds: Set<string>
): string {
  if (parentId !== null) return `p:${parentId}`
  const bucket = milestoneId !== null && milestoneIds.has(milestoneId) ? milestoneId : '__unassigned__'
  return `m:${bucket}`
}

/** All tasks belonging to the same sibling group as `t`. */
export function getSiblingGroup(tasks: Task[], milestones: Milestone[], t: Task): Task[] {
  const milestoneIds = new Set(milestones.map((m) => m.id))
  const key = siblingGroupKey(t.milestoneId, t.parentId, milestoneIds)
  return tasks.filter((x) => siblingGroupKey(x.milestoneId, x.parentId, milestoneIds) === key)
}

/**
 * Has this sibling group already been backfilled? True if every member has a
 * non-zero `order` (0 is the "never touched" sentinel from Phase 1) OR the
 * group is empty/singleton (trivially "ordered").
 */
export function isGroupBackfilled(group: Task[]): boolean {
  return group.length <= 1 || group.every((t) => t.order !== 0)
}

/**
 * Lazily backfill `order` for exactly the given sibling group, seeded from
 * its current display order under the previously-active column sort
 * (sortKey/sortDir) — i.e. whatever sortSiblings would have produced right
 * before switching to manual mode. Returns a new full `tasks` array with only
 * this group's members patched; every other task is returned unchanged
 * (same reference), so callers can do a plain array replace.
 */
export function backfillGroupOrders(
  tasks: Task[],
  group: Task[],
  sortKey: string,
  sortDir: 'asc' | 'desc',
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): Task[] {
  if (group.length === 0) return tasks
  // sortSiblings filters by parentId only (src/lib/sort.ts:13) — safe here
  // since `group` is already fully scoped to one sibling group (Phase 2's
  // siblingGroupKey), so passing any member's parentId reproduces the same
  // filter as a no-op subset check.
  const ordered = sortSiblings(group, group[0].parentId, sortKey, sortDir, displaySchedules)
  const orderById = new Map(ordered.map((t, i) => [t.id, (i + 1) * ORDER_GAP]))
  return tasks.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t))
}
