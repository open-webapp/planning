# Projects App v1 — Implementation Plan

Source of truth for behavior: `.design/project/Project Management App.dc.html` (the "spec file", 1408 lines). Line refs below point at it. Auth clone source: `~/work/notesdiary/app/src/lib/googleAuth.ts`.

## Overview

Port the working `.dc.html` prototype into a real React + Vite + TypeScript app: a single-page, multi-project task manager with Dashboard/Tasks/Milestones/Timeline views, hierarchical tasks with dependencies and a working-day scheduling/critical-path engine, task detail + dependency-picker overlays, a Settings panel with Google OAuth + Sheets backup/restore, and 100% client-side persistence to localStorage. Styling uses Tailwind mapped onto the existing Netskope `--ns-*` CSS variables, with Lucide icons for UI chrome. No backend. Full 1:1 feature port, nothing deferred.

## Phase 0 — Scaffold & tokens

1. **Scaffold Vite React-TS project.** `npm create vite@latest . -- --template react-ts` in repo root (careful: repo has `.design/` already — don't overwrite it). Verify `npm run dev` boots blank page. No deps yet.
2. **Install core deps.** `npm i lucide-react` (icons) and `npm i -D tailwindcss postcss autoprefixer vitest @testing-library/react jsdom` (testing-library not required for v1 since no UI tests, but keep vitest + jsdom in case; can skip testing-library if unused). Run `npx tailwindcss init -p`.
3. **Copy design system assets.** Copy `colors_and_type.css`, `styles.css`, and `assets/fonts/*.ttf` (Inter-Regular, Inter-Medium, Inter-SemiBold, Lora-Variable, Lora-Italic-Variable) from `.design/project/_ds/official-brand-design-system-1b62155c-0ec7-49d2-a89a-3ac48a0ccdd5/` into `src/styles/` and `src/assets/fonts/`. Note: this design-system copy has **no icon SVGs** (checked — only a `fonts/` subfolder exists under `assets/`), so skip "copy 241 icons," just use `lucide-react` for all UI chrome icons (search, chevron, close, sort arrows, kebab, checkmark, plus, trash, drag handle for resize). Fix `@font-face` `url()` paths after copy.
4. **Wire global CSS.** Import `colors_and_type.css` and `styles.css` in `src/main.tsx` (or `index.css`) before Tailwind's base layer so `--ns-*` vars are available. Keep the prototype's global resets from `.dc.html` lines 15-22 (body margin/bg, link colors, scrollbar styling) in `src/index.css`.
5. **Configure Tailwind theme to reference CSS vars.** In `tailwind.config.js`, map theme colors to `var(--ns-*)`, e.g. `colors: { deepBlue: 'var(--ns-deep-blue)', netskopeBlue: 'var(--ns-netskope-blue)', orange: 'var(--ns-orange)', danger: 'var(--ns-danger)', success: 'var(--ns-success)', teal: 'var(--ns-teal)', ink: { 50: 'var(--ns-ink-050)', 100: 'var(--ns-ink-100)', 200: 'var(--ns-ink-200)' }, fg: {1:'var(--ns-fg-1)',2:'var(--ns-fg-2)',3:'var(--ns-fg-3)'}, border: 'var(--ns-border)', divider: 'var(--ns-divider)' }` — check `colors_and_type.css` for the exact full variable list and mirror all of them, don't just guess the subset above.
6. **Set up project folder structure.** Create `src/components/`, `src/lib/`, `src/views/`, `src/overlays/`, empty placeholders OK. Depends on task 1.
7. **Vite build sanity check.** Confirm `npm run build` produces a portable `dist/` (no absolute paths, relative asset refs) — set `base: './'` in `vite.config.ts` if deploying to unknown static host. Depends on tasks 1-5.

## Phase 1 — Data model & scheduling engine (pure logic, no UI)

Depends on Phase 0 task 6 only (needs `src/lib/` to exist).

8. **Define TypeScript types.** In `src/lib/types.ts`: `Task` (id, name, milestoneId, parentId, category, subCategory, assignee, status, estimate, startDate, progress, dependencies: string[], comments: Comment[], notes?), `Milestone` (id, name), `Comment` (id, author, ts, text), `Project` (id, name, color, spreadsheetId, lastBackupAt). Source: task shape from seed data at `.dc.html` lines 658-687.
9. **Port date/working-day helpers.** In `src/lib/dates.ts` port verbatim: `addDays`, `diffDays`, `isWeekend`, `nextWorkingDay`, `addWorkingDays`, `formatDate`, `formatDateLong`, `formatTs` from `.dc.html` lines 457-496. Keep `TODAY` as a constant equal to `'2026-07-31'` in the prototype but make it configurable (e.g. default to `new Date().toISOString().slice(0,10)` for the real app — judgment call, see risks).
10. **Port scheduling engine.** In `src/lib/scheduling.ts` port `computeBaseSchedules` (`.dc.html` line 562, recursive with cycle-guard via `stack` Set), `computeDisplaySchedules` (line 587, rolls child date ranges up to parent), `computeProgressMap` (line 606, averages child progress up to parent), `computeCriticalSet` (line 617, walks from the leaf with latest end date backward through the dependency with the latest end date), `isDependentOn` (line 639). Depends on task 9.
11. **Port sibling sort.** In `src/lib/sort.ts` port `sortSiblings` (line 538) — sorts by name/category/status/assignee/start/estimate/end(uses display map)/progress, asc/desc. Depends on task 8, 10 (needs display map shape).
12. **Port row-numbering + filter logic.** In `src/lib/rows.ts`, extract the row-flattening algorithm from `renderVals()` (`.dc.html` lines 1175-1210): walk milestones → top-level tasks (sorted) → children (sorted, only if parent expanded) → assign sequential `rowNumberMap` only to rows that pass filters, build `numberToId` reverse map. This numbering must match filter/search behavior at lines 1165-1173 (status/category/assignee/milestone/search AND-combined). Depends on task 11.
13. **Port uid generator + seed data.** `src/lib/seed.ts`: `uid(prefix)` (line 497) and `seedData()` (lines 652-688) — 3 milestones, 12+ tasks with realistic hierarchy/dependencies, used only for first-run demo state. Depends on task 8.
14. **Unit tests for scheduling module.** See Test Cases section below. Depends on tasks 9, 10, 13.

## Phase 2 — App state & persistence

Depends on Phase 1 (types, seed).

15. **Design the top-level state shape.** In `src/lib/state.ts` (or as a React reducer/context), mirror the prototype's `state` object (`.dc.html` lines 692-718): `activeView`, `activeProjectId`, `projects[]`, `savedProjects{}` (per-project snapshots for inactive projects), `settingsOpen`, `googleClientId`(drop per decision 5 — no UI field, but keep internal if needed for env-sourced value), `googleAccessToken`, `googleUserEmail`, `googleStatus`, `googleBusy`, `expanded{}`, `selectedTaskId`, `commentsOverlayId`, `depsEditorTaskId`, `depsFilterText`, `columnWidths`, `sortKey`, `sortDir`, `filters`, `newCommentText`, `depsDraft{}`, `customStatuses/Assignees/Categories[]`, plus `tasks[]`/`milestones[]` from `seedData()`.
16. **Port PROJECT_STATE_KEYS / PERSIST_STATE_KEYS constants and snapshot fns.** `PROJECT_STATE_KEYS` (line 499, used for in-memory per-project switch snapshots) vs `PERSIST_STATE_KEYS` (line 516, subset actually written to localStorage — excludes `depsDraft`, `selectedTaskId`, `depsEditorTaskId`, `commentsOverlayId`, `newCommentText`). Implement `snapshotProjectState`, `snapshotForPersist`, `emptyProjectState` exactly per lines 501-521. Depends on task 15.
17. **Implement localStorage load/save.** `APP_STORAGE_KEY = 'pma_app_state_v1'`, `loadPersistedApp()`/`savePersistedApp()` (lines 522-531). On mount, restore `projects`, `activeProjectId`, `projectData` map, rehydrate active project's fields (`.dc.html` `componentDidMount`, lines 720-736). Debounce persistence 400ms after any state change (`componentDidUpdate`, lines 737-745) — use a `useEffect` + `setTimeout` cleanup pattern in React. Depends on task 16.
18. **Implement multi-project switching.** `switchProject(id)`: snapshot current project into `savedProjects`, restore target from `savedProjects` or `emptyProjectState()`, reset `activeView` to `'dashboard'`, close project menu (line 854-862). `createProject(name)` (line 863-876), `promptNewProject()` via `window.prompt` (line 877-881), `renameProject`, `deleteProject` (refuses to delete the last project, line 883-898). Depends on task 17.
19. **Implement CRUD action set as reducer actions / hooks.** Port 1:1 from `.dc.html` lines 899-1074: `toggleExpand`, `indentTask`/`outdentTask` (Tab/Shift+Tab handler `onNameKeyDown` at line 900 — indent only works if previous same-milestone sibling exists and task has no parent already; outdent re-splices task after its parent's last child), `selectTask`/`closeDetail`, `openCommentsOverlay`/`closeCommentsOverlay`, `openDepsEditor`/`closeDepsEditor`, `toggleDependency`/`addDependency`/`removeDependency`, `toggleSort`, `startColumnResize` (mousemove/mouseup drag, min width 50px, line 959-973), `setFilter`, `promptAndAdd`/`handleValueSelect` (the `+ Add new value…` pattern for status/assignee/category dropdowns, lines 1003-1013), `updateTask`/`updateMilestone`, `addComment`, `addTask` (inserts after selected task if one is selected, else appends; inherits milestone/parent/category/assignee/startDate from the "anchor" selected task, line 1029), `moveTaskToMilestone`, `addSubtask`, `deleteTask` (cascades to direct children only, strips dangling dependency refs, line 1066). Depends on task 18.
20. **Implement row/gantt/dashboard derived-data selector.** Port the big `renderVals()` computed-properties block (lines 1137-1403) as a `useMemo`'d selector: gantt meta (minDate/maxDate padding ±3 days, dayWidth 24px, week-tick generation), stat cards (Total Items, Total Estimate in days over top-level tasks only, Completed %, In Progress count, Overdue count — status≠Done AND display-end < TODAY), status breakdown bars, milestone aggregates (upcomingMilestones sorted by end date where prog<100, milestoneCards with per-status counts), activity feed (all comments across all tasks, sorted newest-first, top 8). Depends on tasks 10, 12, 19.

## Phase 3 — Shell & navigation

Depends on Phase 2 task 20 (needs derived state to render against), Phase 0.

21. **Build AppShell layout component.** Top bar: Netskope wordmark + project-switcher dropdown (`.dc.html` lines 27-52 — click outside closes via a page-level click handler like `closeProjectMenu` at line 24), Dashboard/Tasks/Timeline nav tabs (line 53-66, active tab gets bottom border in `--ns-netskope-blue`), Settings gear icon (line 68-70). Note: Milestones nav item exists in state/derived data (`goMilestones`, `milestonesNavStyle`, `activeViewIsMilestones`) but is NOT rendered as a top-nav button in the markup (only Dashboard/Tasks/Timeline appear at lines 54-65) — Milestones is reached only via "select" links from Dashboard/Milestone cards. Decide whether to add a nav tab for it or preserve prototype's indirect-only access (see Risks).
22. **Build project-switcher dropdown.** List of projects with checkmark on active one, "New Project" action at bottom (lines 36-51). Depends on task 21.
23. **Build secondary toolbar.** Search input + Status/Category/Assignee/Milestone filter selects (only shown on Tasks/Timeline views, `showFilters`) + "New Task" button (hidden on Dashboard/Timeline, `showAddTaskButton`) (lines 72-107). Depends on task 21, task 19 (`onAddTask`, `setFilter`).

## Phase 4 — Views

Each view depends on Phase 3 shell + Phase 2 selectors.

24. **Dashboard view.** Stat card grid (5 cards), status-breakdown bars, upcoming-milestones list (click routes to Tasks view filtered by that milestone), recent-activity feed (click opens comments overlay) — lines 112-166.
25. **Tasks view — table shell.** Grid-based table using `columnWidths`/`COLUMN_ORDER` (`number, name, category, status, assignee, start, estimate, end, deps, progress, actions`), sortable header click-to-toggle asc/desc with arrow indicator, per-column resize handles (mousedown drag) — lines 169-183, 1256-1267, 959-973.
26. **Tasks view — milestone group rows + task rows.** Milestone header row (editable inline name), task rows with: row number, expand/collapse chevron (only if has children), critical-path orange dot, editable name input with Tab/Shift-Tab indent/outdent (`data-task-id` + `onNameKeyDown`), Details button (badge shows comment count, opens comments overlay), category/status/assignee dropdowns (inline, with "+ Add new value…" prompt flow), start-date input, estimate number input, computed end-date label (read-only), dependencies cell (click opens deps picker, shows numbers not names), progress (editable % for leaf tasks, read-only rollup % for parent tasks), delete button — lines 184-241, `makeRow()` lines 1076-1135.
27. **Milestones view.** Card grid, one card per milestone: name, date range + item count, progress bar, per-status colored count chips; click routes to Tasks view filtered to that milestone — lines 246-268.
28. **Timeline (Gantt) view.** Left fixed-width (260px) name column mirroring Tasks row hierarchy (milestone header rows + indented task names, no other columns), right scrollable chart area with week-tick header and per-row bars (bar position/width from `diffDays`/`dayWidth=24px`, critical-path bars get orange outline via `box-shadow`) — lines 270-308, gantt math lines 1147-1163, 1080-1081, 1132-1133.

## Phase 5 — Overlays

Depend on Phase 2 (state), can build in parallel with Phase 4.

29. **Task details ("comments") overlay.** Backdrop + centered panel (480px): task name header, Milestone select (with "+ Add new" → prompt → creates milestone + reassigns task), Notes textarea (freeform, autosave onChange), Updates feed (existing comments, newest first, empty state "No updates yet."), new-comment textarea + Post button — lines 313-357. Depends on task 19 (`addComment`, `updateTask` notes patch, `moveTaskToMilestone`).
30. **Dependency picker overlay.** Backdrop + centered panel (420px): task name header, filter-text input (matches by name substring or row number), checkbox list of all other tasks (checked = current dependency) sorted by row number, click toggles dependency, empty state "No matching tasks." — lines 359-390. Depends on task 19 (`toggleDependency`), task 12 (row numbers for display/filter/sort).
31. **Settings overlay.** Backdrop + centered panel (460px): "Data storage" blurb, Google Account section (Connect button when disconnected — NO client-ID input field per decision 5/6, since client ID comes from env; Connected state shows green dot + email-or-"Connected" + Disconnect link), Spreadsheet Backup section (spreadsheet-ID input, Back Up Now / Load From Backup buttons, last-backup timestamp, status text) — port structure from lines 392-438 but drop the `clientId` input (lines 409-410) and its handlers. Depends on task 32 (auth) for connect/disconnect wiring.

## Phase 6 — Google OAuth & Sheets backup

Can start in parallel with Phase 4/5; final wiring depends on Phase 5 task 31 and Phase 2 task 19 (project field updates).

32. **Clone googleAuth.ts.** Copy `~/work/notesdiary/app/src/lib/googleAuth.ts` to `src/lib/googleAuth.ts` near-verbatim (token caching in localStorage under a new key e.g. `projects_app_oauth_token`, `TOKEN_EXPIRY_BUFFER_MS = 5*60*1000`, `getAccessToken`/`requestAccessToken`/`revokeToken`/`getAuthStatus`, `google.accounts.oauth2.initTokenClient`). Change: scope must be `'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email'` (not `drive.file`) since backup targets Sheets. Client ID from `import.meta.env.VITE_GOOGLE_CLIENT_ID` — already the notesdiary pattern, keep as-is.
33. **Add `.env.example`.** Document `VITE_GOOGLE_CLIENT_ID=` at repo root. Add `.env` to `.gitignore` if not already covered by Vite's default ignore.
34. **Load the Google Identity Services script.** Add `<script src="https://accounts.google.com/gsi/client" async defer>` to `index.html` (mirrors `.dc.html` line 14). No task dependency, do alongside task 1.
35. **Wire Settings connect/disconnect.** Settings "Connect" button calls `requestAccessToken()`; on success, store token + fetch `https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer <token>` to get email (`fetchGoogleEmail`, line 775-778), store in state. Disconnect calls `revokeToken()` + clears local `googleUserEmail`/`googleAccessToken` state (line 774). Depends on tasks 32, 15 (state fields), Phase 5 task 31 (UI).
36. **Implement `ensureSheetTabs`.** Port line 779-793: GET spreadsheet metadata (`?fields=sheets.properties.title`), if 'Tasks' or 'Milestones' tabs missing, POST `:batchUpdate` with `addSheet` requests. Depends on task 32.
37. **Implement `backupToSheet`.** Port lines 794-816: build header+row arrays for Tasks (`id,name,milestoneId,parentId,category,subCategory,assignee,status,estimate,startDate,progress,dependencies(csv),comments(JSON string),notes`) and Milestones (`id,name`), call `ensureSheetTabs` then POST `values:batchUpdate` with `valueInputOption: RAW` to both ranges (`Tasks!A1`, `Milestones!A1`), update `lastBackupAt`/status text on success/failure. Depends on task 36, task 15 (project field update), task 19 (task/milestone read).
38. **Implement `restoreFromSheet`.** Port lines 817-850: confirm dialog, parallel GET both value ranges, parse header row into named objects, coerce `estimate`/`progress` to int, split `dependencies` CSV, JSON.parse `comments` (swallow parse errors → `[]`), replace `tasks`/`milestones` state wholesale, reset `expanded`/`selectedTaskId`. Depends on task 32.
39. **Wire Settings backup buttons + status line.** "Back Up Now" → `backupToSheet`, "Load From Backup" → `restoreFromSheet`, disable both + show busy text while `googleBusy`, show `lastBackupLabel` ("Not backed up yet." fallback) and inline status text when present. Depends on tasks 37, 38, Phase 5 task 31.

## Phase 7 — Polish & wiring

40. **Wire all view components into AppShell routing** by `activeView` (dashboard/tasks/milestones/timeline) — single source of truth in state, no react-router needed (matches prototype's simple `setView`). Depends on Phase 4 all views done.
41. **Cross-check filter/search/sort interplay end-to-end** — status/category/assignee/milestone dropdown filters AND free-text search all AND-combine (line 1165-1173); row numbers used in dependency display and picker must reflect only currently-*visible* (filtered+expanded) rows, matching the prototype exactly (`rowNumberMap` only assigned to matching rows, line 1182-1183). Depends on tasks 12, 26, 30.
42. **Manual smoke pass against the prototype.** Open `.design/project/Project Management App.dc.html` in a browser (or via `support.js` runtime) side by side with the new app and click through: create project, add task, indent/outdent, add dependency, mark done, check critical path dot moves, add milestone via "+ Add new", post a comment, resize a column, backup/restore (can stub with a test spreadsheet). Depends on all prior phases.

## Phase 8 — Tests

Depends on Phase 1 only (scheduling module is pure and standalone) — can run in parallel with everything else once Phase 1 lands.

43. **Set up Vitest.** `vitest.config.ts` (or config in `vite.config.ts`), add `"test": "vitest run"` script. Depends on Phase 0 task 2.
44. **Write scheduling unit tests.** `src/lib/scheduling.test.ts` — see Test Cases below. Depends on task 43, Phase 1 tasks 9-13.

---

## Test cases (Vitest, `src/lib/scheduling.test.ts`)

1. **Single task, no deps:** task starting on a Monday with estimate=3 working days → `computeBaseSchedules` gives `end = start + 3 working days` (skips no weekend if none in range).
2. **Dependency ordering (finish-to-start):** task B depends on task A; A ends on day X → B's computed start is `nextWorkingDay(X + 1)`, never before A finishes, even if B's own `startDate` field is earlier.
3. **Weekend/working-day skipping:** a task with `startDate` falling on a Saturday gets pushed to the next Monday via `nextWorkingDay`; `addWorkingDays` from a Friday with estimate=1 lands on the following Monday, not Saturday.
4. **Multiple dependencies — latest wins:** task C depends on A and B with different end dates → C's start is driven by whichever dependency ends latest (`candidate > start` comparison in `computeBaseSchedules`).
5. **Parent/child display rollup:** `computeDisplaySchedules` — a parent task's display start/end is the min(start)/max(end) across all its children's *display* schedules (not its own raw dates), verified with a 2-level hierarchy (parent + 2 children with staggered dates).
6. **Progress rollup:** `computeProgressMap` — parent progress is the rounded average of direct children's progress (leaf progress used as-is); test with children at 0/50/100 → parent = 50.
7. **Critical path picks the longest chain:** construct a small DAG with two paths to the same "end" region where one path is longer (later end date) — `computeCriticalSet` must include the leaf with the latest end date and walk backward via the dependency with the latest end date at each step, not an arbitrary/first dependency.
8. **Critical path cycle guard doesn't infinite-loop:** construct a pathological setup where `computeBaseSchedules`' recursive `get()` would recurse into itself (task depends transitively on itself) — assert the function returns rather than stack-overflowing/hanging (uses `stack` Set to short-circuit at line 570-571), and separately that `computeCriticalSet`'s `guard` Set stops the backward walk from looping.
9. **`isDependentOn` transitive check:** A depends on B, B depends on C → `isDependentOn(tasks, 'A', 'C')` is true; `isDependentOn(tasks, 'C', 'A')` is false; self-cycle in data doesn't infinite-loop (`seen` Set guard).
10. **Missing/dangling dependency id:** a task referencing a `dependencies` id not present in `byId` must not throw — `computeBaseSchedules`' `get()` returns `{start: TODAY, end: TODAY}` for unknown ids (line 569).

## Acceptance criteria

- [ ] App loads with seed data on first run (no localStorage) matching `seedData()` — 3 milestones, 12 top-level+sub tasks with the same names/deps.
- [ ] All project state (tasks, milestones, expanded rows, column widths, sort, filters, custom dropdown values) persists across a page reload via localStorage, debounced ~400ms after changes.
- [ ] Multiple projects can be created, renamed, deleted (except the last one), and switched between; each project's Tasks/Milestones/UI state (expanded rows, filters, sort, column widths, custom values) is preserved independently when switching away and back.
- [ ] Dashboard shows: 5 stat cards (Total Items, Total Estimate in days over top-level tasks, Completed %, In Progress count, Overdue count), status breakdown bars, upcoming milestones (sorted by end date, only <100% progress), recent activity feed (newest 8 comments across all tasks).
- [ ] Tasks table: sortable columns (name/category/status/assignee/start/estimate/end/progress) with asc/desc toggle and arrow indicator; resizable columns (drag handle, min 50px) persisted to state.
- [ ] Tasks table: Tab indents a task under the previous same-milestone top-level sibling; Shift+Tab outdents and re-splices it after its former parent's last child; both preserve cursor position in the name field.
- [ ] Tasks table: inline editable name, category, status, assignee, start date, estimate, progress (leaf only — parents show read-only rollup %); status/assignee/category dropdowns support "+ Add new value…" via `window.prompt`.
- [ ] Critical-path tasks show an orange dot in the Tasks table name cell and an orange outline on their Gantt bar.
- [ ] Dependencies: cell shows row numbers (not names) of a task's dependencies; clicking opens a picker overlay with filterable checkbox list; toggling adds/removes the dependency and immediately reflows computed schedules.
- [ ] Deleting a task also deletes its direct children and strips it from any other task's dependency list.
- [ ] Milestones view shows one card per milestone with progress bar, date range, item count, and per-status count chips; clicking a card routes to Tasks view pre-filtered to that milestone.
- [ ] Timeline view shows a Gantt chart: fixed name column + scrollable bar area, week-tick header, bars positioned/sized from computed display schedules, critical-path bars visually distinct.
- [ ] Task details overlay: reassign milestone (including "+ Add new" to create one inline), edit freeform notes, view/post text updates (comments), see comment count badge on the row's Details button.
- [ ] Filters (status/category/assignee/milestone) and free-text search all AND-combine and are reflected consistently across Tasks table row numbering, dependency picker options, and Gantt view.
- [ ] Settings panel: Google connect/disconnect (client ID from `.env`, no client-ID input field in the UI), connected state shows email or "Connected" fallback, spreadsheet-ID input, Back Up Now / Load From Backup buttons with busy/status/last-backup-time feedback.
- [ ] Settings backup round-trips to a real Google Sheet: writes Tasks+Milestones tabs (creating them if absent), restore reads them back and replaces local state, including comments (JSON) and dependencies (CSV) fields surviving the round trip.
- [ ] `npm run build` produces a portable static `dist/` with relative asset paths (works from any static host / `file://`-adjacent serving).
- [ ] `npm run test` runs the Vitest scheduling suite (Test Cases 1-10 above) green.

