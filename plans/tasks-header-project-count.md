# Tasks Header Removal + Project Dropdown Task Count — Implementation Plan

## Overview

Two small, isolated UI tweaks:

1. Remove the "Tasks (N shown)" page header from `TasksView`.
2. Add a per-project task count (e.g. `"Marketing Site (12 tasks)"`, `"1 task"` singular, `"(0 tasks)"` for empty/unvisited projects) to each row in the `ProjectSwitcher` dropdown.

No reducer, sync, or data-model changes — both tasks only read existing state (`AppState.tasks`, `AppState.savedProjects`) and edit render code.

## Phases

### Phase 1: Remove Tasks Page Header (T0)
**File:** `src/views/TasksView.tsx`
**Depends on:** None
**Duration:** 10 min

- Remove the `<h2>` block at lines 144–149 (`Tasks <span>({visibleCount} shown)</span>`) entirely — no replacement text, no wrapping empty `<div>` left behind.
- Remove the now-unused `visibleCount` const at line 135 (`Object.keys(rowMap.rowNumberMap).length`) — otherwise it trips `noUnusedLocals`/lint.
- Confirm `rowMap` is still used elsewhere in the file after removing this one usage (grep before deleting anything beyond the const itself); if `rowMap` becomes unused too, leave it — it is almost certainly used later for row rendering, only `visibleCount` should be pruned.
- Double check no other code in the file (or in tests) reads a DOM node keyed off this header (e.g. `getByText('Tasks')`) — if `src/__tests__` has such a query it needs updating in Phase 3.

**Test case (Phase 3):** Render `TasksView` → `queryByText(/Tasks/)` header-level match returns null (scoped so it doesn't false-positive on unrelated "Tasks" text elsewhere in the view, e.g. nav labels); no `(N shown)` text anywhere in the rendered output.

---

### Phase 2: Project Task Count Helper + Dropdown Render (T0)
**File:** `src/components/ProjectSwitcher.tsx`
**Depends on:** None (independent of Phase 1)
**Duration:** 25 min

Add a small local helper and use it in the existing `state.projects.map(...)` block (lines 66–84):

```ts
function getProjectTaskCount(state: AppState, projectId: string): number {
  if (projectId === state.activeProjectId) {
    return state.tasks.length
  }
  return state.savedProjects[projectId]?.tasks.length ?? 0
}

function formatTaskCount(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`
}
```

- Place both functions above the component (module-level, no new file — matches existing file's scale).
- In the render loop, compute `const count = getProjectTaskCount(state, project.id)` per project and render `{project.name} ({formatTaskCount(count)})` in place of the current bare `{project.name}` at line 79. Keep existing `isActive` bold/checkmark styling untouched — only the label text changes.
- Do NOT filter by `status`; count is the full `.length` of the tasks array regardless of status (including `Done`), per the resolved requirement — this matches `state.tasks.length` / `savedProjects[...].tasks.length` directly with no `.filter(...)`.
- Guard against a project that was created but never switched away from (no `savedProjects[project.id]` entry yet) — the `?.tasks.length ?? 0` optional chain handles this; verify it does not throw for a brand-new project id not present in `savedProjects`.

**Test case (Phase 3):** covered in Phase 3 below (co-located with Phase 2's file, but written as part of the shared test pass since both dropdown scenarios need the same rendered `ProjectSwitcher` instance).

---

### Phase 3: Test Coverage (T1)
**Files:** `src/views/TasksView.test.tsx` (or existing test file covering `TasksView`, if one exists — check `src/__tests__` first), `src/components/ProjectSwitcher.test.tsx` (new, or existing if present)
**Depends on:** T0 (Phase 1), T0 (Phase 2)
**Duration:** 25 min

Before writing new test files, grep `src/__tests__` and any co-located `*.test.tsx` for existing coverage of `TasksView` and `ProjectSwitcher` — extend those files rather than creating duplicates if they exist.

**Test 1 — header removed:** Render `TasksView` with a state containing some tasks → assert no element renders the old header text pattern (`"Tasks"` as a standalone `<h2>` and `/\(\d+ shown\)/`). Assert the rest of the view (column headers, rows) still renders normally.

**Test 2 — active project count reflects `state.tasks`:** Build a state where `activeProjectId` matches a project in `state.projects`, with `state.tasks` containing e.g. 3 tasks. Render `ProjectSwitcher` open → assert that project's row shows `"(3 tasks)"`. Add/remove an item from `state.tasks` (re-render with updated state) → assert the count updates accordingly (e.g. 3 → 4 after adding, 4 → 3 after removing).

**Test 3 — inactive project count reflects `savedProjects` snapshot:** Build a state with a second project (not active) whose `savedProjects[otherId].tasks` has e.g. 5 tasks → assert that project's row shows `"(5 tasks)"`, independent of what's in the live `state.tasks`.

**Test 4 — never-visited new project shows 0, no crash:** Build a state with a project id present in `state.projects` but absent from `savedProjects` entirely (simulating a brand-new project never switched away from) and not the active project → assert the row renders `"(0 tasks)"` and the render does not throw.

**Test 5 — singular vs. plural wording:** Directly unit-test `formatTaskCount` (or exercise it via the dropdown) for `count = 0` → `"0 tasks"`, `count = 1` → `"1 task"`, `count = 2` → `"2 tasks"`. If `formatTaskCount` is not exported, test through the rendered dropdown text instead of exporting it solely for testing (keep the helper module-private unless another consumer emerges).

**Test 6 — Done tasks are included in the count:** Build a project's task list (active or saved) with a mix of statuses including several `status === 'Done'` → assert the displayed count equals total task count, not the non-Done subset (guards against accidentally reusing `doneCount`-style filtering from `src/lib/selectors.ts`).

---

## File Changes Summary

1. **src/views/TasksView.tsx** — remove `<h2>` header block (lines ~144–149) and the now-unused `visibleCount` const (line 135).
2. **src/components/ProjectSwitcher.tsx** — add `getProjectTaskCount` and `formatTaskCount` helpers; update the project row label at line ~79 to include the formatted count.
3. **Test files** — extend or create tests for `TasksView` (header removal) and `ProjectSwitcher` (count display, singular/plural, active vs. saved-snapshot source, never-visited default, Done-inclusive counting).
4. **No changes needed:** `src/lib/reducer.ts`, `src/lib/state.ts`, `src/lib/types.ts`, `src/lib/sync.ts`, `src/lib/selectors.ts` — all reads of existing shape only, no schema or action changes.

---

## Acceptance Criteria

- [ ] `TasksView` no longer renders any "Tasks" heading or "(N shown)" count text.
- [ ] `TasksView`'s table/columns/rows render unaffected by the header removal (no leftover spacing bugs, no unused-variable lint/typecheck errors from the removed `visibleCount`).
- [ ] Each row in the `ProjectSwitcher` dropdown shows `"<Project Name> (<count> task(s))"` with correct singular/plural wording.
- [ ] The active project's count is sourced from `state.tasks.length` and updates live as tasks are added/removed.
- [ ] Inactive projects' counts are sourced from `state.savedProjects[projectId]?.tasks.length`, defaulting to `0` when no snapshot exists yet (no crash for brand-new projects).
- [ ] Counts include tasks of every status, including `Done` — no filtering applied.
- [ ] `npm run typecheck` (or equivalent) and the full test suite pass with no regressions.
- [ ] Manual/visual check (or `verify` skill) confirms the Tasks page header is gone and the project dropdown shows counts as expected.
