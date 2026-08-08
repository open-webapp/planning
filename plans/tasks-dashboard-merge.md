# Dashboard Removal + Merge Into Tasks — Implementation Plan

## Overview

Delete the Dashboard page entirely and fold its useful parts into the Tasks page:

1. Remove the Dashboard route/nav entry/component. Tasks becomes the default landing view.
2. Move the 5 stat cards (Total Items, Total Estimate, Completed, In Progress, Overdue) to the top of `TasksView`, now computed over the **filtered** task set (respecting `state.filters`), not all tasks.
3. Add a collapsed-by-default "Breakdown" section below the stat cards containing two hand-rolled charts, side by side: Assignee breakdown (new) and Upcoming milestones (moved from Dashboard, reused as-is). Both respect active filters.

Dropped entirely (not moved anywhere): the Dashboard's "Status breakdown" bar chart and "Recent activity" feed. Neither is referenced in the resolved requirements, and grep confirms no other view consumes them — see Phase 3.

No new dependencies. No new charting library — all charts are div/CSS, matching existing Dashboard visual style (`ink-100`, `rounded-pill`, etc).

### Key existing-code findings that shape this plan

- `AppState.activeView` is a plain string union (`'dashboard' | 'tasks' | 'milestones' | 'timeline'`), not router-driven — no `react-router` in the codebase. Switching views is 100% `SET_ACTIVE_VIEW` + a `switch` in `App.tsx`'s `renderView()`.
- `src/lib/rows.ts`'s `computeRowMap` has an inline `matches(t: Task): boolean` closure that implements the AND-combined status/category/assignee/milestone/search filter check. This is the *only* place filter-matching logic exists today — it is not exported. Phase 1 extracts and exports it so the new stat cards / breakdown charts can reuse the exact same matching semantics as the Tasks grid.
- `computeDerivedData` in `src/lib/selectors.ts` computes `statCards`, `statusBreakdown`, `upcomingMilestones`, `recentActivity` all from the **full unfiltered** `state.tasks` — called once in `App.tsx` before the view switch. `upcomingMilestones` is also consumed by `MilestonesView.tsx` (to render its milestone cards) — that consumer must keep seeing the **unfiltered** global milestone data. This means the Tasks-page Breakdown's "Upcoming milestones" chart cannot just reuse `derivedData.upcomingMilestones` — it needs its own filtered call to `computeUpcomingMilestones`, computed locally inside `TasksView`, leaving the shared `DerivedData.upcomingMilestones` untouched for `MilestonesView`.
- `statCards`, `statusBreakdown` (`StatusBreakdown` type, `computeStatusBreakdown`), and `recentActivity` (`ActivityFeedItem` type, `computeRecentActivity`) are consumed **only** by `DashboardView.tsx` today (confirmed via grep across `src`). Once Dashboard is deleted: `statusBreakdown`/`recentActivity` become fully dead and should be deleted from `selectors.ts`/`DerivedData`. `computeStatCards`/`StatCards` stays (needed for the new Tasks-page cards) but is removed from the shared `DerivedData` object (nothing else needs an unfiltered copy) and instead called directly, with filtered tasks, from `TasksView`.
- `TasksView` already receives `state`, `displaySchedules`, and `progressMap` as props — everything needed to compute the filtered stat cards / assignee breakdown / filtered milestones locally via `useMemo`, with no prop-drilling changes needed in `App.tsx`.
- Filters (`state.filters`) are global app state, not scoped per-view — the `Toolbar` (which edits filters) is rendered unconditionally in `AppShell`'s `toolbar` slot regardless of `activeView`. This is pre-existing behavior, out of scope to change.

---

## Phases

### Phase 1: Extract & Export Shared Filter-Matching Logic (T0)
**File:** `src/lib/rows.ts`
**Depends on:** None
**Duration:** 20 min

- Extract the inline `matches` closure (lines 34–51) into a standalone exported function:

```ts
export interface TaskFilters {
  status?: string
  category?: string
  assignee?: string
  milestone?: string
  search?: string
}

export function taskMatchesFilters(t: Task, filters: TaskFilters): boolean {
  if (filters.status && filters.status !== 'All' && t.status !== filters.status) return false
  if (filters.category && filters.category !== 'All' && t.category !== filters.category) return false
  if (filters.assignee && filters.assignee !== 'All' && t.assignee !== filters.assignee) return false
  if (filters.milestone && filters.milestone !== 'All' && t.milestoneId !== filters.milestone) return false
  if (filters.search && filters.search.trim() && !t.name.toLowerCase().includes(filters.search.trim().toLowerCase())) {
    return false
  }
  return true
}

export function filterTasksByFilters(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((t) => taskMatchesFilters(t, filters))
}
```

- Update `computeRowMap`'s internal `matches` usages (inside `walk`, line ~66) to call `taskMatchesFilters(t, filters)` instead of the local closure. Delete the old inline closure.
- `computeRowMap`'s existing `filters` parameter type (inline object type, lines 17–23) can now reference `TaskFilters` instead of repeating the shape — update the signature to `filters: TaskFilters`.
- `filterTasksByFilters` gives a **flat** filtered list (no hierarchy/expansion awareness) — this is intentionally different from `computeRowMap`'s tree-walk visibility (which still shows expanded children of a non-matching parent). The stat cards / breakdown charts want the flat semantics: "which tasks currently match the filters," not "which rows are visible in the grid."

**Test case (Phase 7):** Unit test `taskMatchesFilters` and `filterTasksByFilters` directly — empty filters match everything; each individual filter key (status/category/assignee/milestone/search, including case-insensitive substring search) narrows correctly; `'All'` value is treated as no-op like undefined; combined filters AND together. Also re-run existing `computeRowMap` tests (if any) to confirm no behavior regression from the refactor.

---

### Phase 2: Add Assignee Breakdown Selector (T0)
**File:** `src/lib/selectors.ts`
**Depends on:** None (independent of Phase 1 — takes an already-filtered `Task[]`, doesn't call filter logic itself)
**Duration:** 20 min

Add a new type and function, exported alongside the existing aggregates:

```ts
export interface AssigneeBreakdown {
  assignee: string // 'Unassigned' for empty/falsy task.assignee
  totalEstimate: number
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
```

- This function takes tasks directly (no filtering inside it) — the caller (`TasksView`, Phase 6) is responsible for passing an already-filtered task list via `filterTasksByFilters` from Phase 1.
- Do not add this to `computeDerivedData` / `DerivedData` — it's called ad hoc from `TasksView` with the filtered set, same reasoning as `computeStatCards` (see Phase 3).

**Test case (Phase 7):** Unit test `computeAssigneeBreakdown`: multiple tasks per assignee sum correctly; empty-string and undefined `assignee` both bucket into `'Unassigned'` (not two separate buckets, not dropped); result sorted descending by `totalEstimate`; empty input returns `[]`; a single task with `estimate: 0` still produces a zero-value entry (not filtered out).

---

### Phase 3: Remove Orphaned Dashboard-Only Selectors (T1)
**File:** `src/lib/selectors.ts`
**Depends on:** Phase 4 (Dashboard component deletion) must land in the same change set — do this phase together with Phase 4 so the app never sits in a broken intermediate state where `DashboardView` references deleted exports. Order within the batch doesn't matter since it's one commit-worthy unit; listed separately here only for reviewability.
**Duration:** 20 min

Confirmed via grep: `statusBreakdown`, `recentActivity`, `ActivityFeedItem`, `computeStatusBreakdown`, `computeRecentActivity` are referenced **only** in `DashboardView.tsx` and inside `selectors.ts`/`DerivedData` itself — no other file touches them.

- Delete `computeStatusBreakdown` (lines ~231–244), `computeRecentActivity` (lines ~311–338), the `StatusBreakdown` interface (lines 21–24), and the `ActivityFeedItem` interface (lines 36–43).
- Remove `statusBreakdown` and `recentActivity` fields from the `DerivedData` interface (lines 45–63) and from the object returned by `computeDerivedData` (lines 109–116), and remove the corresponding computation calls (lines 96, 107).
- `statCards` / `StatCards` / `computeStatCards`: **keep the function and type**, but remove `statCards` from `DerivedData` and from `computeDerivedData`'s return object / call (lines 92–93, 112). Nothing needs an unfiltered, app-wide copy of stat cards anymore — `TasksView` will call `computeStatCards` directly with its filtered task list (Phase 6).
- `upcomingMilestones` / `UpcomingMilestone` / `computeUpcomingMilestones`: **no change** — stays in `DerivedData`, still computed unfiltered in `computeDerivedData`, still consumed by `MilestonesView`. `TasksView`'s filtered milestone chart will call `computeUpcomingMilestones` a second time, separately, with filtered tasks (Phase 6) — do not touch this shared code path.
- Double-check `computeDerivedData`'s function signature doesn't need to shrink — it still needs `displaySchedules`/`progressMap` params for `computeUpcomingMilestones` and `computeGanttMetadata`/`computeRowMap`, so no signature change here.

**Test case (Phase 7):** `npm run typecheck` passes with no references to the deleted `StatusBreakdown`/`ActivityFeedItem` types or `computeStatusBreakdown`/`computeRecentActivity` functions anywhere in `src`. Existing/updated tests that construct a `DerivedData` mock (see Phase 5) compile against the trimmed interface.

---

### Phase 4: Delete Dashboard Route, Nav Entry, and Component (T1)
**Files:** `src/App.tsx`, `src/components/AppShell.tsx`, `src/views/DashboardView.tsx` (delete), `src/lib/state.ts`, `src/lib/reducer.ts`
**Depends on:** None directly, but ships together with Phase 3 (see above)
**Duration:** 30 min

**`src/lib/state.ts`:**
- Change `AppState.activeView` type (line 8) from `'dashboard' | 'tasks' | 'milestones' | 'timeline'` to `'tasks' | 'milestones' | 'timeline'`.
- Update every hardcoded `activeView: 'dashboard'` default to `'tasks'`: `switchProject` (line 189), `createProject` (line 249), `deleteProject`'s active-project-deleted branch (line 317). Update the doc comment on `switchProject` (line 182, "resets activeView to 'dashboard'" → "'tasks'").

**`src/App.tsx`:**
- Remove `import DashboardView from './views/DashboardView'` (line 15).
- In `initializeState()`, change both `activeView: 'dashboard'` occurrences (persisted-branch and seed-branch) to `activeView: 'tasks'`.
- Update `handleViewChange`'s param type and the `renderView()` switch: delete the `case 'dashboard': return <DashboardView .../>` branch (lines 279–280) entirely — no replacement case needed since it's no longer a valid `activeView` value.
- Update the `onViewChange` prop type signature passed to `AppShell` (and any local `DispatchAction`/type annotations referencing `'dashboard'`) to drop it from the union.

**`src/components/AppShell.tsx`:**
- Remove the `{ id: 'dashboard', label: 'Dashboard', icon: LayoutGrid }` entry from `navTabs` (line 51). Remove the now-unused `LayoutGrid` import if nothing else in the file uses it (check remaining icon usages first — `ListChecks`, `BarChart3` stay).
- Update `AppShellProps.onViewChange`'s type union (line 9) to drop `'dashboard'`.

**`src/lib/reducer.ts`:**
- No change needed to the `SET_ACTIVE_VIEW` case itself (`return { ...state, activeView: action.view }`, line 21) — it's untyped passthrough. Just confirm no other reducer branch special-cases `'dashboard'`.

**Delete file:** `src/views/DashboardView.tsx`.

**Test case (Phase 7):** App boots with a fresh (no localStorage) state and lands on the Tasks view, not a blank/error screen. Existing persisted state with `activeView: 'dashboard'` (from before this change) does not crash on load — since the type no longer allows `'dashboard'`, the `renderView()` switch's `default: return <div>View not found</div>` branch would catch it; decide whether this is acceptable (likely yes, since it's a fallback, not a crash) or whether `initializeState` should coerce a persisted `'dashboard'` value to `'tasks'` — recommend adding that coercion (`activeView: persisted.activeView === 'dashboard' ? 'tasks' : persisted.activeView || 'tasks'`) for a clean upgrade path for existing users. Nav bar renders exactly 2 tabs (Tasks, Timeline) — wait, confirm: also Milestones tab has no nav pill today (grep shows only `dashboard`/`tasks`/`timeline` in `navTabs` — Milestones view exists but has no nav tab; out of scope, pre-existing). After the change, nav bar shows Tasks and Timeline tabs, with Tasks visually active/default on load.

---

### Phase 5: Update Existing Tests Referencing Dashboard/`activeView` (T1)
**Files:** `src/__tests__/settings.test.ts`, `src/lib/persist.test.ts`, `src/__tests__/TasksView.test.tsx`
**Depends on:** Phase 3, Phase 4 (needs the trimmed `DerivedData` shape and the new `activeView` type to typecheck against)
**Duration:** 20 min

- `src/__tests__/settings.test.ts` (line 8) and `src/lib/persist.test.ts` (line 17): change `activeView: 'dashboard'` to `activeView: 'tasks'` in their mock `AppState` objects.
- `src/__tests__/TasksView.test.tsx`: the mock `DerivedData` object (lines 101–126) currently includes `statCards`, `statusBreakdown: []`, `recentActivity: []`. Remove `statusBreakdown` and `recentActivity` (deleted from the interface in Phase 3). Decide whether to also remove `statCards` from this mock — since `DerivedData` no longer has that field (Phase 3), it must be removed here too, or the mock will fail to typecheck. Note: `TasksView`'s new stat-card grid (Phase 6) computes its own stats via `computeStatCards`/`filterTasksByFilters` from `state.tasks`/`state.filters`, not from `derivedData.statCards` — so this existing test's `mockState.tasks` (3 tasks, `filters: {}`) will now also render live stat cards; the Phase 7 test additions build on this same test file/fixture.
- Grep once more after edits (`grep -rn "statusBreakdown\|recentActivity\|ActivityFeedItem" src`) to confirm zero remaining references before moving on.

**Test case:** `npm run typecheck` and `npm test` (or equivalent) pass with these three files updated — no leftover reference to the old `DerivedData` shape or `'dashboard'` view value.

---

### Phase 6a: Filtered Stat Cards at Top of TasksView (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** Phase 1 (`filterTasksByFilters`), Phase 3 (`computeStatCards` still exported, no longer on `DerivedData`)
**Duration:** 25 min

- Import `filterTasksByFilters` from `../lib/rows` and `computeStatCards` from `../lib/selectors`.
- Add a `useMemo`-computed `filteredTasks = filterTasksByFilters(state.tasks, state.filters)` (recompute when `state.tasks`/`state.filters` change).
- Add `const statCards = computeStatCards(filteredTasks, displaySchedules)` (also memoized, depends on `filteredTasks`/`displaySchedules`).
- Port the stat card grid JSX and `STAT_ACCENTS` array verbatim from `DashboardView.tsx` (lines 14–22, 27–33, 41–59), inserting it at the top of `TasksView`'s returned JSX, above the existing `<div className="bg-white border border-border rounded-lg overflow-x-auto">` grid wrapper (current line 143). Keep the same label set/order: Total Items, Total Estimate, Completed, In Progress, Overdue; same `bg-white border border-border rounded-lg p-[20px] shadow-1` card styling and `grid grid-cols-5 gap-[16px] mb-s6` container.
- `TasksView`'s outer wrapper currently uses `p-s7` (line 138) as page padding — keep that; the stat card grid sits inside it, above the table, same as Dashboard's own top-level padding pattern (`p-[28px_32px]`) — reconcile by keeping `TasksView`'s existing `p-s7` wrapper padding rather than introducing Dashboard's padding values, since the table below already relies on `p-s7`.

**Test case (Phase 7):** covered in Phase 7.

---

### Phase 6b: Reusable Collapsible Component (T2)
**File:** `src/components/Collapsible.tsx` (new)
**Depends on:** None (pure new component, can be built in parallel with 6a)
**Duration:** 20 min

Plain React state + Tailwind, no new dependency, using `lucide-react`'s `ChevronDown` (already a project dependency, used in `AppShell.tsx`):

```tsx
import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleProps {
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
}

const Collapsible: React.FC<CollapsibleProps> = ({ label, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white border border-border rounded-lg shadow-1 mb-s6">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-s2 p-s6 cursor-pointer select-none"
      >
        <ChevronDown
          size={16}
          className="text-fg-2 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="text-body font-medium text-fg-1">{label}</span>
      </div>
      {open && <div className="px-s6 pb-s6">{children}</div>}
    </div>
  )
}

export default Collapsible
```

- Defaults to collapsed (`defaultOpen` unset → `false`) per requirement.
- Matches existing card styling (`bg-white border border-border rounded-lg shadow-1`, `ink-100`/`rounded-pill` tokens used inside children per Dashboard's chart style).
- Generic/reusable — not Tasks-specific — so it lives in `src/components/`, not `src/views/`.

**Test case (Phase 7):** Render `Collapsible` with `defaultOpen` unset → children not in the DOM, chevron rotated -90deg (collapsed visual state). Click the header → children appear, chevron rotates to 0deg. Click again → collapses back.

---

### Phase 6c: Assignee Breakdown Chart (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** Phase 2 (`computeAssigneeBreakdown`), Phase 6a (`filteredTasks` memo already exists in this file)
**Duration:** 25 min

- Import `computeAssigneeBreakdown` from `../lib/selectors`.
- Add `const assigneeBreakdown = useMemo(() => computeAssigneeBreakdown(filteredTasks), [filteredTasks])`.
- Build the horizontal bar chart, styled like Dashboard's existing "Status breakdown" bar rows (`DashboardView.tsx` lines 66–92) but keyed on assignee instead of status, and scaled by `totalEstimate` instead of count:

```tsx
{assigneeBreakdown.map((entry) => {
  const maxEstimate = assigneeBreakdown[0]?.totalEstimate || 0
  const percentage = maxEstimate > 0 ? (entry.totalEstimate / maxEstimate) * 100 : 0
  return (
    <div key={entry.assignee} className="flex items-center gap-[10px]">
      <span className="w-[100px] text-[0.8125rem] text-fg-2 flex-shrink-0 truncate">
        {entry.assignee}
      </span>
      <div className="flex-1 h-2 bg-ink-100 rounded-pill overflow-hidden">
        <div
          className="h-full rounded-pill"
          style={{ width: `${percentage}%`, background: 'var(--ns-netskope-blue)' }}
        />
      </div>
      <span className="w-[28px] text-right text-[0.8125rem] text-fg-3">
        {entry.totalEstimate}d
      </span>
    </div>
  )
})}
```

- Bar width is scaled relative to the **largest** assignee's total (matches a typical horizontal-bar-chart convention) rather than Dashboard's status-breakdown convention (relative to overall total item count) — since "percent of total items" doesn't make sense for a sum-of-estimates chart. This is a deliberate deviation from the Dashboard's status-bar percentage math; flagged in the summary as a judgment call, not explicitly specified in the interview.
- Empty state: if `assigneeBreakdown.length === 0` (no tasks match filters), render `<p className="text-[0.8125rem] text-fg-3">No tasks match the current filters</p>` (mirrors Dashboard's `"No upcoming milestones"` empty-state pattern).
- This chart is the left column of the two-column grid built in Phase 6e.

**Test case (Phase 7):** covered in Phase 7.

---

### Phase 6d: Upcoming Milestones Chart, Filtered (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** Phase 6a (`filteredTasks`), Phase 3 (`computeUpcomingMilestones` untouched/still exported)
**Duration:** 20 min

- Import `computeUpcomingMilestones` from `../lib/selectors`.
- Add `const filteredUpcomingMilestones = useMemo(() => computeUpcomingMilestones(filteredTasks, state.milestones, displaySchedules, progressMap), [filteredTasks, state.milestones, displaySchedules, progressMap])`. This is a **separate, second call** to the same function `computeDerivedData` already uses internally (unfiltered, for `MilestonesView`) — do not read from `derivedData.upcomingMilestones` here, that copy must stay unfiltered.
- Port the "Upcoming milestones" JSX verbatim from `DashboardView.tsx` (lines 96–130), swapping `upcomingMilestones` for `filteredUpcomingMilestones` and keeping the `onClick` behavior that dispatches `SET_ACTIVE_VIEW`/`SET_FILTER` — note this onClick currently does `dispatch({ type: 'SET_ACTIVE_VIEW', view: 'tasks' })` before setting the milestone filter; since we're already on the Tasks page, that first dispatch is now a same-view no-op (harmless but redundant) — keep it as-is for minimal diff, or drop it since it's dead weight now that the chart lives on the Tasks page itself. Recommend dropping it (just dispatch `SET_FILTER`) since it's clearly dead code in the new location.
- This chart is the right column of the two-column grid built in Phase 6e.

**Test case (Phase 7):** covered in Phase 7.

---

### Phase 6e: Assemble the Breakdown Collapsible Section (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** Phase 6b (`Collapsible` component), Phase 6c (assignee chart), Phase 6d (milestones chart) — this phase wires the three together, so it must land after all three
**Duration:** 15 min

- Import `Collapsible` from `../components/Collapsible`.
- Insert directly below the stat card grid (Phase 6a) and above the existing task grid wrapper:

```tsx
<Collapsible label="Breakdown" defaultOpen={false}>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-s5">
    <div>
      <div className="text-body font-medium mb-s4">Assignee breakdown</div>
      <div className="flex flex-col gap-s3">{/* Phase 6c bars */}</div>
    </div>
    <div>
      <div className="text-body font-medium mb-s4">Upcoming milestones</div>
      <div className="flex flex-col gap-[14px]">{/* Phase 6d milestone rows */}</div>
    </div>
  </div>
</Collapsible>
```

- Two-column on wide screens (`lg:grid-cols-2`), single column stacked on narrow viewports (`grid-cols-1` base) — confirm the project's Tailwind config has a `lg:` breakpoint configured (standard default, should be fine without checking further; flag if `tailwind.config` uses a nonstandard breakpoint scale).

**Test case (Phase 7):** covered in Phase 7.

---

### Phase 7: Test Coverage for New Tasks Page Behavior (T3)
**Files:** `src/__tests__/TasksView.test.tsx` (extend), `src/lib/selectors.test.ts` (new or existing — check first), `src/lib/rows.test.ts` (new or existing — check first), `src/components/Collapsible.test.tsx` (new)
**Depends on:** All of Phase 1–6 (T0 through T2)
**Duration:** 30 min (split further if any single file's assertions grow past ~30 min of work)

Grep `src/__tests__` and co-located `*.test.ts(x)` first for existing coverage of `rows.ts`/`selectors.ts` before creating new test files.

**Test 1 — `taskMatchesFilters`/`filterTasksByFilters` (Phase 1):** as described in Phase 1's test case above.

**Test 2 — `computeAssigneeBreakdown` (Phase 2):** as described in Phase 2's test case above.

**Test 3 — stat cards respect filters:** Render `TasksView` with a state containing tasks across multiple statuses/assignees and an active `state.filters.status` (e.g. `'Done'`). Assert the "Total Items" stat card value equals the count of matching (not all) tasks, and "Completed"/"In Progress"/"Overdue" reflect the filtered subset. Change the filter (re-render) → assert cards update.

**Test 4 — Breakdown section collapsed by default:** Render `TasksView` → assert the assignee/milestone chart content is not present in the DOM initially; assert a "Breakdown" label is visible. Click it → assert chart content appears (bars, milestone rows).

**Test 5 — assignee breakdown grouping/sorting in context:** Build tasks with assignees `['Alice', 'Alice', '', 'Bob']` and varying estimates → open the Breakdown section → assert an "Unassigned" bar exists (for the empty-assignee task, not dropped) and bars render in descending total-estimate order.

**Test 6 — assignee/milestone charts respect filters:** With an active `assignee` or `milestone` filter set, assert the assignee breakdown and upcoming-milestones chart only reflect matching tasks (e.g. filtering to one assignee collapses the assignee chart to a single bar; filtering to one milestone changes which milestone rows/task counts show).

**Test 7 — `Collapsible` component (Phase 6b):** as described in Phase 6b's test case above.

**Test 8 — Dashboard-removal regression check:** Confirm (via the Phase 4/5 test updates) that the app never renders a Dashboard heading, and the nav bar has no "Dashboard" tab/icon.

---

## File Changes Summary

1. **src/lib/rows.ts** — extract `taskMatchesFilters`/`filterTasksByFilters` (exported), used by both `computeRowMap` and the new Tasks-page selectors.
2. **src/lib/selectors.ts** — add `computeAssigneeBreakdown`/`AssigneeBreakdown`; delete `computeStatusBreakdown`/`StatusBreakdown`, `computeRecentActivity`/`ActivityFeedItem`; remove `statCards`, `statusBreakdown`, `recentActivity` from `DerivedData`/`computeDerivedData` (keep `computeStatCards`/`StatCards` exported standalone; keep `computeUpcomingMilestones`/`UpcomingMilestone`/`upcomingMilestones` in `DerivedData` unchanged for `MilestonesView`).
3. **src/views/DashboardView.tsx** — delete.
4. **src/App.tsx** — remove `DashboardView` import and its `renderView()` case; change `initializeState()` defaults from `'dashboard'` to `'tasks'` (both branches); recommend adding a persisted-state coercion for old `'dashboard'` values.
5. **src/components/AppShell.tsx** — remove the Dashboard nav tab entry; drop `'dashboard'` from `onViewChange`'s type union; drop unused `LayoutGrid` import if no longer used.
6. **src/lib/state.ts** — narrow `AppState.activeView` union to `'tasks' | 'milestones' | 'timeline'`; change all `activeView: 'dashboard'` defaults (`switchProject`, `createProject`, `deleteProject`) to `'tasks'`.
7. **src/views/TasksView.tsx** — add filtered stat card grid, Breakdown `Collapsible` section (assignee bar chart + filtered upcoming-milestones chart), all computed from `filterTasksByFilters(state.tasks, state.filters)`.
8. **src/components/Collapsible.tsx** — new generic collapsible section component.
9. **Test files** — `src/__tests__/settings.test.ts`, `src/lib/persist.test.ts` (fix `activeView: 'dashboard'` → `'tasks'`); `src/__tests__/TasksView.test.tsx` (fix mock `DerivedData` shape, add new-behavior tests); new/extended tests for `rows.ts`, `selectors.ts`, `Collapsible.tsx`.

---

## Acceptance Criteria

- [ ] Dashboard page, route, and nav tab are gone; `src/views/DashboardView.tsx` is deleted.
- [ ] App lands on the Tasks view by default (fresh state and no-Dashboard persisted state alike).
- [ ] `AppState.activeView` type no longer includes `'dashboard'`; no remaining reference to it in source or tests.
- [ ] Tasks page shows 5 stat cards (Total Items, Total Estimate, Completed, In Progress, Overdue) at the top, matching Dashboard's original visual style.
- [ ] Stat cards recompute from the filtered task set when any of `state.filters` (status/category/assignee/milestone/search) changes.
- [ ] A "Breakdown" section (custom Collapsible, no new dependency) sits between the stat cards and the task grid, collapsed by default, with a clickable label + chevron toggle.
- [ ] Breakdown contains a two-column (stacking to one column on narrow viewports) layout: Assignee breakdown bar chart (left) and Upcoming milestones (right).
- [ ] Assignee breakdown sums `task.estimate` grouped by `task.assignee`, buckets empty/falsy assignee into "Unassigned" (not dropped), sorts descending by total, and respects active filters.
- [ ] Upcoming milestones chart in the Breakdown section reuses the existing per-milestone status-count progress bar UI, filtered by active filters — while `MilestonesView`'s own milestone cards remain unaffected (still unfiltered).
- [ ] `computeStatusBreakdown`/`StatusBreakdown`, `computeRecentActivity`/`ActivityFeedItem` are deleted with no remaining references anywhere in `src`.
- [ ] `npm run typecheck` (or equivalent) and the full test suite pass with no regressions.
- [ ] Manual/visual check (or `verify` skill) confirms: Tasks page loads with stat cards, Breakdown starts collapsed and expands/collapses correctly, both charts reflect filter changes live, and no Dashboard nav entry remains.
