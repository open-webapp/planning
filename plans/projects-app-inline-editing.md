# Projects App — Inline Editing, CSV Export, Projects Settings Tab — Implementation Plan

Source of truth: `.design/project/Project Management App.dc.html` (1630 lines) + `.design/project/Autocomplete Cell.dc.html` (109 lines). Line refs point at these design files unless marked "current src" (which point at real files as of this writing — re-check line numbers before editing if other work lands first).

## Overview

Three features bolted onto the existing React/Vite projects app: (1) a reusable `AutocompleteCell` component (typeahead + freeform "add new" + colored-pill rendering for Status) replacing the native `<select>`s for Category/Status/Assignee in `TaskRow.tsx`; (2) a CSV export icon in the top chrome bar wired to a `exportTasksCsv` function; (3) a "Projects" tab in Settings listing all projects with backup-then-delete. Alongside these, clean up pre-existing seed/status-list cruft that contradicts the "no seeded data" and "4-status" decisions: kill hardcoded category/assignee option lists, remove "On Hold" everywhere, and strip the stray Google Client ID input. `subCategory` stays out of the `Task` type, reducer, and CSV headers throughout — every task below that touches the design's data model or CSV column list drops it.

Confirmed by reading current source: `emptyProjectState()` (`src/lib/state.ts:82-95`) already starts `tasks`/`milestones` as `[]`, and `seedData()` (`src/lib/seed.ts:14-16`) already returns `{ milestones: [], tasks: [] }` — **no action needed** for either. The seeded-data violation instead lives in `src/App.tsx`'s `initializeState()`, which hardcodes non-empty `customStatuses`/`customAssignees`/`customCategories` defaults — that's fixed in Phase 0.

`pushToSheet` (for delete-project backup) already exists in `src/lib/googleAuth.ts` and is used by `src/lib/sync.ts`'s `syncNow` — reuse it directly, don't reinvent. `ADD_CUSTOM_VALUE` (`src/lib/reducer.ts:101-102`) → `StateActions.handleValueSelect` (`src/lib/state.ts:600-619`) already does exactly the dedup-and-append job needed for AutocompleteCell's "add new" commits — reuse as-is, no reducer changes needed for that part.

## Phase 0 — Kill seeded/hardcoded option lists & fix the status list

No dependencies. Do this first — it touches files that Phase 2 will also touch, so land it before wiring AutocompleteCell to avoid rebasing.

1. **Add a single `STATUS_OPTIONS` constant.** In `src/lib/statusColors.ts` (already the file every status consumer imports from), add `export const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Done']` and remove the `'On Hold': 'var(--ns-orange)'` entry from `STATUS_COLORS` (currently line 4). This is the one fixed built-in list for Status — unlike Category/Assignee, Status keeps a non-empty built-in set per the resolved requirement.
   - Test: `statusColor('On Hold')` now falls through to the default `'var(--ns-ink-400)'` (no crash, no special-cased color).
2. **Fix `src/App.tsx` `initializeState()`.** Both branches (persisted-fallback at lines 53-59 and fresh-init at lines 98-104) currently default `customStatuses`/`customAssignees`/`customCategories` to seeded arrays (`['Done', 'In Progress', 'Not Started', 'Blocked']`, 6 named assignees, 5 named categories). Change all three defaults in both branches to `[]`. Depends on nothing, but do before task 9-11 land so there's no seeded data to see while testing.
   - Test: clear `localStorage`, reload app, open a task row — Category/Assignee autocomplete popovers show zero options until the user types and adds one.
3. **Fix `src/components/Toolbar.tsx` filter option lists (lines ~57-59).** `statusOptions` currently reads `['Not Started', 'In Progress', 'Completed', 'On Hold', ...state.customStatuses]` — note `'Completed'` is already a pre-existing bug (no task ever has that status string). Replace with `[...STATUS_OPTIONS, ...state.customStatuses.filter(s => !STATUS_OPTIONS.includes(s))]` (import `STATUS_OPTIONS` from `../lib/statusColors`). `categoryOptions`/`assigneeOptions` currently hardcode `['Product', 'Engineering', 'Design']` / `['Unassigned', 'Team']` as their base — change both bases to `[]` so only `state.customCategories`/`state.customAssignees` supply filter options.
   - Test: with no custom values added yet, the Category and Assignee filter dropdowns in the Tasks/Timeline toolbar show only the "(Clear)" + "+ Add new value…" rows, no seeded names; Status filter shows exactly 4 options plus any user-added ones.
4. **Verify no other hardcoded status array exists.** Grep confirmed the only three "On Hold"/status-list sites in `src/` are `statusColors.ts`, `Toolbar.tsx`, and `TaskRow.tsx` (fixed in Phase 2 as part of the AutocompleteCell swap, not here) — Dashboard's status breakdown and Milestones' status chips both derive their status set from actual task data (`computeStatusBreakdown`/`statusCounts` in `src/lib/selectors.ts`), not a hardcoded list, so they need no separate fix; they'll simply stop showing "On Hold" once no task can be assigned that status. No task here, just a checkpoint before moving on.

## Phase 1 — `AutocompleteCell` component

Depends on nothing (new file). Must land before Phase 2.

5. **Create `src/components/AutocompleteCell.tsx`.** Port `.design/project/Autocomplete Cell.dc.html` behavior 1:1 into a React function component with local `useState`:
   ```ts
   interface AutocompleteCellProps {
     value: string
     options: string[]
     onCommit: (value: string) => void
     placeholder?: string
     wrapperStyle?: React.CSSProperties
     inputStyle?: React.CSSProperties
     inputHoverStyle?: React.CSSProperties  // applied via a hover class/state, see task 6
     inputFocusStyle?: React.CSSProperties
     onStopClick?: (e: React.MouseEvent) => void
   }
   ```
   State: `editing: boolean`, `query: string`, `open: boolean`, `highlight: number`, `menuPos: {top,left,width} | null`. Behavior, matching the design line-for-line:
   - `query` shown = `editing ? state.query : props.value`.
   - Filtering: `trimmedQuery = query.trim()`, case-insensitive substring match against `options`, `.slice(0, 8)` — cap at 8 results (design line 68).
   - `exactMatch = options.some(o => o.toLowerCase() === trimmedQuery.toLowerCase())`.
   - `showAddNew = open && !!trimmedQuery && !exactMatch`; `showEmpty = open && filtered.length === 0 && !showAddNew` — mutually exclusive by construction (design lines 70-71).
   - `onFocus`: select input text, enter editing mode with `query = value`, open menu, recompute position.
   - `onChange`: update query, open menu, reset highlight to -1.
   - `onBlur`: **always** commit whatever is currently typed if `editing` is true (design line 84) — no click-away cancel, only Escape cancels.
   - `onKeyDown`: `Enter` → commit current query (preventDefault); `Escape` → preventDefault, revert `query` to `value`, close, stop editing; `ArrowDown` → `highlight = min(highlight+1, filtered.length-1)`, opens menu if not open; `ArrowUp` → `highlight = max(highlight-1, 0)` — both bounded, no wraparound (design lines 88-89).
   - `commit(val)`: trim; close menu, clear highlight, stop editing; if non-empty, call `props.onCommit(trimmed)`.
   - Menu item click uses `onMouseDown` (not `onClick`) with `e.preventDefault()` so it fires before the input's `onBlur` — this is the race-avoidance the design calls out explicitly (design line 16, comment in resolved requirements). Same for the "Add new" row and empty-state row placement.
   - Menu positioning: `updateMenuPos()` reads `inputRef.current.getBoundingClientRect()`, sets `menuPos = { top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 160) }`, menu rendered with `position: fixed` at that `menuPos` (not `absolute` — parent cells clip overflow, design lines 34-39, 92). Recompute on open (`requestAnimationFrame` follow-up, design lines 52-53) and on every `window` `scroll` (capture phase, so it catches scrolling in any ancestor scroll container, not just window) and `resize` event while the menu is open; clean up listeners on unmount.
   - Depends on nothing else in this phase.
6. **Hover/focus style handling.** Design uses a custom `style-hover`/`style-focus` prop convention (not real CSS) — in React, implement via local `isHovered`/`isFocused` state merged into the inline `style` object (or a small CSS class name derived from a stable prefix + `:hover`/`:focus-within` in a scoped stylesheet, whichever is less code — plain inline state merge is simplest and avoids a new CSS file). Depends on task 5.
7. **Unit/interaction tests for `AutocompleteCell`.** New file `src/components/AutocompleteCell.test.tsx` (Vitest + `@testing-library/react`, already a dep per `plans/projects-app-v1.md` task 2). See Test Cases section below. Depends on tasks 5-6.

## Phase 2 — Wire `AutocompleteCell` into `TaskRow.tsx`

Depends on Phase 0 (clean option lists) and Phase 1 (component exists).

8. **Replace the Category `<select>`.** In `src/views/TaskRow.tsx`, current Category cell (lines 151-169) — swap for `<AutocompleteCell value={task.category} options={state.customCategories} placeholder="Category" onCommit={(v) => { dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { category: v } }); dispatch({ type: 'ADD_CUSTOM_VALUE', fieldName: 'customCategories', value: v }) }} .../>`. `ADD_CUSTOM_VALUE`/`handleValueSelect` already dedupes (`src/lib/state.ts:611-613`), so dispatching it unconditionally on every commit (not just genuinely-new values) is safe and simpler than checking first. Carry over the existing wrapper/input styling (`w-full max-w-full`, font-size `0.8125rem`, etc.) into `inputStyle`/`wrapperStyle` props. Depends on task 5.
   - Test: typing a substring of an existing custom category filters the popover to matches (case-insensitive); typing a brand-new string and pressing Enter adds it to `state.customCategories` and sets it as the task's category.
9. **Replace the Status `<select>`.** Current Status cell (lines 171-194, includes the `'On Hold'` entry being removed per Phase 0). Swap for `<AutocompleteCell value={task.status} options={dedupedStatusOptions} placeholder="Status" onCommit={...UPDATE_TASK status + ADD_CUSTOM_VALUE customStatuses...} inputStyle={statusPillStyle} .../>` where `dedupedStatusOptions = [...STATUS_OPTIONS, ...state.customStatuses.filter(s => !STATUS_OPTIONS.includes(s))]` (same pattern as Toolbar task 3) and `statusPillStyle` builds the colored pill purely from `statusColor(task.status)` — background/border via `color-mix`, matching the existing select's current inline style (lines 182-186) and the design's `input-style="{{ row.statusBadgeStyle }}"` (design line 221). **No separate pill component** — this is all passed into the same `AutocompleteCell` via style props, per the resolved requirement. Depends on task 5, Phase 0 task 1 (`STATUS_OPTIONS`).
   - Test: the rendered input's background/border color matches `statusColor(task.status)` for each of the 4 statuses; typing an unrecognized status string and committing it falls back to the default gray pill color (no crash from a missing `STATUS_COLORS` entry).
10. **Replace the Assignee `<select>`.** Current Assignee cell (lines 196-213, currently hardcodes `['Unassigned', 'Alice', 'Bob', 'Charlie', 'Diana']`). Swap for `<AutocompleteCell value={task.assignee} options={state.customAssignees} placeholder="Assignee" onCommit={...UPDATE_TASK assignee + ADD_CUSTOM_VALUE customAssignees...} .../>`. Depends on task 5.
    - Test: with `customAssignees` empty, opening the cell shows only the "Add …" row (once a query is typed) — no seeded names ever appear.
11. **Cross-check keyboard/mouse behavior end-to-end inside the real table.** Click a Category cell, arrow down/up through options, Enter to commit; click a different cell's option with the mouse (verify no "commit garbage then re-open" race — this is the `onMouseDown`-before-`onBlur` ordering from task 5); Escape while editing reverts and leaves the original value untouched; tab away (blur) with partial text commits that text as a new value. Depends on tasks 8-10.
12. **Confirm Toolbar's filter dropdowns and TaskRow's cell dropdowns read from the same underlying `customCategories`/`customAssignees`/`customStatuses` arrays** — a value added via a task row's "add new" immediately appears as a filter option without a reload (both read off `state` directly, no separate copy). Depends on tasks 3 (Toolbar), 8-10 (TaskRow).

## Phase 3 — CSV export

Can start in parallel with Phase 1/2; only the AppShell icon wiring (task 15) needs nothing from those phases.

13. **Implement `exportTasksCsv` in a new `src/lib/csv.ts`.** Port `.design/project/Project Management App.dc.html` lines 778-808 (`exportProjectCsv`), with `subCategory` dropped:
    ```ts
    export function exportTasksCsv(tasks: Task[], milestones: Milestone[], projectName: string): void
    ```
    - Headers (in order, `Sub-category` dropped per scope decision): `['Name', 'Milestone', 'Category', 'Assignee', 'Status', 'Start Date', 'Estimate (days)', 'Est. End Date', 'Progress %', 'Dependencies']`.
    - One row per task; `Est. End Date` sourced from `computeBaseSchedules(tasks)` (the same helper already in `src/lib/scheduling.ts`), not `displaySchedules` — matches the design's use of `computeBaseSchedules` at line 780.
    - `Dependencies` column = task's `dependencies` ids mapped to dependency task **names** (not ids), joined with `'; '` (design line 788) — a dangling/unknown dependency id should fall back to the raw id string, same as the design (`d ? d.name : id`).
    - CSV escaping: quote any field containing a comma, double-quote, or newline; double up embedded double-quotes (design lines 782-784, regex `/[",\n]/`).
    - Build via `Blob([csv], { type: 'text/csv;charset=utf-8;' })`, create an `<a>` with `download` set to `{slug(projectName)}-tasks.csv` where `slug` lowercases and replaces runs of non-alphanumeric chars with `-` (design line 799's `.replace(/[^a-z0-9]+/gi, '-').toLowerCase()`), append/click/remove the anchor, `URL.revokeObjectURL`.
    - Depends on nothing (pure function, no UI).
14. **Unit tests for CSV export.** New `src/lib/csv.test.ts`. See Test Cases section below — don't need a real DOM download to test the string-building/escaping logic; refactor `exportTasksCsv` internally so the CSV-string builder is a separately-exported (or at least separately-testable) pure function if that's cleaner than mocking `Blob`/`URL.createObjectURL`/`document.createElement('a')` in jsdom. Depends on task 13.
15. **Add the CSV export icon to `src/components/AppShell.tsx`.** Import `Download` from `lucide-react` (confirmed present at `node_modules/lucide-react/dist/esm/icons/download.mjs`). Insert a button between the existing `CloudSync` conditional block (lines 111-124) and the `Settings` button (lines 126-134) — same `34px` square, same hover style (`hover:bg-white/12 hover:text-monoWhite`), `title="Download tasks as CSV"`, **always visible** regardless of `activeProject?.spreadsheetId` or sync connection state (unlike the CloudSync icon, which is conditional — this one isn't, per design line 72-74 sitting outside the `sc-if canSync` block). Add an `onExportCsv?: () => void` prop to `AppShellProps` (alongside `onSettingsClick`/`onSyncClick`), wire the button's `onClick` to it. Depends on nothing structurally, but do after task 13 exists so the wiring in task 16 has something to call.
    - Test: icon renders and is clickable with no `spreadsheetId` set and with Google disconnected — button visibility must not depend on any sync/auth state.
16. **Wire `onExportCsv` in `src/App.tsx`.** Add `handleExportCsv = () => exportTasksCsv(state.tasks, state.milestones, activeProject?.name || 'project')` (mirrors the existing `handleSyncClick`/`handleSettingsClick` pattern) and pass it to `<AppShell onExportCsv={handleExportCsv} ...>`. Depends on tasks 13, 15.

## Phase 4 — Settings "Projects" tab & backup-then-delete

Depends on Phase 3 task 13 (`exportTasksCsv`, reused for the CSV-fallback backup path). Can start in parallel with Phase 1/2.

17. **Add `settingsTab` state.** In `src/lib/state.ts`'s `AppState` interface, add `settingsTab: 'general' | 'projects'`. Initialize to `'general'` in both `App.tsx` `initializeState()` branches. In `src/lib/reducer.ts`, make `OPEN_SETTINGS` reset it to `'general'` (matches design's `toggleSettings` always resetting to general, design line 867) and add a new `SET_SETTINGS_TAB` case: `{ ...state, settingsTab: action.tab }`. Depends on nothing.
    - Test: opening Settings after having left it on the Projects tab last time reopens on General (per design behavior), not wherever it was left.
18. **Add the tab header + General/Projects split to `src/overlays/SettingsOverlay.tsx`.** Below the header (after line 94), add a tab row with two clickable labels ("General", "Projects") matching design lines 402-405 — active tab gets the underline/color treatment (reuse whatever active-tab styling convention `AppShell.tsx`'s nav pills already use for consistency, e.g. bottom border in netskope blue). Clicking dispatches `SET_SETTINGS_TAB`. Wrap the existing Data Storage / Google Account / Spreadsheet Backup content (currently lines 97-207) in an `{state.settingsTab === 'general' && (...)}` block. Depends on task 17.
19. **Remove the stray "Google OAuth Client ID" text input.** In the same file, the disconnected-state branch (current lines 137-153) renders a free `<input placeholder="Google OAuth Client ID">` (lines 138-142) plus explanatory copy about creating an OAuth client ID in Google Cloud Console (lines 143-146) that has no wired state, no `value`, no `onChange` — it's dead UI that also contradicts `plans/projects-app-v1.md`'s decision (~line 66/75) that client ID comes from `.env`/server config, never user input. Delete the `<input>` and its explanatory paragraph; keep only the "Connect Google Account" button. Depends on nothing (independent of tab work, but bundle into the same file edit as task 18 to avoid two passes over the same component).
    - Test: rendered Settings General tab, disconnected state, contains no `<input>` element anywhere in the Google Account section — only the Connect button.
20. **Build the Projects tab content.** New block rendered when `state.settingsTab === 'projects'`, matching design lines 441-461: intro line ("Deleting a project backs up its tasks first — to its linked spreadsheet if connected and configured, otherwise as a CSV download."), then one row per `state.projects`: color dot (`background: project.color`), name, a sync-status label — no `spreadsheetId` → "No spreadsheet configured"; `spreadsheetId` set, `lastSyncedAt` null → "Synced to spreadsheet"; `spreadsheetId` set and `lastSyncedAt` present → "Synced to spreadsheet — last synced {formatted lastSyncedAt}" (see Risks item 2, resolved) — and a delete icon button (`Trash2` or equivalent, red-on-hover, matching design lines 454-456's danger-color hover). Depends on task 18 (tab scaffolding).
21. **Implement backup-then-delete.** New function, e.g. `deleteProjectWithBackup(state, dispatch, projectId): Promise<void>` in `src/lib/state.ts` (or a small new `src/lib/projectDelete.ts` if keeping `state.ts` purely reducer-style helpers matters — either is fine, pick whichever keeps `state.ts` from ballooning). Logic, porting design lines 824-846 (`deleteProject`)/847-866 (`finalizeProjectDelete`):
    - `window.confirm('Delete "<name>"? This backs up its tasks first.')` — bail if declined.
    - Resolve the project's task/milestone data: if it's the active project, use `state.tasks`/`state.milestones` directly; otherwise pull from `state.savedProjects[projectId]` (fall back to `emptyProjectState()` if absent) — mirrors the design's `isActive ? s : (s.savedProjects[id] || emptyProjectState())` (design line 830).
    - If `state.googleAccessToken` is set **and** the project has a non-empty `spreadsheetId`: call `pushToSheet(spreadsheetId, token, tasks, milestones)` (existing export from `src/lib/googleAuth.ts`, same one `syncNow` already uses). On success, proceed to delete. On failure (`catch`), fall back to `exportTasksCsv(tasks, milestones, project.name)` before deleting anyway (design lines 838-840 — backup failure never blocks the delete, it just changes which backup mechanism ran).
    - Otherwise (no token or no spreadsheetId): call `exportTasksCsv(tasks, milestones, project.name)` directly, then delete (design lines 841-844).
    - Only after backup resolves, `dispatch({ type: 'DELETE_PROJECT', projectId })` — reuses the **existing** `deleteProject` reducer path (`src/lib/state.ts:295-330`) which already refuses to delete the last remaining project; don't reimplement that guard here, just don't call dispatch if the confirm was declined or if `state.projects.length <= 1` (surface a message like the design's — or simply let the existing reducer's silent no-op stand, see Risks for the UX gap this leaves).
    - Depends on task 13 (`exportTasksCsv`), existing `pushToSheet` (no new work needed there), existing `deleteProject`/`DELETE_PROJECT` (no new work needed there).
22. **Wire the Projects tab's delete button to `deleteProjectWithBackup`.** Depends on tasks 20, 21.
    - Test (see Test Cases below for the full matrix): connected + spreadsheetId configured + push succeeds → sheet backup, then delete; connected + spreadsheetId configured + push throws → CSV download fires, then delete still proceeds; no spreadsheetId (regardless of connection) → CSV download only, then delete; attempting to delete the last remaining project → confirm may fire but no project actually disappears (existing guard holds).

## Phase 5 — Polish & manual verification

Depends on all prior phases.

23. **Manual smoke pass.** Add a task, set Category/Status/Assignee via the new autocomplete cells with both keyboard (type + arrow + Enter) and mouse (click a popover row), add a freeform "add new" value for each of the three fields, reload the page and confirm the freeform values persisted and still appear as options. Click the new CSV icon and open the downloaded file in a spreadsheet app — verify the 10 headers, no Sub-category column, dependencies rendered as semicolon-joined names, and a task with a comma/quote in its name round-trips correctly. Open Settings → Projects tab, create a second project, delete one with no spreadsheet configured (confirm CSV download fires) and (if a real test spreadsheet + Google connection is available) one with a spreadsheet configured (confirm it lands in the sheet instead). Confirm the Google Account section's disconnected state no longer shows a Client ID input.

---

## Test cases

### `src/components/AutocompleteCell.test.tsx` (Vitest + Testing Library)

1. **Substring filter, case-insensitive:** options `['Engineering', 'Design', 'Marketing']`, typing `"eng"` matches `Engineering` only; typing `"ENG"` matches identically.
2. **Cap at 8 results:** 12 options all matching the query → exactly 8 rendered in the popover.
3. **ArrowDown/ArrowUp bounded, no wraparound:** with 3 filtered options, pressing ArrowDown 5 times in a row leaves `highlight` at index 2 (not wrapping to 0); pressing ArrowUp repeatedly from there floors at index 0 (never goes negative/wraps to the end).
4. **Enter commits the typed query verbatim**, even if it doesn't match any option (freeform commit path) and even if no arrow-key highlight was ever set.
5. **Escape reverts and closes:** type a partial query, press Escape → input displays the original `value` prop again, popover closed, and `onCommit` is never called.
6. **Blur always commits current text (no click-away cancel):** type a partial query, blur the input by moving focus elsewhere (not via Escape) → `onCommit` fires with the typed text.
7. **Mouse-pick race:** type a query that produces a popover with a "Add new" row and at least one matching option, then simulate a `mousedown` on a popover row without first blurring the input — assert `onCommit` fires with that row's option **once**, not twice, and not with garbage from a blur-triggered commit racing ahead of the click (this is the reason the design uses `onMouseDown` instead of `onClick`).
8. **Add-new / No-matches mutual exclusivity:** query matching zero options and non-empty → "Add new" row shown, "No matches" NOT shown; query matching zero options and empty (cleared) → neither row shown (menu closed or empty per `showAddNew`'s `!!trimmedQuery` guard); options list truly empty (`[]`) and query non-empty with no exact match → "Add new" shown, never "No matches" simultaneously.
9. **Menu repositions on scroll/resize while open:** mock `getBoundingClientRect` to return two different rects across two renders, fire a `scroll` event on `window` while the menu is open, assert the menu's `top`/`left` style updates to the new rect-derived values.
10. **Status pill styling passthrough:** render with `inputStyle` containing a `background`/`color` derived from a status color — assert the rendered `<input>` actually has that computed style, proving color styling is purely prop-driven with no special-cased status logic inside the component.

### `src/lib/csv.test.ts` (Vitest)

1. **Header row exact match:** first row of the generated CSV is exactly `Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies` — no `Sub-category` column anywhere.
2. **Escaping — comma:** a task named `"Foo, Bar"` renders as `"Foo, Bar"` (quoted) in its row.
3. **Escaping — embedded quote:** a task named `Say "hi"` renders as `"Say ""hi"""` (quotes doubled, whole field quoted).
4. **Escaping — newline:** a task with `\n` in its name (if ever possible) is quoted and the literal newline is preserved inside the quotes, not stripped.
5. **Plain field, no escaping:** a task named `Simple Task` renders unquoted.
6. **Dependencies as names, semicolon-joined:** task `C` depends on tasks `A` (name "Do A") and `B` (name "Do B") → `Dependencies` cell reads `Do A; Do B`.
7. **Dangling dependency id:** a task depends on an id not present in the task list → that entry falls back to the raw id string in the joined list, no throw.
8. **Est. End Date sourced from `computeBaseSchedules`:** construct two dependent tasks, assert the CSV's `Est. End Date` for the downstream task reflects the dependency-shifted date, not its raw `startDate`.
9. **Filename slug:** project name `"My Cool Project!!"` produces a download filename of `my-cool-project-tasks.csv` (lowercase, non-alphanumeric runs collapsed to single hyphens).
10. **Milestone name lookup:** a task's `Milestone` column shows the milestone's `name`, not its `id`; a task with `milestoneId: null` renders an empty string for that column, no crash.

### Delete-project backup fallback (add to an existing state/reducer test file, or a new `src/lib/projectDelete.test.ts`)

1. **Spreadsheet configured + connected + push succeeds:** `pushToSheet` mock resolves → project is deleted, `exportTasksCsv` is NOT called.
2. **Spreadsheet configured + connected + push throws:** `pushToSheet` mock rejects → `exportTasksCsv` IS called as fallback, and the project is still deleted afterward (failure never blocks deletion).
3. **No spreadsheet configured (connected or not):** `exportTasksCsv` called directly, `pushToSheet` never invoked, project deleted.
4. **Confirm declined:** `window.confirm` mocked to return `false` → neither backup function is called, project is not deleted.
5. **Last remaining project:** attempting delete on the sole project in `state.projects` — existing `deleteProject` reducer guard still applies (no project removed), regardless of which backup path ran.

## Acceptance criteria

- [ ] `AutocompleteCell` exists in `src/components/` and is used for Category, Status, and Assignee cells in `TaskRow.tsx` — no native `<select>` remains for any of the three.
- [ ] Autocomplete filtering is substring/case-insensitive, capped at 8 results; ArrowUp/Down navigation is bounded with no wraparound; Enter commits the typed query; Escape reverts to the original value; blur always commits (no click-away cancel except Escape); mouse selection uses `onMouseDown` and never races a blur-triggered commit.
- [ ] "Add new" row and "No matches" row are mutually exclusive and match the design's exact conditions.
- [ ] Popover menu uses `position: fixed`, computed from `getBoundingClientRect()`, and repositions on scroll/resize.
- [ ] Status cell renders as a colored pill purely via style props passed into `AutocompleteCell` — no separate pill component.
- [ ] Freeform "add new" commits for Category/Status/Assignee land in `customCategories`/`customStatuses`/`customAssignees` via the existing `ADD_CUSTOM_VALUE` action — no new reducer actions added.
- [ ] Category and Assignee base option lists are empty arrays everywhere (`TaskRow.tsx`, `Toolbar.tsx`, `App.tsx` `initializeState()`) — only custom-value arrays supply options.
- [ ] Status list is exactly `['Not Started', 'In Progress', 'Blocked', 'Done']` — "On Hold" removed from `statusColors.ts`, `Toolbar.tsx`, and `TaskRow.tsx` (superseded by AutocompleteCell).
- [ ] `subCategory` does not exist anywhere in `Task`, the reducer, or the CSV export.
- [ ] No seeded/demo task, milestone, category, or assignee data appears on a fresh (cleared-localStorage) load.
- [ ] A CSV download icon appears in the top chrome bar between the Sync icon and the Settings gear, always visible regardless of sync/connection state, titled "Download tasks as CSV".
- [ ] `exportTasksCsv` produces headers `Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies` (no Sub-category), one row per task, dependencies as semicolon-joined names, correct CSV escaping, and downloads via a Blob-backed `<a download>` named `{project-slug}-tasks.csv`.
- [ ] Settings overlay has a General/Projects tab split; opening Settings always starts on General.
- [ ] Settings → Projects tab lists every project with a color dot, name, sync-status label, and a delete button.
- [ ] Deleting a project backs up first (sheet if connected+configured, else CSV; sheet failures fall back to CSV) and only then deletes, reusing the existing `deleteProject`/`DELETE_PROJECT` last-project guard.
- [ ] The stray "Google OAuth Client ID" text input is gone from the Settings General tab's disconnected state.
- [ ] `npm run test` runs green including the new `AutocompleteCell.test.tsx`, `csv.test.ts`, and delete-project-backup suites, alongside the existing `scheduling.test.ts`/`sync.test.ts`.

---

## Risks / open judgment calls

All four judgment calls below were reviewed with the user and resolved — kept here as a decision log, not open questions.

1. **RESOLVED: Status accepts freeform "add new" values, exactly like Category/Assignee.** The only difference is Status's base option list is seeded with the 4 fixed built-ins (`Not Started`, `In Progress`, `Blocked`, `Done`), while Category/Assignee start with empty base lists. All three fields otherwise use the identical `AutocompleteCell` add-new mechanism, `customStatuses`/`customCategories`/`customAssignees` arrays, and `ADD_CUSTOM_VALUE` action — no special-casing for Status. A custom status still renders with the default fallback pill color since `STATUS_COLORS` only maps the 4 built-ins.
2. **RESOLVED: Projects tab sync-status label includes last-sync time when available.** Derive from `project.spreadsheetId` and `lastSyncedAt` (`src/lib/types.ts:35` on `Project`, also tracked at `src/lib/state.ts:18`): no `spreadsheetId` → "No spreadsheet configured"; `spreadsheetId` set but `lastSyncedAt` is null → "Synced to spreadsheet" (no timestamp, never actually pushed yet); `spreadsheetId` set and `lastSyncedAt` present → "Synced to spreadsheet — last synced {formatted lastSyncedAt}" (reuse whatever date-formatting helper the General tab's existing "last backup" display already uses, if one exists, for consistency).
3. **RESOLVED (non-issue): Non-active project's data source for backup-then-delete.** `loadPersistedApp()` (`src/lib/state.ts:160`) loads the FULL `savedProjects` map from `localStorage` on app start, not just the active project — so every project's task/milestone data is already in memory as soon as the app loads, regardless of whether it's been switched into this session. Task 21's `savedProjects[id]` lookup is safe as originally planned; no fallback-to-raw-persisted-blob logic needed.
4. **RESOLVED: Silent no-op on last-project delete attempt stays as-is.** The existing `deleteProject` (`src/lib/state.ts:295-330`) silently returns `state` unchanged if it's the last project. Confirmed: keep this behavior, no new toast/message.
