# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ground Rules

- Plans go in `plans/*.md`, not `.claude/<feature>/`.
- *ALWAYS* update relevant docs when changes are made — independent of whether the user explicitly requests it.
- When something is NOT working as expected, *MUST* add a test to reveal the bug and then fix and re-test.
- Do *NOT* create any document unless asked — **except** module reference docs (see [Reference Docs](reference-docs) below).

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck (`tsc -b`) then production build (`vite build`)
- `npm run lint` — oxlint
- `npm run test` — run all tests once (vitest run)
- `npx vitest run src/lib/sync.test.ts` — run a single test file
- `npx vitest` — watch mode

## Architecture

Local-first, multi-project React 19 + TypeScript + Vite task/milestone planning app ("Planning"). Gantt-style timeline with dependency scheduling, no backend — persistence is localStorage plus optional Google Drive CSV sync.

**State**: single `useReducer` in `App.tsx` (`appReducer`), no Redux/other state libs.
- `src/lib/state.ts` — `AppState` interface (all data + UI state, multi-project aware) and pure action-helper functions (`addTask`, `moveTaskToPosition`, `updateProject`, `toggleSort`, etc.) — this is where state-mutating logic belongs.
- `src/lib/reducer.ts` — thin `appReducer(state, action)` dispatch table that calls the `state.ts` helpers.
- `App.tsx`'s `useAppDispatch` wraps the base dispatch to intercept async actions (`REQUEST_GOOGLE_TOKEN`, `REVOKE_GOOGLE_TOKEN`, `SYNC_RESOLVE_CONFLICTS`) that need to await a Drive call before/after dispatching — plain sync actions pass through untouched.
- New features that mutate state: add a helper in `state.ts`, then a case in `reducer.ts` — don't put logic directly in the reducer or in components.

**Multi-project model**: `AppState.tasks`/`.milestones`/etc. hold only the *active* project's data; `savedProjects: { [projectId]: ProjectState }` holds in-memory snapshots of inactive projects. `switchProject()` snapshots the current project into `savedProjects` (via `snapshotProjectState`, keyed by `PROJECT_STATE_KEYS`) before loading the target project's saved state (or `emptyProjectState()`). `PERSIST_STATE_KEYS` (a subset of `PROJECT_STATE_KEYS`) controls what's written to localStorage via `snapshotForPersist`/`savePersistedApp`/`loadPersistedApp` under key `pma_app_state_v1`.

**Domain model** (`src/lib/types.ts`): `Task`, `Milestone`, `Project`, `Comment`, `SyncConflict`. Key invariants:
- `Task.order` is a fractional/gap-based sort index within a sibling group (see `src/lib/order.ts`'s `computeOrderBetween`/`siblingGroupKey`) — only the moved task's `order` is ever written; neighbors are untouched.
- Sibling groups: tasks with a `parentId` group by `parentId` alone; top-level tasks (`parentId === null`) group by `milestoneId`, with orphaned/non-live `milestoneId`s collapsing into a shared `__unassigned__` bucket (`src/lib/rows.ts`, `computeRowMap`).
- `Task.dependencies` (array of task ids) drives scheduling — see below.

**Scheduling** (`src/lib/scheduling.ts`): `computeBaseSchedules` does a memoized DFS over each task's `dependencies` to derive `{start, end}` working-day dates from `startDate` + `estimate`, honoring dependency chains and cycle-guarding via a visiting `stack`. `computeDisplaySchedules` then rolls child-task date ranges up to parent tasks (a parent's displayed span is the min/max of its children's). `computeCriticalSet`/`computeProgressMap` derive the critical path and rollup progress %. `src/lib/dates.ts` has the working-day arithmetic primitives (`addWorkingDays`, `nextWorkingDay`, etc.) these depend on.

**Selectors** (`src/lib/selectors.ts`, `src/lib/rows.ts`): `computeDerivedData`/`computeRowMap` derive the visible, filtered, sorted, indented row list (interleaving milestones/tasks/subtasks) from raw `AppState` + computed schedules — components should read through these rather than re-deriving from raw `tasks`/`milestones`.

**Sync** (`src/lib/sync.ts`, `src/lib/drive.ts`): `src/lib/drive.ts` wraps `@open-webapp/drive-sync`; the `drive` singleton's `folderPath: ['OpenWebApp', 'Planning']` is load-bearing and silent-failure-prone — a wrong value doesn't error, it just creates a fresh empty Drive folder and makes existing backups appear to vanish (see the comment in that file and `drive.test.ts`, which pins the array exactly). Each `Project` stores a `lastSyncedSnapshot` (JSON `{tasks, milestones}` as of last sync) used for three-way merge:
  - `diffAgainstSnapshot` computes a `ChangeSet` (added/removed/modified-with-field-diffs) for browser state and Drive state independently, both against the shared snapshot.
  - `threeWayMerge` reconciles the two changesets field-by-field: converged edits (same new value both sides) merge silently; divergent edits, and edit-vs-delete conflicts, produce `SyncConflict` entries (with a `__deleted` pseudo-field for the delete case) surfaced via `SyncConflictOverlay` for the user to resolve (`applyResolutions`).
  - `syncNow`/`resolveSyncConflicts` are the entry points called from `App.tsx`; Drive content is read/written as CSV via `src/lib/csv.ts` (`parseTasksCsvString`/`buildTasksCsvString`).

**Views/components**: `src/views/` (`TasksView`, `MilestonesView`, `TimelineView`) are the three `activeView` modes rendered by `App.tsx`. `src/overlays/` holds modal/dialog UI (task details, deps picker, settings, sync conflicts, sync toast) — all overlays take `state`/`dispatch` directly rather than local state. `src/components/` holds shared building blocks (`AppShell`, `Toolbar`, `AutocompleteCell`, `Collapsible`, `ProjectSwitcher`).

**Tests**: vitest + jsdom, one `*.test.ts`/`*.test.tsx` colocated per module (`src/lib/*.test.ts`, plus some in `src/__tests__/`). `drive.test.ts` uses mocked Drive calls — inspect `@open-webapp/drive-sync`'s actual types before changing its usage, don't guess method names.

For the full original task breakdown and data-model rationale, see `plans/projects-app-v1.md`; sync design specifically is in `plans/projects-app-sync.md` and `plans/drive-csv-sync.md`.

### Reference Docs

Maintains agent-optimized reference docs in the module root — canonical source of truth for current behavior and design.

**Files (in `{name}`):**

| File | Required | Purpose |
|------|----------|---------|
| `product-behavior.md` | Always | User-visible behavior, edge cases, keyboard interactions, URL state |
| `design.md` | Always | Directory structure, API contract, component tree, state management, data model, data flows, design patterns |
| `schema-spec.md` | When module has a data schema | Data schema format — field reference, examples, validation rules |

**Rules:**

- **Current state only.** Describe module *as it exists right now*. No history, rationale, or planned features.
- **Token-optimized.** Terse, dense, structured for agent parsing. Bullet lists, tables, compact type definitions. No narrative prose.
- **Auto-update after every change.** When modifying any module, update affected section(s) of its reference docs — regardless of whether the user asks. Do not wait for instruction.
- **Full-file review after major changes.** After MAJOR changes (new features, refactors, schema/API/behavior shifts — not trivial typo/wording fixes), re-read each affected reference doc in full. Verify: no inconsistencies across sections, no stale or contradicted content, accurate to current code, still token-optimized (terse, no redundancy, no drift into narrative). Fix any issues before considering the task done.
- **Auto-create on-demand.** When working on a module that lacks these files, create them. Ask the user for clarifications as needed.
- **No inline maintenance rules.** Files contain pure content. Maintenance rules live here in AGENTS.md only.
- **Minimal cross-references.** One-line pointer to sibling docs at top of each file. No inline section-to-section references.
- **Supersede plans.** If `plans/{module}-*.md` files exist, reference docs are canonical. Plans remain historical artifacts.
