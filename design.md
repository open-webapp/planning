# design.md

See `product-behavior.md` for user-visible behavior, `schema-spec.md` for data shapes and CSV format.

## Directory structure

```
src/
  App.tsx              # useReducer wiring, async-action dispatch wrapper, mount effects
  lib/
    state.ts            # AppState/ProjectState types + all pure state-helper functions
    reducer.ts           # appReducer: action.type -> state.ts helper call
    types.ts             # Task/Milestone/Project/Comment/SyncConflict
    scheduling.ts         # dependency-based date scheduling (base + display + critical path)
    dates.ts              # working-day date arithmetic, TODAY constant, formatters
    order.ts              # fractional order index + sibling-group backfill
    rows.ts               # computeRowMap: filtered/sorted/indented visible row list
    selectors.ts           # computeDerivedData: gantt metadata, stat cards, milestone aggregates
    sort.ts                # sortSiblings: per-column comparator for a sibling group
    csv.ts                  # CSV build/parse/export (Drive sync + manual download)
    drive.ts                 # @open-webapp/drive-sync facade + connectDriveSync
    sync.ts                   # diff/merge/conflict engine + syncNow/resolveSyncConflicts
    syncErrors.ts              # typed drive-sync error -> friendly message/action link
    seed.ts                    # uid() + seedData() (currently returns empty state)
    statusColors.ts             # status string -> color
  components/
    AppShell.tsx          # top chrome bar, nav pills, project switcher trigger
    Toolbar.tsx             # search/filters/add-task row, shown per activeView
    ProjectSwitcher.tsx      # project list dropdown
    AutocompleteCell.tsx      # inline editable cell with dropdown suggestions
    Collapsible.tsx            # generic disclosure section
  views/
    TasksView.tsx           # table + stat strip + breakdown, drag/keyboard reorder
    TaskRow.tsx                # one task row, all inline-editable cells
    MilestonesView.tsx          # milestone card grid
    TimelineView.tsx             # read-only Gantt
  overlays/
    TaskDetailsOverlay.tsx      # notes + comments modal
    DepsPickerOverlay.tsx        # dependency checklist modal
    SettingsOverlay.tsx           # General/Projects tabs, Drive connect + sync + delete
    SyncConflictOverlay.tsx        # per-field or bulk conflict resolution modal
    SyncToast.tsx                    # bottom-right sync status toast
```

## Component tree

```
App
 └─ AppShell (top bar: ProjectSwitcher, nav pills, sync icon, settings icon)
     ├─ toolbar: Toolbar
     └─ children:
         ├─ TasksView | MilestonesView | TimelineView   (by state.activeView)
         ├─ TaskDetailsOverlay
         ├─ DepsPickerOverlay
         ├─ SyncConflictOverlay
         ├─ SettingsOverlay
         └─ SyncToast
```
All overlays are always mounted and self-gate on `state` (`if (!state.xId) return null`) rather than being conditionally rendered by `App.tsx`.

## State management

Single `useReducer(appReducer, ...)` in `App.tsx`. `appReducer` is a thin `switch (action.type)` dispatch table over pure functions in `state.ts` — see `CLAUDE.md` for the state/reducer split and the multi-project `savedProjects` model. `App.tsx`'s `useAppDispatch` wraps the base dispatch to:
- Accept a full `AppState` object (no `type` field) as a shortcut for `{ type: '__SET_STATE', newState }` — used by `ProjectSwitcher` (`switchProject`/`promptNewProject` return a full new state).
- Intercept `REQUEST_GOOGLE_TOKEN`/`REVOKE_GOOGLE_TOKEN`/`SYNC_RESOLVE_CONFLICTS` to run an async Drive call before dispatching the resulting plain action(s); all other actions pass straight to `baseDispatch`.

Every dispatched action is typed only as `{ type: string; [key: string]: any }` — no action-creator/type-union layer; new actions are added by adding a `case` in `reducer.ts` plus (usually) a helper in `state.ts`.

## Data model

See `schema-spec.md` for the full field reference. Summary: `AppState.tasks`/`.milestones` hold the *active* project only; `savedProjects[projectId]` holds `ProjectState` snapshots for every other project (swapped in/out by `switchProject`). `PERSIST_STATE_KEYS` (⊂ `PROJECT_STATE_KEYS`) controls what's written to `localStorage['pma_app_state_v1']`; Google auth is never persisted there (it lives in drive-sync's own IndexedDB, hydrated at boot into `authByProject`).

## Data flows

**Task edit → persist**: cell `onChange`/`onBlur` dispatches `UPDATE_TASK` (or a tree op like `INDENT_TASK`/`MOVE_TASK_TO_POSITION`) → `appReducer` calls the matching `state.ts` helper → new `AppState` → `App.tsx`'s `useEffect([state])` calls `savePersistedApp` (writes `snapshotForPersist(state)` to `localStorage`, debounce-free, on every state change).

**Project switch**: `ProjectSwitcher` calls `switchProject(state, projectId)` directly (not through the reducer) → snapshots current project into `savedProjects` via `snapshotProjectState`, restores the target's saved/empty `ProjectState`, resets `activeView` to `'tasks'` → dispatched via the `__SET_STATE` shortcut.

**Sync** (`syncNow` in `sync.ts`, called from the AppShell cloud icon or Settings "Sync Now"):
1. Pull the Drive CSV file (`getDriveCsvContent`) → `parseTasksCsvString` → `sheetData` (note: CSV round-trip loses `parentId`/`order`, both hardcoded on parse — see `schema-spec.md`).
2. Diff `browserData` and `sheetData` independently against `activeProject.lastSyncedSnapshot` (`diffAgainstSnapshot`) — the sheet-side diff skips `order`/`parentId` since those are never real sheet edits.
3. `threeWayMerge` reconciles the two changesets: converged field edits merge silently, divergent edits and edit-vs-delete produce `SyncConflict` entries.
4. No conflicts → push `buildTasksCsvString(merged)` to Drive, dispatch `SYNC_SUCCESS` (updates `tasks`/`milestones`/`lastSyncedSnapshot`/`lastSyncedAt`, merges any new status/assignee/category values into the custom dropdown lists).
   Conflicts → dispatch `SYNC_CONFLICTS_DETECTED` (holds `merged` in `syncPendingMerge`, closes Settings, opens `SyncConflictOverlay`).
5. User resolves in the overlay → `SYNC_RESOLVE_CONFLICTS` → `resolveSyncConflicts` applies `applyResolutions(syncPendingMerge, conflicts, choices)` and pushes the result the same way.
6. Every async step re-checks `state.activeProjectId === projectId` (captured at sync start) before writing, to avoid clobbering a project the user has since switched away from.

## Design patterns

- **Dispatch-as-prop**: every view/overlay/component takes `state`/`dispatch` directly; no context provider, no memoized selectors library — components call `.find()`/`.filter()` on `state.tasks`/`state.milestones` inline or read from `derivedData`.
- **Pure state-helper functions**: all state transitions are `(state, ...args) => AppState` functions in `state.ts`, independently unit-testable and reused by both the reducer and non-reducer callers (`ProjectSwitcher`, `deleteProjectWithBackup`).
- **Memoized derived data recomputed from scratch each render**: `computeBaseSchedules`/`computeDisplaySchedules`/`computeProgressMap`/`computeCriticalSet`/`computeDerivedData` all take `state.tasks` etc. as plain arguments and rebuild their internal memo maps every call (no `useMemo` at the `App.tsx` level) — cheap because task counts are small.
- **Fractional/gap ordering with lazy backfill**: sibling `order` values aren't maintained on every mutation; a group is "backfilled" (assigned real fractional orders) only the first time it's touched by a manual reorder/indent/outdent, via `getSiblingGroup`/`isGroupBackfilled`/`backfillGroupOrders` in `order.ts`.
- **Typed-error-class error handling for sync**: `syncErrors.ts` switches on `instanceof` against `@open-webapp/drive-sync`'s exported error classes rather than parsing message strings.
