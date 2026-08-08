# Tasks View Row Reorder — Implementation Plan

## Overview

Let users reorder task rows in the Tasks grid — via **Alt/Option+ArrowUp/Down** (keyboard) or **drag-and-drop** (mouse/trackpad, using a new grip handle) — with the new order persisted permanently on the `Task` record itself, not just in local UI state.

Scope, per the resolved interview:

1. Add `order: number` to `Task` (`src/lib/types.ts`), using fractional/gap-based indexing so only the **moved task's** `order` is written per move — sibling `order` values are never rewritten in bulk (except the one-time lazy backfill, see below).
2. "Siblings" = same `milestoneId` **and** same `parentId`, matching the grouping `sortSiblings`/`computeRowMap` already use.
3. A new `'manual'` sort mode drives row order from `task.order` instead of a column value. The first drag or Alt+Arrow move on any row switches `state.sortKey` to `'manual'` (replacing whatever column sort was active) and lazily backfills `order` for just the sibling group(s) touched by that move, seeded from their current (pre-switch) display order.
4. Cross-group moves (dragging into a different milestone/parent section, or Alt+Up/Down flowing past the edge of the current sibling group into the next one at the same depth) reassign `milestoneId`/`parentId` on the moved task. Alt+Left/Right (existing indent/outdent) remains the only way to deliberately change depth/parent.
5. Whole subtrees move together — descendants keep pointing at the moved task and follow its `milestoneId` if that changed. No orphaning.
6. Milestone header rows are not reorderable — only task rows, only within/between task sibling groups.
7. Drag is implemented with `@dnd-kit/core` (new dependency), added via a dedicated grip handle (not the whole row).
8. Reordering (both drag handle and Alt+Arrow) is disabled whenever any filter is active, since hidden siblings make position/backfill ambiguous.
9. `order` needs no special-casing in `src/lib/sync.ts` — it flows through the existing generic field-level diff/merge exactly like every other `Task` field.

No undo/redo system exists in this repo (confirmed via `grep -rn "undo\|redo" src` returning nothing relevant) — moves are plain dispatched reducer actions, same as any other edit.

### Key existing-code findings that shape this plan

- **`Task` (`src/lib/types.ts:8-22`)** has no `order` field today. It's a flat interface (no nested schedule/position data) — adding `order: number` (required, not optional) means every code path that constructs a `Task` literal must supply it. Grep for `id: uid('t')` / task-literal construction sites: `addTask` (`src/lib/state.ts:762-775`), `addSubtask` (`src/lib/state.ts:819-832`), CSV import (`src/lib/csv.ts:89-103`), and any test fixture's `makeTask()` helper (`src/lib/rows.test.ts:5-19`, `src/__tests__/TasksView.test.tsx:10-26`). All must be updated to supply `order` (see Phase 1).
- **`sortSiblings` (`src/lib/sort.ts`)** is a pure function: given a flat `tasks` array, a `parentId`, and a sort key/dir, it filters `tasks.filter(t => t.parentId === parentId)` (line 13) then sorts by a `val()` switch (lines 17-38) with a `default: return 0` fallback for unknown `sortKey` values (line 36) — this means an unrecognized `sortKey` like `'manual'` today would return all siblings in their **stable relative order** (since `Array.prototype.sort` is stable and `val()` always returns `0`), which happens to already equal "whatever order they appear in `state.tasks`" — but that's an accident of the `default` branch, not real `order`-based sorting, so a real `'manual'` case must be added explicitly (Phase 3).
- **`computeRowMap` (`src/lib/rows.ts:41-120`)** does the actual grouping used by the grid:
  - Top-level tasks per milestone: `tasks.filter(t => t.milestoneId === m.id && !t.parentId)` (line 87), then `sortSiblings(topLevelTasksInMilestone, null, ...)` (line 88) — the **milestoneId scoping happens in this pre-filter, not inside `sortSiblings`**.
  - Nested children: inside `walk()`, `childrenOfTask = tasks.filter(k => k.parentId === t.id)` (line 79) then `sortSiblings(childrenOfTask, t.id, ...)` (line 80) — scoped by `parentId` only; a `parentId` uniquely determines a single parent task (and therefore a single conceptual milestone), so this is consistent with "same milestoneId AND same parentId" even though `sortSiblings` itself never checks `milestoneId`.
  - Tasks with no live milestone: `unassignedTopLevel = tasks.filter(t => !t.parentId && !milestoneIds.has(t.milestoneId))` (line 104) — this is **one single flat bucket** merging every distinct "orphaned" `milestoneId` value (including `null`) into one `sortSiblings` call (line 105), not sub-grouped further. This is a pre-existing quirk (out of scope to fix) — for this feature's group-key math (Phase 2), an "unassigned" group is likewise treated as one bucket (keyed `'m:__unassigned__'`), matching what's actually rendered as one contiguous run of rows with no milestone header.
  - `computeRowMap` already takes a `filters` param and computes `anyFilter` (lines 51-56) to decide whether to still show an empty milestone section — this `anyFilter` boolean is exactly what Phase 9 (disable-when-filtered) reuses; no new filter-detection logic needed.
- **`AppState` (`src/lib/state.ts:6-58`)**: `sortKey: string` (line 45, untyped union — any string is legal, so `'manual'` needs no type change) defaults to `'startDate'` via `emptyProjectState()` (line 86). `selectedTaskId?: string` (line 33) already exists and is exactly the "focused row" the interview specifies reusing. `filters` (lines 38-44) is the shape `taskMatchesFilters`/`filterTasksByFilters` (`src/lib/rows.ts:18-39`, already extracted/exported — the Dashboard-merge plan already did this refactor) consume.
- **`indentTask`/`outdentTask` (`src/lib/state.ts:349-411`)** are the existing depth-change operations (`INDENT_TASK`/`OUTDENT_TASK`, wired in `src/lib/reducer.ts:50-54`, triggered today via Tab/Shift+Tab in `TaskRow.tsx:72-84`). Per requirement, Alt+Left/Right reuses these unchanged for depth changes. However: they currently reposition the task by **splicing the flat `state.tasks` array** (e.g. `outdentTask`'s `withoutT.splice(insertPos, 0, ...)`, line 405) — this array-position splicing is meaningless once `sortKey === 'manual'` (row order comes from `task.order`, not array position). Phase 4 adds a small patch: when `state.sortKey === 'manual'`, `indentTask`/`outdentTask` additionally assign the moved task a fresh `order` value (appended to the end of its *new* sibling group) so it doesn't render at an arbitrary/stale position after a depth change made in manual mode. This is called out explicitly since it's not a literal "move" action but does affect manual-mode row position.
- **`addTask` (`src/lib/state.ts:751-789`)**: creates a task inheriting `milestoneId`/`parentId`/etc. from `state.selectedTaskId`'s task ("anchor") if set, else appends to the global end; splices into `state.tasks` right after the anchor (or appends). Phase 10 adds `order` assignment here: if the anchor's sibling group already has backfilled `order` values, insert `order` between the anchor and its next-in-group sibling (mirroring the array-splice insertion point); otherwise (group never touched / no anchor) leave `order` at a default sentinel (see Phase 2) — the group gets backfilled the first time anyone actually reorders it, per the lazy-backfill design.
- **`toggleSort` (`src/lib/state.ts:545-551`)**, wired to `TOGGLE_SORT` (`reducer.ts:60-61`), is dispatched from `TasksView.tsx`'s column header `onClick` (lines 321-325: `dispatch({ type: 'TOGGLE_SORT', sortKey: col.key })`). Clicking a column header already fully re-enables column sort (sets `sortKey` to that column, `sortDir: 'asc'`) with **no code change needed** — this is confirmed the "escape hatch" back from manual mode per requirement 8's judgment call (see Phase 3 note: no dedicated "Custom order" pseudo-header is added, since the requirement explicitly allows either judgment call and this is the lower-diff option).
- **`getSortIndicator` (`TasksView.tsx:159-162`)**: `if (state.sortKey !== colName) return ''` — since no column's `key` is `'manual'`, this naturally returns `''` for every column header once `sortKey === 'manual'`, confirmed with no change needed (matches requirement 8's expectation).
- **Row click / selection (`TaskRow.tsx`)**: the row's root `<div>` (lines 379-398) has **no `onClick` at all** today — only individual interactive cells (`onClick={(e) => e.stopPropagation()}` on the name textarea line 133, start-date input line 277, estimate input line 292, progress input line 341) and a few cells with real actions (expand chevron line 108, details pill line 154, deps pill line 308, delete button line 355, each already stopping propagation or being a distinct clickable target). This confirms: clicking the row body today does nothing to `selectedTaskId` — Phase 6 must add a row-level click handler on the non-interactive area (the row `<div>` itself, since children `stopPropagation()` already shield their own click handling).
- **No visible "selected row" style exists** — `TaskRow`'s root `className` is a static string (`"flex border-b border-divider transition-colors hover:bg-ink-50"`, line 381) with no conditional selected-state class. Phase 6 adds one.
- **`src/lib/sync.ts`'s `diffEntity`** (lines 29-65) iterates `for (const key in current)` / `allKeys` and only special-cases `skipFields = ['comments', 'notes']` (line 32) — any other own field, including a new `order: number`, is diffed/merged generically by the existing three-way-merge logic (`threeWayMerge`, lines 165-438). **No changes needed to `sync.ts`** — confirmed by reading the full file; this plan explicitly does not touch it, it only must avoid adding `'order'` to any exclusion list (there is none to add to).
- **`package.json`** has no `@dnd-kit/*` dependency today (`dependencies`: `lucide-react`, `papaparse`, `react`, `react-dom`). `@dnd-kit/core` (and optionally `@dnd-kit/sortable`) must be added.
- **Existing test conventions**: Vitest + `@testing-library/react` (`vitest run`, `@testing-library/react` render/fireEvent). `src/lib/rows.test.ts` and `src/__tests__/TasksView.test.tsx` both hand-roll a local `makeTask(overrides)` helper returning a fully-populated `Task` object — these helpers must be updated to include `order` once the field is added, or every existing test using them fails to typecheck. No dedicated `state.test.ts` or `reducer.test.ts` file exists yet — Phase 11 introduces the first ones (or extends `rows.test.ts`-adjacent conventions) for the new pure functions in `src/lib/order.ts` and the new `state.ts` move functions.
- **`seed.ts`'s `seedData()`** (`src/lib/seed.ts:12-17`) returns `{ milestones: [], tasks: [] }` — genuinely empty, so there's no actual pre-existing seed data to backfill; the "lazy backfill" requirement is really about CSV-imported and previously-synced/persisted tasks, not the seed. Confirmed via read.
- **CSV import (`src/lib/csv.ts:62-103`)**: `parseTasksCsvString`'s task literal (lines 89-103) has no `order` field and — separately, pre-existing and out of scope — hardcodes `parentId: null` for every imported row (flattens hierarchy on import). Since imported tasks have no `order`, they fall under the same lazy-backfill path as any other un-ordered sibling group; no special CSV-side change is needed.

---

## Phases

### Phase 1: Add `order` Field to `Task` (T0)
**File:** `src/lib/types.ts`
**Depends on:** None
**Duration:** 10 min

- Add `order: number` to the `Task` interface, right after `progress`:

```ts
export interface Task {
  id: string
  name: string
  milestoneId: string | null
  parentId: string | null
  category: string
  assignee: string
  status: string
  estimate: number // days
  startDate: string // YYYY-MM-DD
  progress: number // 0-100
  order: number // manual sort position within a (milestoneId, parentId) sibling group; lazily backfilled, see src/lib/order.ts
  dependencies: string[] // array of task ids
  comments: Comment[]
  notes?: string
}
```

- This makes `order` **required** (not `order?: number`), matching every other structural field (`progress`, `estimate`, etc.) — deliberately not optional, so every task literal must supply a value. Un-backfilled tasks get a documented sentinel value `0` (see Phase 2) rather than `undefined`, which keeps all the field-level-diff logic in `sync.ts` (which iterates `for (const key in current)`, unaffected by an optional-vs-required distinction, but simpler for every other call site) working without special-casing `undefined`.
- Update every `Task`-literal construction site to add `order: 0` (the "not yet backfilled" sentinel — Phase 4/10 assign real values once a group is touched):
  - `src/lib/state.ts`: `addTask` (around line 770, inside the `task: Task = {...}` literal) and `addSubtask` (around line 826, inside the `sub: Task = {...}` literal) — Phase 10 revisits `addTask` specifically to do better than the `0` sentinel when the anchor's group is already backfilled, but the baseline `order: 0` must land here first so the file typechecks.
  - `src/lib/csv.ts`: `parseTasksCsvString`'s task-literal `return { ... }` (lines 89-101) — add `order: 0`.
  - `src/lib/rows.test.ts`'s `makeTask()` helper (lines 5-19) — add `order: 0` to the defaults.
  - `src/__tests__/TasksView.test.tsx`'s `makeTask()` helper (lines 10-26) and the inline task literals further down in the same file (e.g. lines 78-121) — add `order: 0`.
  - Grep once more after edits: `grep -rn "comments: \[\]," src --include=*.ts --include=*.tsx` to catch every task-literal site by proximity to the `comments: []` line that's already present in all of them, and confirm each got an `order` field.

**Test case (Phase 11):** `npm run typecheck` passes with the new required field — this is the fastest signal that every construction site was updated; no behavior to unit-test yet (pure type change).

---

### Phase 2: Fractional-Index & Sibling-Group Helpers (T0)
**File:** `src/lib/order.ts` (new)
**Depends on:** Phase 1
**Duration:** 25 min

New pure-function module, no framework dependency, used by both `sort.ts`/`rows.ts` (Phase 3) and `state.ts` (Phase 4):

```ts
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
```

- `ORDER_GAP = 1000` chosen to allow ~10 successive midpoint-splits before floating-point precision becomes a practical concern (each split halves the remaining gap; `1000 / 2^10 ≈ 1`, still far above float epsilon) — acceptable for a task list (not a use case with thousands of same-gap insertions between two fixed neighbors).
- `order: 0` sentinel (Phase 1) plus `ORDER_GAP = 1000` as the first backfilled value means "un-backfilled" (`0`) always sorts before any backfilled value in a plain ascending numeric comparison — a harmless coincidence, not relied upon anywhere (manual-mode sort only ever runs after backfill has already assigned every group member a real value, per Phase 3/4 design — no code path sorts a mix of backfilled and un-backfilled siblings in the same group).

**Test case (Phase 11):** Unit tests for `computeOrderBetween` (both-undefined → `1000`; one-sided → `±1000` off the given neighbor; both-sided → exact midpoint), `siblingGroupKey` (same `parentId` → same key regardless of `milestoneId`; `parentId: null` with a live `milestoneId` → keyed by that id; `parentId: null` with a stale/`null` `milestoneId` → `'m:__unassigned__'`), `getSiblingGroup` (returns only same-group members), `isGroupBackfilled` (empty/singleton → true; all-zero → false; mixed → false; all-nonzero → true), `backfillGroupOrders` (assigns strictly increasing multiples of 1000 in the pre-existing column-sort order; tasks outside the group are untouched, same object reference).

---

### Phase 3: `'manual'` Sort Mode in `sortSiblings` (T1)
**File:** `src/lib/sort.ts`
**Depends on:** Phase 1
**Duration:** 15 min

Add a `'manual'` branch to the `val()` switch so a task's sort value under manual mode is its `order` field, with sort direction pinned to ascending (manual order has no meaningful "descending" toggle — flipping it would just invert every list, which the UI never exposes since clicking a column header, not the row order itself, is what changes `sortDir`):

```ts
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
```

- Since `dir` (line 15) is still derived from `sortDir` and multiplies the comparison, a manual-mode sort with `sortDir: 'desc'` WOULD invert the list — this is intentionally left as-is (no special-casing) since nothing in this plan ever sets `sortDir` to `'desc'` while `sortKey === 'manual'` (Phase 4's mode-switch always sets `sortDir: 'asc'` alongside `sortKey: 'manual'`, see Phase 4). Documented here as a judgment call: simplicity over defensive-coding a state combination the UI never produces.
- No changes needed to `computeRowMap` itself beyond what Phase 1's `Task.order` field already provides — `computeRowMap` already threads `sortKey`/`sortDir` straight through to every `sortSiblings` call (lines 80, 88, 105), so passing `sortKey: 'manual'` end-to-end from `AppState` "just works" once this branch exists.

**Test case (Phase 11):** Extend (or create) `src/lib/sort.test.ts`: siblings with distinct `order` values sort ascending by `order` when `sortKey === 'manual'`; ties (equal `order`, e.g. both `0`/un-backfilled) preserve original relative array order (stability); `sortDir: 'desc'` inverts (documented, not a bug); siblings scoped correctly by `parentId` as before (existing filter behavior unchanged, regression check).

---

### Phase 4: Core Move Logic in `state.ts` (T2)
**File:** `src/lib/state.ts`
**Depends on:** Phase 2, Phase 3
**Duration:** 30 min

Add the core reducer-callable functions. These are the shared engine both drag-and-drop (Phase 8) and Alt+Arrow (Phase 7) call into.

```ts
import {
  computeOrderBetween,
  siblingGroupKey,
  getSiblingGroup,
  isGroupBackfilled,
  backfillGroupOrders,
} from './order'

/**
 * Ensure manual sort mode is active and the given task's sibling group has
 * been backfilled with real `order` values. Idempotent: if already in
 * manual mode and the group is already backfilled, returns state unchanged
 * (aside from the sortKey/sortDir fields, which are safe to reassign to
 * their current values).
 */
function ensureManualModeForGroup(state: AppState, taskId: string): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state

  const wasManual = state.sortKey === 'manual'
  const group = getSiblingGroup(state.tasks, state.milestones, task)
  const needsBackfill = !isGroupBackfilled(group)

  const tasks = needsBackfill
    ? backfillGroupOrders(state.tasks, group, state.sortKey, state.sortDir, /* displaySchedules */ {})
    : state.tasks

  return {
    ...state,
    tasks,
    sortKey: 'manual',
    sortDir: 'asc',
  }
}
```

- **Judgment call flagged**: `backfillGroupOrders` needs `displaySchedules` to reproduce the exact pre-switch sort order for the `'end'` column (`sort.ts`'s `case 'end'`, uses `displaySchedules[t.id].end`). `state.ts` doesn't have `displaySchedules` in scope (it's computed in `App.tsx`/passed as a prop to `TasksView`, not stored in `AppState`). Two options considered: (a) thread `displaySchedules` as an extra parameter through every call site down to `ensureManualModeForGroup`, or (b) accept a same-`startDate`-fallback approximation (pass `{}`, which makes `sort.ts`'s `case 'end'` fall back to `t.startDate` per its own `displaySchedules[t.id] ? ... : t.startDate` ternary, line 32). **Chosen: (a)** — thread it through, since a wrong initial backfill order (if the active sort was by `'end'` specifically) would be a visible, confusing first impression the very first time a user drags anything. Revise the signature to accept `displaySchedules` as a parameter on every move/backfill entry point:

```ts
function ensureManualModeForGroup(
  state: AppState,
  taskId: string,
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state

  const group = getSiblingGroup(state.tasks, state.milestones, task)
  const needsBackfill = !isGroupBackfilled(group)

  const tasks = needsBackfill
    ? backfillGroupOrders(state.tasks, group, state.sortKey, state.sortDir, displaySchedules)
    : state.tasks

  return { ...state, tasks, sortKey: 'manual', sortDir: 'asc' }
}
```

This means `MOVE_TASK_ARROW`/`MOVE_TASK_DRAG` actions (Phase 5) must carry `displaySchedules` in their action payload (computed in `TasksView.tsx`, which already receives it as a prop, see Phase 7/8) — an exception to the "actions are plain serializable-ish objects" pattern elsewhere in this codebase, but consistent with how e.g. `SYNC_SUCCESS` already carries a `snapshot: JSON.stringify(...)` blob (`reducer.ts:194`) — passing computed, non-persisted data through an action is precedented.

Now the two public move entry points:

```ts
/**
 * Reassign a task's own order (and, if its group changed, milestoneId/parentId)
 * to sit between `beforeTaskId` and `afterTaskId` (either may be omitted for
 * an end-of-group placement). Moves the task's full subtree along with it:
 * descendants keep parentId === taskId, but inherit the new milestoneId if
 * the moved task's milestoneId changed.
 */
export function moveTaskToPosition(
  state: AppState,
  taskId: string,
  newMilestoneId: string | null,
  newParentId: string | null,
  beforeTaskId: string | undefined,
  afterTaskId: string | undefined,
  displaySchedules: { [taskId: string]: { start: string; end: string } }
): AppState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state

  // 1. Enter manual mode + backfill the task's CURRENT group (pre-move),
  //    so its old siblings retain a coherent order after it leaves.
  let next = ensureManualModeForGroup(state, taskId, displaySchedules)

  // 2. Backfill the TARGET group too (it may be untouched), using the
  //    (possibly already-updated) tasks array.
  const targetGroupMembers = next.tasks.filter((t) => {
    if (t.id === taskId) return false // moving task itself, not part of "before" group membership
    return t.milestoneId === newMilestoneId && t.parentId === newParentId
  })
  if (!isGroupBackfilled(targetGroupMembers)) {
    next = {
      ...next,
      tasks: backfillGroupOrders(next.tasks, targetGroupMembers, next.sortKey, next.sortDir, displaySchedules),
    }
  }

  // 3. Compute the new order value from the (now-backfilled) neighbors.
  const beforeOrder = beforeTaskId ? next.tasks.find((t) => t.id === beforeTaskId)?.order : undefined
  const afterOrder = afterTaskId ? next.tasks.find((t) => t.id === afterTaskId)?.order : undefined
  const newOrder = computeOrderBetween(beforeOrder, afterOrder)

  // 4. Apply: move the task (+ subtree milestoneId inheritance) and assign order.
  const milestoneChanged = task.milestoneId !== newMilestoneId
  const tasks = next.tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, milestoneId: newMilestoneId, parentId: newParentId, order: newOrder }
    }
    if (milestoneChanged && t.parentId === taskId) {
      return { ...t, milestoneId: newMilestoneId } // descendants follow, keep their own order/parentId
    }
    return t
  })

  return { ...next, tasks }
}
```

- Subtree handling only patches **direct** children's `milestoneId` explicitly (`t.parentId === taskId`) — grandchildren aren't touched here because they never reference `milestoneId` through their parent directly; they reference their own `parentId` (the child), and the child's `milestoneId` field is what changed, so a grandchild rendered via `computeRowMap`'s recursive `walk()` naturally follows since `walk()` doesn't re-check `milestoneId` at deeper levels (only the top-level `tasks.filter(t => t.milestoneId === m.id && ...)` check, line 87, cares about `milestoneId`, and only for **top-level** tasks) — deeper descendants are found purely via `parentId` chains (`walk`'s recursive `childrenOfTask` lookup, line 79), so they don't need their own `milestoneId` patched to remain visible/grouped correctly. **However**, for data-model consistency (e.g. a future feature or CSV export that reads `t.milestoneId` directly off a grandchild without walking the tree), it's still worth propagating `milestoneId` to the full subtree, not just direct children. Revise step 4 to walk the whole subtree:

```ts
  // 4. Apply: move the task, propagate milestoneId through the WHOLE subtree, assign order.
  const milestoneChanged = task.milestoneId !== newMilestoneId
  const descendantIds = new Set<string>()
  if (milestoneChanged) {
    const collect = (pid: string) => {
      next.tasks.forEach((t) => {
        if (t.parentId === pid) {
          descendantIds.add(t.id)
          collect(t.id)
        }
      })
    }
    collect(taskId)
  }

  const tasks = next.tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, milestoneId: newMilestoneId, parentId: newParentId, order: newOrder }
    }
    if (descendantIds.has(t.id)) {
      return { ...t, milestoneId: newMilestoneId }
    }
    return t
  })

  return { ...next, tasks }
```

- `moveTaskArrow(state, taskId, direction, visibleRows, displaySchedules)` — the arrow-key entry point, built on top of `moveTaskToPosition`; full flattened-row-walk logic (finding the same-depth neighbor, handling the group-boundary crossing) lives in Phase 7 alongside the keyboard handler, since it needs `computeRowMap`'s `visibleRows` (a derived/computed value, not raw state) to know current on-screen adjacency — kept out of `state.ts` to avoid `state.ts` importing view-layer row-computation concerns beyond what it already imports (`rows.ts` is already a `lib` module, so this is a soft boundary choice, not a hard constraint — flagged as a judgment call: `moveTaskArrow`'s neighbor-finding logic could equally live in `state.ts` taking `visibleRows` as a parameter, mirroring `moveTaskToPosition`'s signature style; either is fine, this plan puts the *thin* wrapper in `state.ts` in Phase 7 for cohesion with the keydown handler that constructs `visibleRows` in the first place).

- **Indent/outdent manual-mode patch** (per the Key Findings note): update `indentTask` (`state.ts:349-379`) and `outdentTask` (`state.ts:384-411`) to append an `order` when `state.sortKey === 'manual'`:

```ts
export function indentTask(state: AppState, taskId: string): AppState {
  const tasks = state.tasks
  const idx = tasks.findIndex((t) => t.id === taskId)
  if (idx < 0) return state

  const t = tasks[idx]
  if (t.parentId) return state

  let prev: Task | null = null
  for (let i = idx - 1; i >= 0; i--) {
    const c = tasks[i]
    if (c.milestoneId !== t.milestoneId) break
    if (!c.parentId) {
      prev = c
      break
    }
  }

  if (!prev) return state

  const manualOrder = state.sortKey === 'manual'
    ? (() => {
        const newSiblings = tasks.filter((x) => x.parentId === prev!.id)
        const maxOrder = newSiblings.reduce((m, s) => Math.max(m, s.order || 0), 0)
        return computeOrderBetween(maxOrder || undefined, undefined)
      })()
    : undefined

  const newTasks = tasks.map((x) =>
    x.id === taskId
      ? { ...x, parentId: prev!.id, milestoneId: prev!.milestoneId, ...(manualOrder !== undefined ? { order: manualOrder } : {}) }
      : x
  )

  return {
    ...state,
    tasks: newTasks,
    expanded: { ...state.expanded, [prev.id]: true },
  }
}
```

  (`outdentTask` gets the analogous patch: when `state.sortKey === 'manual'`, assign `order` = append-to-end of the new top-level group instead of relying on the array-splice position. Same shape, omitted here for brevity — implement identically using `getSiblingGroup`/`computeOrderBetween` against the post-outdent `parentId: null` group.)

**Test case (Phase 11):** covered in Phase 11 (`state.test.ts`, new file).

---

### Phase 5: Reducer Actions (T1)
**File:** `src/lib/reducer.ts`
**Depends on:** Phase 4
**Duration:** 10 min

Add two new action cases, following the existing plain-passthrough style:

```ts
    case 'MOVE_TASK_TO_POSITION':
      return StateActions.moveTaskToPosition(
        state,
        action.taskId,
        action.newMilestoneId,
        action.newParentId,
        action.beforeTaskId,
        action.afterTaskId,
        action.displaySchedules
      )
```

- No separate `MOVE_TASK_ARROW` action type is added at the reducer level — Phase 7's keydown handler resolves the arrow-key move down to a concrete `(newMilestoneId, newParentId, beforeTaskId, afterTaskId)` tuple itself (since it already has `visibleRows` and `state.tasks` in scope in `TasksView.tsx`) and dispatches the same `MOVE_TASK_TO_POSITION` action as drag-and-drop. This keeps the reducer/action surface to one new case instead of two near-duplicates — a deliberate simplification versus having `state.ts` own the "find same-depth neighbor" logic behind a second action type.
- `SELECT_TASK` (reducer.ts:80-81) already exists and dispatches `StateActions.selectTask` — Phase 6 reuses this verbatim, no reducer change needed there.

**Test case (Phase 11):** covered in Phase 11 alongside Phase 4's `state.ts` tests (dispatch through `appReducer` and assert the same resulting state as calling `moveTaskToPosition` directly).

---

### Phase 6: Row Selection Click + Selected-Row Highlight (T1)
**File:** `src/views/TaskRow.tsx`
**Depends on:** None (independent, can land anytime before Phase 7)
**Duration:** 20 min

- Add a `isSelected: boolean` prop (derived by the caller from `state.selectedTaskId === task.id`, following the existing pattern of `isCritical`/`isExpanded` booleans already passed in as props rather than computed inside `TaskRow`).
- Add an `onClick` to the row's root `<div>` (line 379-382) that dispatches `SELECT_TASK`, guarded so clicks that already reached an interactive child (which all call `e.stopPropagation()`, confirmed in Key Findings) never double-fire:

```tsx
  return (
    <div
      className={`flex border-b border-divider transition-colors hover:bg-ink-50 cursor-pointer ${
        isSelected ? 'bg-[color-mix(in_srgb,var(--ns-netskope-blue)_8%,white)]' : ''
      }`}
      style={{ width: `${width}px`, ...boxShadowStyle }}
      onClick={() => dispatch({ type: 'SELECT_TASK', taskId: task.id })}
    >
```

- Selected-row background uses the same `color-mix(in srgb, var(--ns-netskope-blue) N%, white)` pattern already used elsewhere in this file for tinted states (e.g. `detailsBg`, line 67) — `8%` chosen as a subtle tint that doesn't fight the existing `hover:bg-ink-50` hover state (hover still visibly darkens further on top, since Tailwind's `hover:` class and the inline/utility background don't conflict — `hover:bg-ink-50` is a class, the selected tint here is also a class via the ternary, so on hover Tailwind's cascade means whichever is later in the stylesheet wins; since both are essentially "very light background" tints, a minor visual layering ambiguity is accepted here rather than switching to inline `style` with a manual hover listener — flagged as a low-stakes judgment call, revisit if a visual clash is observed).
- Update `TasksView.tsx`'s `<TaskRow ... />` call site (line ~364) to pass `isSelected={state.selectedTaskId === task.id}`.
- `TaskRowProps` interface (`TaskRow.tsx:9-22`) gets `isSelected: boolean` added.

**Test case (Phase 11):** Render `TaskRow` with `isSelected={false}` then re-render with `isSelected={true}` (via `TasksView` with `state.selectedTaskId` set) — assert the selected row's DOM node carries the highlight class the non-selected one doesn't. Click a row's non-interactive area (e.g. the padding around the number column) → assert `SELECT_TASK` dispatched with the right `taskId`. Click the delete button / name textarea / status pill → assert `SELECT_TASK` is NOT also dispatched (propagation correctly stopped by the existing per-cell `stopPropagation` calls).

---

### Phase 7: Alt+Arrow Keyboard Move (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** Phase 4, Phase 5, Phase 6
**Duration:** 30 min

- Add a `useEffect` registering a `document`-level `keydown` listener scoped to when the Tasks view is mounted (component lifetime), ignoring keystrokes while focus is inside a text input/textarea (so it doesn't hijack normal typing, e.g. while editing a task name or a numeric estimate field) and only acting when `state.selectedTaskId` is set and no filter is active (Phase 9 formalizes the filter-disable check; this phase includes the guard inline since they're tightly coupled):

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!e.altKey) return
    if (!state.selectedTaskId) return

    const target = e.target as HTMLElement
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return // don't hijack in-place editing

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()

    const anyFilterActive =
      !!(state.filters.status && state.filters.status !== 'All') ||
      !!(state.filters.category && state.filters.category !== 'All') ||
      !!(state.filters.assignee && state.filters.assignee !== 'All') ||
      !!(state.filters.milestone && state.filters.milestone !== 'All') ||
      !!(state.filters.search && state.filters.search.trim())

    if (e.key === 'ArrowLeft') {
      dispatch({ type: 'OUTDENT_TASK', taskId: state.selectedTaskId })
      return
    }
    if (e.key === 'ArrowRight') {
      dispatch({ type: 'INDENT_TASK', taskId: state.selectedTaskId })
      return
    }

    // Up/Down: reorder within/across same-depth sibling groups. Disabled under filters.
    if (anyFilterActive) return

    const taskRows = rowMap.visibleRows.filter((r) => r.type === 'task')
    const selectedTask = getTaskById(state.selectedTaskId)
    if (!selectedTask) return
    const currentRowIdx = taskRows.findIndex((r) => r.id === state.selectedTaskId)
    if (currentRowIdx < 0) return
    const currentLevel = taskRows[currentRowIdx].level

    // Same-depth rows only, preserving flattened top-to-bottom order.
    const sameDepthRows = taskRows.filter((r) => r.level === currentLevel)
    const sameDepthIdx = sameDepthRows.findIndex((r) => r.id === state.selectedTaskId)
    const targetIdx = e.key === 'ArrowUp' ? sameDepthIdx - 1 : sameDepthIdx + 1
    if (targetIdx < 0 || targetIdx >= sameDepthRows.length) return // already at an edge, no-op

    const targetTask = getTaskById(sameDepthRows[targetIdx].id)
    if (!targetTask) return

    // Determine before/after neighbors at the target position, and the
    // resulting group (may be the same group or a different one).
    const beforeTaskId = e.key === 'ArrowUp'
      ? (sameDepthRows[targetIdx - 1] ? sameDepthRows[targetIdx - 1].id : undefined)
      : targetTask.id
    const afterTaskId = e.key === 'ArrowUp'
      ? targetTask.id
      : (sameDepthRows[targetIdx + 1] ? sameDepthRows[targetIdx + 1].id : undefined)

    dispatch({
      type: 'MOVE_TASK_TO_POSITION',
      taskId: state.selectedTaskId,
      newMilestoneId: targetTask.milestoneId,
      newParentId: targetTask.parentId,
      beforeTaskId,
      afterTaskId,
      displaySchedules,
    })
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [state.selectedTaskId, state.filters, rowMap, displaySchedules])
```

- **Edge case**: moving "up" when `beforeTaskId`/`afterTaskId` straddle the boundary between two different sibling groups (i.e. `targetTask` belongs to a different group than the selected task) is exactly the "flow into the adjacent group" behavior from requirement 3 — `newMilestoneId`/`newParentId` are taken from `targetTask` (the row now adjacent), which naturally reassigns the moving task into that group. No special-case branch needed: the same `beforeTaskId`/`afterTaskId` computation works whether the move stays within a group or crosses into a new one, since it's purely position-based off `sameDepthRows`, not group-based.
- **Note on `beforeTaskId`/`afterTaskId` when moving up **into** a new group from its bottom edge**: if `ArrowUp` moves the selected task to sit exactly at position `targetIdx` (displacing `targetTask` downward by one), the intended neighbors are `sameDepthRows[targetIdx - 1]` (new "before") and `targetTask` itself (new "after") — this is what the snippet computes. Symmetric logic applies for `ArrowDown`. Verified against a walked-through example in the Phase 11 test plan (3 groups of 2 rows each, walking a task from the bottom of group A to the top of group B).
- `useEffect`'s dependency array intentionally includes `rowMp`/`displaySchedules` (recreated each render, per existing `useMemo`s already in this file) — acceptable since `document.addEventListener`/`removeEventListener` churn on every render is cheap and this file already re-renders reactively on any state change; no debounce/memoization added, consistent with this file's existing style (no other `useEffect` beyond this one exists in `TasksView.tsx` today, confirmed via read — first one added).

**Test case (Phase 11):** covered in Phase 11.

---

### Phase 8a: Add `@dnd-kit/core` Dependency + Drag Handle (T1)
**Files:** `package.json`, `src/views/TaskRow.tsx`
**Depends on:** None (can land in parallel with Phases 6/7)
**Duration:** 20 min

- Add to `package.json` `dependencies`: `"@dnd-kit/core": "^6.3.1"` (latest stable major at time of writing — confirm exact version via `npm view @dnd-kit/core version` before installing, since this repo pins fairly current majors elsewhere, e.g. React 19). `@dnd-kit/sortable` is **not** added — per the Key Findings judgment call in Phase 8b, a flat single `DndContext` with group-aware `onDragEnd` logic is simpler than wiring multiple `SortableContext`s given `computeRowMap`'s existing flat `visibleRows` structure, so `@dnd-kit/core` alone (which provides `DndContext`, `useDraggable`, `useDroppable`) is sufficient.
- Add a grip/drag-handle affordance to `TaskRow.tsx`, visible on row hover, as a new small fixed-width element **before** the `number` column (the interview flags this as the cleanest insertion point since `number` is already a narrow, purely-display column with no interactivity — inserting the handle just before it keeps the existing `columns` array/width-tracking machinery in `TasksView.tsx` untouched; the handle is rendered directly by `TaskRow`, not registered as a virtual `columns` entry, so `getColumnWidth`/`totalWidth` math in `TasksView.tsx` needs no change):

```tsx
import { GripVertical } from 'lucide-react'
// ...
  const dragDisabled = anyFilterActive // threaded in as a new prop, see Phase 9

  return (
    <div className={...} style={...} onClick={...}>
      <div
        className={`flex flex-shrink-0 items-center justify-center w-4 text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity ${
          dragDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
        }`}
        title={dragDisabled ? 'Clear filters to reorder' : 'Drag to reorder'}
        {...(dragDisabled ? {} : dragHandleListeners)}
        {...(dragDisabled ? {} : dragHandleAttributes)}
      >
        <GripVertical size={13} />
      </div>
      {columns.map((col) => ( ... ))}
    </div>
  )
```

- The row's root `className` needs a `group` class added (Tailwind's `group-hover:` requires an ancestor with `group`) — combine with Phase 6's className changes (both touch the same root `<div>`, land together in the same review unit as noted in Phase 6, or merge here to avoid a two-step edit to the same line).
- `dragHandleListeners`/`dragHandleAttributes` are placeholders wired up fully in Phase 8b (`useDraggable`'s returned `listeners`/`attributes`, passed down from `TasksView.tsx` since the `DndContext` lives there) — `TaskRowProps` gains `dragHandleListeners`, `dragHandleAttributes`, and `dragDisabled` (or `anyFilterActive`) props.

**Test case (Phase 11):** covered in Phase 11 (paired with 8b, since the handle is inert until wired to an actual `DndContext`).

---

### Phase 8b: `DndContext` Wiring + Cross-Group `onDragEnd` (T3)
**File:** `src/views/TasksView.tsx`, `src/views/TaskRow.tsx`
**Depends on:** Phase 8a, Phase 4, Phase 5
**Duration:** 30 min

- Wrap the task grid body (the `rowMap.visibleRows.map(...)` block, `TasksView.tsx:348-381`) in a single `DndContext`, using one `useDraggable` per task row (via the grip handle from Phase 8a) and one `useDroppable` per row position — a **flat single context**, not per-group `SortableContext`s, since:
  - `visibleRows` is already a flat, ordered list mixing milestone headers and task rows at various depths — reconstructing per-group `SortableContext`s would require slicing `visibleRows` into contiguous task-only runs per group, adding real complexity for a feature that already has a working position-based algorithm (Phase 4's `moveTaskToPosition`, driven by `beforeTaskId`/`afterTaskId`, exactly mirrors what `@dnd-kit/sortable`'s `arrayMove` + multi-container patterns solve, but at strictly more complexity for cross-container support than this codebase's `computeRowMap` needs).
  - Each row becomes a drop target keyed by its own `task.id`; dropping task A's handle onto task B's row computes A's new neighbors as "whatever is immediately above/below B in `visibleRows` at B's own depth" — reusing the exact same same-depth-neighbor logic Phase 7 already implements for arrow keys. Extract that logic into a small shared helper (in `TasksView.tsx`, not `state.ts`, consistent with Phase 4's cohesion judgment call) so `onDragEnd` and the keydown handler both call it:

```tsx
function computeMoveTarget(
  taskId: string,
  targetTaskId: string,
  dropBefore: boolean, // true if dropped on the upper half of the target row
  taskRows: Array<{ id: string; type: 'milestone' | 'task'; level: number }>,
  tasks: Task[]
): { newMilestoneId: string | null; newParentId: string | null; beforeTaskId?: string; afterTaskId?: string } | null {
  const targetTask = tasks.find((t) => t.id === targetTaskId)
  if (!targetTask) return null
  const level = taskRows.find((r) => r.id === targetTaskId)?.level
  const sameDepthRows = taskRows.filter((r) => r.level === level)
  const idx = sameDepthRows.findIndex((r) => r.id === targetTaskId)

  const beforeTaskId = dropBefore
    ? (sameDepthRows[idx - 1] ? sameDepthRows[idx - 1].id : undefined)
    : targetTaskId
  const afterTaskId = dropBefore
    ? targetTaskId
    : (sameDepthRows[idx + 1] ? sameDepthRows[idx + 1].id : undefined)

  return {
    newMilestoneId: targetTask.milestoneId,
    newParentId: targetTask.parentId,
    beforeTaskId,
    afterTaskId,
  }
}
```

  - `dropBefore` is derived from the drag event's collision geometry (`@dnd-kit/core`'s `onDragEnd` gives `event.over` with `rect`; compare the dragged pointer's final Y against the target row's vertical midpoint — `@dnd-kit/core` doesn't compute this for you the way `@dnd-kit/sortable` does, so this plan's `onDragEnd` handler does the midpoint math directly against `event.over.rect` and `event.active.rect.current.translated`).
  - Dropping a task onto **itself** or onto one of its own descendants is a no-op / rejected (guard: walk up from `targetTaskId`'s `parentId` chain checking for `taskId`; if found, ignore the drop — prevents an invalid parent-cycle).
  - `onDragEnd` dispatches the same `MOVE_TASK_TO_POSITION` action as Phase 7, via `computeMoveTarget`'s result.
- Milestone header rows (`row.type === 'milestone'`) get no `useDraggable`/drop target — only `task`-type rows participate, per requirement 5.
- Disabled state (Phase 9): when any filter is active, the grip handle renders with `dragDisabled` and doesn't get draggable listeners attached (Phase 8a already handles this via the conditional spread) — `DndContext` itself stays mounted regardless (cheap, no rows are actually draggable when disabled).

**Test case (Phase 11):** covered in Phase 11. Simulating full pointer-drag gestures in jsdom via `@testing-library/react` is limited (no real layout/geometry) — tests instead call `onDragEnd`-equivalent logic directly (i.e. unit-test `computeMoveTarget` in isolation with a fixture `visibleRows`/`tasks`, and a lighter integration test asserting the grip handle exists/is absent/disabled based on `dragDisabled`) rather than attempting full simulated pointer-drag sequences, consistent with how this kind of interaction is typically tested (drag geometry itself is `@dnd-kit`'s tested surface, not this app's).

---

### Phase 9: Disable Reordering When Filters Active (T1)
**Files:** `src/views/TasksView.tsx`, `src/views/TaskRow.tsx`
**Depends on:** Phase 7, Phase 8b
**Duration:** 15 min

- Compute `anyFilterActive` once in `TasksView.tsx` (reusing the same boolean expression already inlined in Phase 7's keydown handler — hoist it to a `useMemo` derived from `state.filters`, and have Phase 7's handler read that memoized value instead of recomputing inline, tightening the Phase 7 snippet):

```tsx
const anyFilterActive = useMemo(
  () =>
    !!(state.filters.status && state.filters.status !== 'All') ||
    !!(state.filters.category && state.filters.category !== 'All') ||
    !!(state.filters.assignee && state.filters.assignee !== 'All') ||
    !!(state.filters.milestone && state.filters.milestone !== 'All') ||
    !!(state.filters.search && state.filters.search.trim()),
  [state.filters]
)
```

- Pass `dragDisabled={anyFilterActive}` down to every `<TaskRow />` (Phase 8a's prop).
- Phase 7's keydown handler already checks `anyFilterActive` inline before handling Up/Down — replace that inline computation with a reference to this hoisted memo (revise the `useEffect`'s closure to read `anyFilterActive` from the outer scope, and add it to the dependency array in place of re-deriving from `state.filters` directly — behaviorally identical, just deduplicated).
- Left/Right (indent/outdent) are **not** disabled under filters — only Up/Down (order-changing moves) and drag are disabled, per requirement 10's specific scope ("disable both the drag handle and the Alt+Arrow shortcut" — read in context of requirement 3's Up/Down-vs-Left/Right split, indent/outdent don't touch `order`/backfill and so aren't ambiguous under a filter the way position-in-group is).
- Tooltip: Phase 8a's `title={dragDisabled ? 'Clear filters to reorder' : 'Drag to reorder'}` on the grip handle already covers the "show a disabled-state hint" requirement — no additional UI needed.

**Test case (Phase 11):** With `state.filters.status = 'Done'` set, render `TasksView` → assert the grip handle for a visible row has the disabled tooltip text and `cursor-not-allowed` styling (or absence of drag listeners — check via a data attribute or the tooltip text, whichever is more robust to query in a test). Dispatch an Alt+ArrowUp keydown event with a filter active and a task selected → assert no `MOVE_TASK_TO_POSITION` action reaches the reducer (state unchanged). Clear the filter → assert the same keydown now does dispatch the move.

---

### Phase 10: `addTask` Order Assignment (T1)
**File:** `src/lib/state.ts`
**Depends on:** Phase 2
**Duration:** 15 min

- Update `addTask` (lines 751-789) to assign a real `order` when the anchor's sibling group is already backfilled, otherwise leave the `0` sentinel (the group gets backfilled whenever it's first touched by a move, per the lazy-backfill design — creating a task doesn't force a backfill, avoiding a surprise reorder-mode switch just from typing "new task"):

```ts
export function addTask(state: AppState, name: string): AppState {
  const taskId = uid('t')
  const anchor = state.selectedTaskId ? state.tasks.find((t) => t.id === state.selectedTaskId) : null

  const milestoneId = anchor ? anchor.milestoneId : state.milestones[0]?.id || null
  const parentId = anchor ? anchor.parentId : null
  const category = anchor ? anchor.category : ''
  const assignee = anchor ? anchor.assignee : 'Unassigned'
  const startDate = anchor ? anchor.startDate : TODAY

  // If the anchor's sibling group already has real order values, insert the
  // new task right after the anchor in that ordering (matching where it's
  // spliced into the flat `tasks` array below). Otherwise leave order: 0 —
  // the group hasn't entered manual mode yet, so array position (not
  // `order`) still drives its on-screen position.
  let order = 0
  if (anchor) {
    const group = getSiblingGroup(state.tasks, state.milestones, anchor)
    if (isGroupBackfilled(group)) {
      const groupSortedByOrder = [...group].sort((a, b) => a.order - b.order)
      const anchorIdx = groupSortedByOrder.findIndex((t) => t.id === anchor.id)
      const nextSibling = groupSortedByOrder[anchorIdx + 1]
      order = computeOrderBetween(anchor.order, nextSibling?.order)
    }
  }

  const task: Task = {
    id: taskId,
    name,
    milestoneId,
    parentId,
    category,
    assignee,
    status: 'Not Started',
    estimate: 3,
    startDate,
    progress: 0,
    order,
    dependencies: [],
    comments: [],
  }

  let newTasks: Task[]
  if (anchor) {
    const idx = state.tasks.findIndex((t) => t.id === anchor.id)
    newTasks = [...state.tasks.slice(0, idx + 1), task, ...state.tasks.slice(0, idx + 1).length === idx + 1 ? state.tasks.slice(idx + 1) : []]
  } else {
    newTasks = [...state.tasks, task]
  }

  return {
    ...state,
    tasks: newTasks,
  }
}
```

  (The `newTasks` splice line above has a stray no-op ternary introduced by a copy-paste slip while drafting — the actual diff should leave the original two-line splice (`state.tasks.slice(0, idx + 1)`, `task`, `state.tasks.slice(idx + 1)`) completely unchanged; only the `order` computation and the `order` field in the `task` literal are new. Called out explicitly so the implementer doesn't carry over the malformed line.)
- No-anchor case (append to global end, `state.milestones[0]?.id` as milestoneId): also worth assigning a real `order` if that top-level milestone group happens to already be backfilled, using the same `getSiblingGroup`/`isGroupBackfilled`/`computeOrderBetween(maxOrder, undefined)` pattern (append-past-the-end). Left as `order: 0` in the snippet above for the no-anchor branch for brevity, but the implementer should mirror the anchor branch's logic for the no-anchor case too — same helper functions, just "append past the last member" (`computeOrderBetween(lastMember.order, undefined)`) instead of "insert between anchor and next".
- `addSubtask` (lines 814-840): new subtasks are appended to `state.tasks` (not spliced near siblings) and given `parentId: parentTaskId` — since a freshly-created subtask is very likely the **first** child of its parent (or one of few), leave its `order: 0` unconditionally (no backfill-aware insert logic) — simpler, and the first real reorder of that parent's children will backfill it like any other untouched group. Flagged as a deliberate scope-reduction versus `addTask`'s more careful handling, since `addTask`'s insert-after-anchor behavior is the more visible/common path.

**Test case (Phase 11):** covered in Phase 11 (`state.test.ts`): creating a task with a selected anchor whose group is already backfilled inserts the new task's `order` strictly between the anchor and its next sibling; creating a task with an anchor whose group is NOT backfilled leaves `order: 0`; creating a task with no anchor appends (existing behavior, regression check for the splice/append logic itself, unrelated to `order`).

---

### Phase 11: Test Coverage (T3)
**Files:** `src/lib/order.test.ts` (new), `src/lib/sort.test.ts` (new — none exists today, confirmed via `find`), `src/lib/rows.test.ts` (extend), `src/lib/state.test.ts` (new — none exists today), `src/__tests__/TasksView.test.tsx` (extend), `src/views/TaskRow.test.tsx` (new — check first if one exists; none found via the earlier `find`)
**Depends on:** All of Phases 1-10
**Duration:** 30 min (split further per file if any single file's assertions grow past ~30 min — recommend splitting into 11a `order.ts`/`sort.ts` unit tests, 11b `state.ts`/reducer integration tests, 11c `TasksView.tsx`/`TaskRow.tsx` component tests, each independently ~20-30 min)

Grep `src/lib` and `src/views` once more for any test file this plan might have missed before creating new ones (`find src -iname "*order*" -o -iname "*sort*"` — confirmed empty for both at planning time).

**`src/lib/order.test.ts`:** as described in Phase 2's test case.

**`src/lib/sort.test.ts`:** as described in Phase 3's test case (new file, since `sort.ts` has no existing test file — first coverage for this module).

**`src/lib/rows.test.ts` (extend):** Add a `describe('computeRowMap with manual sort')` block: build a small tree (2 milestones, each with 2 top-level tasks and one nested child) with distinct `order` values, call `computeRowMap(..., 'manual', 'asc', ...)`, assert `visibleRows` reflects `order`-based sequencing within each group rather than any column value. Also update the file's `makeTask()` helper (Phase 1) to include `order: 0`.

**`src/lib/state.test.ts` (new):**
- `moveTaskToPosition`: moving within the same group (both before/after taken from existing siblings) only changes the moved task's `order`, leaves every other task's `order`/`milestoneId`/`parentId` untouched. Moving across groups (different `newMilestoneId`/`newParentId`) reassigns the moved task's `milestoneId`/`parentId` and moves its full subtree's `milestoneId` along with it (build a parent + 2 children + 1 grandchild fixture, move the parent to a new milestone, assert all 3 descendants' `milestoneId` updated, their own `parentId`/`order` untouched). First move on a never-touched group backfills every sibling's `order` (assert all group members end up with non-zero, strictly-ordered `order` matching their pre-move display order under the previous `sortKey`), and sets `state.sortKey = 'manual'`, `sortDir = 'asc'`. A second move afterward does NOT re-backfill (assert previously-set `order` values on untouched siblings are preserved exactly, only the newly-moved task's `order` changes).
- `indentTask`/`outdentTask` manual-mode patch: when `state.sortKey === 'manual'`, indenting/outdenting assigns a fresh appended `order` in the new group; when `sortKey` is a column (not `'manual'`), behavior is byte-for-byte identical to before this plan (regression check against the existing splice-based behavior).
- `addTask`: as described in Phase 10's test case.
- Dispatch `MOVE_TASK_TO_POSITION` through `appReducer` directly (not just calling `moveTaskToPosition`) to confirm the reducer wiring (Phase 5) is correct end-to-end.

**`src/__tests__/TasksView.test.tsx` (extend):**
- Update `makeMockState`/inline task literals for the new `order` field (Phase 1).
- "clicking a task row selects it": render with a filter-free state, click a row's non-interactive area, assert `SELECT_TASK` dispatched and (on re-render with `selectedTaskId` set) the row shows the highlight class.
- "Alt+ArrowUp/Down moves the selected task within its group": build 3 sibling tasks, select the middle one, fire a `keydown` with `altKey: true, key: 'ArrowDown'` on `document`, assert `MOVE_TASK_TO_POSITION` dispatched with the expected `beforeTaskId`/`afterTaskId` (the third task becomes "before" after the move... concretely: assert the dispatched action's fields match hand-computed expected neighbors for this fixture).
- "Alt+ArrowUp crosses from the top of one group into the tail of the previous group": build 2 milestones with 1 task each, select the second milestone's only task, fire Alt+ArrowUp, assert the dispatched action's `newMilestoneId` equals the first milestone's id (cross-group reassignment via keyboard, requirement 3's core scenario).
- "Alt+ArrowLeft/Right dispatch OUTDENT_TASK/INDENT_TASK unchanged": regression check that Phase 7 didn't disturb the existing Tab/Shift+Tab-driven indent/outdent dispatches (still reachable via keyboard now through Alt+Left/Right too).
- "reordering disabled under an active filter": as described in Phase 9's test case.
- "typing in the name textarea with Alt held does not trigger a move": focus the name `<textarea>` (`data-task-id` attribute already present, `TaskRow.tsx:127`), fire an Alt+ArrowDown keydown targeting that element, assert no `MOVE_TASK_TO_POSITION` dispatched (validates the `tag === 'INPUT' || tag === 'TEXTAREA'` guard in Phase 7).

**`src/views/TaskRow.test.tsx` (new):**
- Grip handle renders and is visually hidden until hover (assert the `opacity-0 group-hover:opacity-100` classes are present — jsdom doesn't simulate `:hover`, so this is a class-presence assertion, not a visual one).
- `dragDisabled` prop renders the disabled tooltip/style and omits drag listeners.
- `computeMoveTarget` (Phase 8b, if extracted to a standalone exported helper rather than an inline closure — recommend exporting it specifically so it's unit-testable without simulating real `@dnd-kit` pointer events): same-group midpoint drop, cross-group drop, self-drop rejection, drop-onto-own-descendant rejection.

**Test case (overall):** `npm run typecheck` and `npm test` (`vitest run`) pass with zero regressions across all touched/new files; manual smoke check (or `run`/verify skill) confirms in the actual app: selecting a row highlights it, Alt+Up/Down reorders within a milestone and flows into the next milestone at a group edge, Alt+Left/Right still indent/outdent, dragging a row by its grip handle to a new position persists after a page reload (confirms the `order` field round-trips through `localStorage` via `PERSIST_STATE_KEYS`, which already includes `'tasks'` — no change needed there since `order` rides along as part of each `Task` object), and reordering affordances visibly disable with a tooltip the moment any filter is applied.

---

## File Changes Summary

1. **src/lib/types.ts** — add required `order: number` to `Task`.
2. **src/lib/order.ts** (new) — `computeOrderBetween`, `siblingGroupKey`, `getSiblingGroup`, `isGroupBackfilled`, `backfillGroupOrders`.
3. **src/lib/sort.ts** — add `'manual'` case to `sortSiblings`'s `val()` switch.
4. **src/lib/rows.ts** — no code change needed (already threads `sortKey`/`sortDir` end-to-end); covered by extended tests only.
5. **src/lib/state.ts** — `ensureManualModeForGroup` (internal), `moveTaskToPosition` (exported), manual-mode patches to `indentTask`/`outdentTask`, `order`-aware `addTask` insert logic.
6. **src/lib/reducer.ts** — new `MOVE_TASK_TO_POSITION` case.
7. **src/lib/csv.ts** — `parseTasksCsvString`'s task literal gets `order: 0`.
8. **src/views/TaskRow.tsx** — `isSelected` prop + row click → `SELECT_TASK` + highlight style; grip drag handle (visible on hover, disabled under filters); draggable wiring (Phase 8b).
9. **src/views/TasksView.tsx** — `anyFilterActive` memo; Alt+Arrow keydown handler (`useEffect`); `DndContext`/`onDragEnd`/`computeMoveTarget`; pass new props down to `TaskRow`.
10. **package.json** — add `@dnd-kit/core` dependency.
11. **Test files** — `src/lib/order.test.ts` (new), `src/lib/sort.test.ts` (new), `src/lib/rows.test.ts` (extend), `src/lib/state.test.ts` (new), `src/__tests__/TasksView.test.tsx` (extend), `src/views/TaskRow.test.tsx` (new).

---

## Judgment Calls Made (flag for review)

- **No dedicated "Custom order" pseudo-column-header** is added to explicitly re-enter manual mode — the only way back into manual mode after clicking a column header is triggering a new move (drag or Alt+Arrow), per requirement 8's explicitly-allowed default.
- **`displaySchedules` threaded through action payloads** (`MOVE_TASK_TO_POSITION` carries it) rather than storing it in `AppState`, to keep backfill's `'end'`-column ordering accurate on the very first move — precedented by `SYNC_SUCCESS` already carrying non-persisted computed data (`snapshot`) through an action.
- **`ORDER_GAP = 1000`**, `1000`-multiple backfill spacing — arbitrary but generous constants, not derived from any existing convention in the codebase (there isn't one).
- **`addSubtask` does not get the same order-aware insert logic as `addTask`** — left at the `order: 0` sentinel unconditionally, since new subtasks are far less likely to need precise mid-group placement than top-level inserts anchored on `selectedTaskId`.
- **Selected-row highlight color/opacity (`8%` blue tint)** and the exact grip-handle icon size/spacing are visual judgment calls, not specified in the interview — easy to adjust in review.
- **`state.ts` owns `moveTaskToPosition` (position-based, given explicit before/after ids) while the same-depth-neighbor-finding logic (`visibleRows` walk) lives in `TasksView.tsx`**, shared between the keydown handler and `onDragEnd` — a boundary choice between "view layer resolves intent to a position, lib layer applies it," flagged as reasonable but not the only valid split.
- **Cross-group drag drop position (before/after target) is derived from pointer-vs-row-midpoint geometry**, computed directly against `@dnd-kit/core`'s raw `event.over`/`event.active` rects rather than using `@dnd-kit/sortable`'s built-in helpers (deliberately not added as a dependency) — this is more manual math than `@dnd-kit/sortable` would require, traded for avoiding per-group `SortableContext` complexity given the flat `visibleRows` structure.
- **Exact `@dnd-kit/core` version** (`^6.3.1` mentioned) should be confirmed against the actual latest stable release at implementation time.
