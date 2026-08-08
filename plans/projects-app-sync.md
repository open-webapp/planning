# Projects App — Bidirectional Sheet Sync — Implementation Plan

Source of truth: this doc + real current source (no `.dc.html` spec for this feature, it's new). Line refs point at current files as of this writing — re-check line numbers before editing if other work has landed first.

## Overview

Replace the one-way "Back Up Now / Load From Backup" pair with a real two-way sync between local browser state and a configured Google Sheet. Add a `CloudSync` icon to the top chrome bar (left of Settings gear) that's only visible when the active project has a `spreadsheetId`. Click triggers pull → diff → (if conflicts) block on a resolution dialog → push. Settings overlay keeps the spreadsheet ID input, renames "Back Up Now" to "Sync Now", drops "Load From Backup" entirely. No auto-sync, no polling, click-triggered only.

Confirmed: `CloudSync` icon exists in the installed `lucide-react` 1.28.0 (`node_modules/lucide-react/dist/esm/icons/cloud-sync.mjs`). Use it directly, no fallback needed.

## Phase 0 — Data model for sync (last-synced snapshot)

This is the load-bearing judgment call for the whole feature — read the Risks section before starting.

1. **Add `lastSyncedSnapshot` to `Project`.** In `src/lib/types.ts` (currently lines 29-35), add `lastSyncedSnapshot: string | null` (JSON-serialized `{ tasks: Task[]; milestones: Milestone[] }` as of the last successful sync) and `lastSyncedAt: string | null`. Keep existing `lastBackupAt` field or repurpose it as `lastSyncedAt` (see Risks — recommend repurposing, not adding a parallel field, to avoid two "when did this last talk to the sheet" fields). Depends on nothing.
2. **Add sync-only state fields to `AppState`.** In `src/lib/state.ts` (interface at lines 5-54): add `syncBusy: boolean` (replaces conditionally reusing `googleBusy` — keep them separate since `googleBusy` covers OAuth connect/disconnect too and we don't want the icon spinning during a plain reconnect), `syncStatus?: string` (drives the toast message/text, e.g. "Synced at 3:45 PM" or an error string), `syncConflicts: SyncConflict[]` (empty when no conflict dialog open), `syncPendingMerge?: { tasks: Task[]; milestones: Milestone[] }` (the fully-merged non-conflicting result, held while the user resolves conflicts, so committing after resolution doesn't need to recompute the diff). Depends on task 3 for the `SyncConflict` type.
3. **Define `SyncConflict` type.** In `src/lib/types.ts`, add:
   ```ts
   export interface SyncConflict {
     taskId: string
     taskName: string // for display, in case task was renamed on both sides — use browser-side name
     field: keyof Task
     browserValue: unknown
     sheetValue: unknown
   }
   ```
   One entry per conflicted field, not per task — a task can appear multiple times if multiple fields conflict. Depends on nothing.
4. **Do NOT add per-field timestamps to `Task`.** Judgment call: don't add a `updatedAt`/`fieldTimestamps` map to `Task` (`src/lib/types.ts` lines 8-22) even though it would make "changed since last sync" trivially precise. Use snapshot-diffing against `lastSyncedSnapshot` instead (see Risks for why, and what's lost by not doing per-field timestamps).

## Phase 1 — Sync engine (pure logic, no UI)

Depends on Phase 0.

5. **Create `src/lib/sync.ts`.** New file. This holds all diff/merge logic, kept separate from `googleAuth.ts` (which stays OAuth-only) and separate from the Sheets I/O (task 9-11), so the merge algorithm is unit-testable without a network mock.
6. **Implement `diffAgainstSnapshot(current, snapshot)`.** Signature: `(current: {tasks: Task[]; milestones: Milestone[]}, snapshot: {tasks: Task[]; milestones: Milestone[]} | null) => ChangeSet`. Returns per-entity-id change info: added ids, removed ids, and for modified entities a field-level diff (compare every own field except `comments`/`notes` merge specially — see task 8). If `snapshot` is `null` (never synced before), treat every current row as "added" — this is the first-sync case. Depends on task 3.
7. **Implement `threeWayMerge(browserChanges, sheetChanges, snapshot)`.** Core of the feature. Inputs: `browserChanges` = diff of live browser state vs `lastSyncedSnapshot`, `sheetChanges` = diff of freshly-pulled sheet data vs the same `lastSyncedSnapshot`. For each task id in the union of both changed sets:
   - Only browser changed → take browser value, no conflict.
   - Only sheet changed → take sheet value, no conflict.
   - Both changed, same resulting value → no conflict (silently converge).
   - Both changed, different resulting value on the same field → emit a `SyncConflict` for that field, do NOT pick a winner yet.
   - Task added only on one side → keep it, no conflict.
   - Task deleted on one side, edited on the other → treat as a conflict too (field `'__deleted'`, values `'deleted'` vs the edited task) — flag in Risks, this is an edge case worth a product call.
   Returns `{ merged: {tasks, milestones}, conflicts: SyncConflict[] }` where `merged` already has all non-conflicting fields applied and conflicting fields left at the **browser** value as a placeholder pending resolution. Depends on task 6.
8. **Special-case `comments` array merging.** `comments` (`Task.comments`, `src/lib/types.ts` line 20) is append-only and id-keyed (`Comment.id`, line 1-6) — union by `id` instead of field-diffing, so a comment posted locally and a comment posted in a manually-edited sheet cell both survive. Never treat `comments` as a conflictable field. Depends on task 7.
9. **Implement `applyResolutions(merged, conflicts, choices)`.** `choices: { [conflictKey: string]: 'sheet' | 'browser' }` keyed by `${taskId}:${field}`. Applies the user's per-conflict pick onto the `merged` tasks/milestones, returns final `{tasks, milestones}` ready to both commit locally and push to the sheet. Depends on task 7.
10. **Unit tests for the merge engine.** `src/lib/sync.test.ts`. See Test Cases section. Depends on tasks 6, 7, 8, 9.

## Phase 2 — Sheets I/O (network)

Can start in parallel with Phase 1; wiring (task 14) depends on both.

11. **Implement `pullFromSheet(spreadsheetId, token)` in `src/lib/googleAuth.ts`.** New export alongside the existing `getAccessToken`/`requestAccessToken`/`revokeToken` (currently lines 79-189). GET `values:batchGet` for `Tasks!A:Z` and `Milestones!A:Z` ranges (same tab names/shape as the old `backupToSheet`/`restoreFromSheet` used — port the header-row parsing convention: `id,name,milestoneId,parentId,category,subCategory,assignee,status,estimate,startDate,progress,dependencies(csv),comments(JSON string),notes` for Tasks, `id,name` for Milestones). Coerce `estimate`/`progress` to `int`, split `dependencies` CSV, `JSON.parse` comments (swallow parse errors → `[]`). Returns `{tasks: Task[], milestones: Milestone[]} | null` (null if the sheet/tabs don't exist yet — first-ever sync from an empty sheet).
12. **Implement `pushToSheet(spreadsheetId, token, tasks, milestones)` in `src/lib/googleAuth.ts`.** Reuse the `ensureSheetTabs` pattern (tab-existence check + `batchUpdate` addSheet if missing) and the header+row build (same column order as task 11), POST `values:batchUpdate` with `valueInputOption: RAW`. This replaces the old one-way `backupToSheet` — same wire format, different caller (called after merge/conflict-resolution, not directly from a button).
13. **Remove one-way restore.** Delete `restoreFromSheet` (or whatever stub/impl currently backs `RESTORE_FROM_SHEET` in `src/lib/googleAuth.ts` / referenced from `src/overlays/SettingsOverlay.tsx` line 63-73). It's superseded by `pullFromSheet` + merge. Depends on task 11.

## Phase 3 — Reducer & action wiring

Depends on Phases 0-2.

14. **Add `syncNow` orchestration function.** In `src/lib/sync.ts` (or a thin wrapper in `googleAuth.ts` — put it in `sync.ts` since it's orchestration, not raw I/O): `async function syncNow(state, dispatch)`:
    - dispatch a "sync started" action (sets `syncBusy: true`)
    - `token = await getAccessToken()`
    - `sheetData = await pullFromSheet(project.spreadsheetId, token)` (or `{tasks: [], milestones: []}` if null)
    - `browserChanges = diffAgainstSnapshot({tasks: state.tasks, milestones: state.milestones}, snapshot)`
    - `sheetChanges = diffAgainstSnapshot(sheetData, snapshot)`
    - `{merged, conflicts} = threeWayMerge(browserChanges, sheetChanges, snapshot)`
    - if `conflicts.length === 0`: `await pushToSheet(...)`, dispatch `SYNC_SUCCESS` with `merged` + new snapshot + timestamp.
    - if `conflicts.length > 0`: dispatch `SYNC_CONFLICTS_DETECTED` with `conflicts` + `syncPendingMerge = merged` — do NOT push yet, do NOT commit locally yet. Overlay (task 18) takes over from here.
    - wrap the whole thing in try/catch → dispatch `SYNC_ERROR` with `error.message` on any throw (token fetch, pull, or push failure).
    Depends on tasks 7, 9, 11, 12.
15. **Add reducer actions in `src/lib/reducer.ts`.** Replace `BACKUP_TO_SHEET`/`RESTORE_FROM_SHEET`/`BACKUP_SUCCESS`/`BACKUP_ERROR`/`RESTORE_SUCCESS`/`RESTORE_ERROR` (current lines 134-138, 146-156) with:
    - `SYNC_STARTED` → `{ ...state, syncBusy: true, syncStatus: undefined, syncConflicts: [] }`
    - `SYNC_CONFLICTS_DETECTED` → `{ ...state, syncBusy: false, syncConflicts: action.conflicts, syncPendingMerge: action.merged }` (busy goes false — the icon stops spinning once the dialog is up; dialog itself is the "busy" state now)
    - `SYNC_RESOLVE_CONFLICTS` → applies `applyResolutions`, then re-enters "pushing" busy state, then on push completion dispatches `SYNC_SUCCESS`. This one is async — model it as a dispatched thunk-like call from the overlay's confirm handler (same pattern the codebase already uses: action creators returning through `dispatch`, see `handleBackupNow` at `SettingsOverlay.tsx` lines 56-61), not a pure reducer case, since it needs another network round-trip (the push). The reducer case itself just clears `syncConflicts`/`syncPendingMerge` and sets `syncBusy: true`; the actual push + `SYNC_SUCCESS`/`SYNC_ERROR` dispatch happens in the calling code.
    - `SYNC_SUCCESS` → `{ ...state, syncBusy: false, syncStatus: message, tasks: action.tasks, milestones: action.milestones, syncConflicts: [], syncPendingMerge: undefined, projects: state.projects.map(p => p.id === action.projectId ? {...p, lastSyncedSnapshot: JSON.stringify({tasks: action.tasks, milestones: action.milestones}), lastSyncedAt: action.timestamp} : p) }`
    - `SYNC_ERROR` → `{ ...state, syncBusy: false, syncStatus: action.error }`
    Depends on task 2 (state fields), task 14.
16. **Add `syncConflicts`/`syncPendingMerge`/`syncBusy`/`syncStatus` to `PROJECT_STATE_KEYS`? No — leave out.** Judgment call: these are transient UI/network state, not per-project data — don't add them to `PROJECT_STATE_KEYS` (`src/lib/state.ts` lines 92-108) or `PERSIST_STATE_KEYS` (lines 111-122). If the user switches projects mid-sync, the in-flight sync should probably just be abandoned/ignored on completion (see Risks). Depends on task 2.

## Phase 4 — UI: chrome icon, spinner, toast

Depends on Phase 3.

17. **Add `CloudSync` icon to `AppShell.tsx`.** Import `CloudSync, Loader2` (or reuse `Loader` from `lucide-react` as already imported in `SettingsOverlay.tsx` line 2) alongside existing `Settings` import (`AppShell.tsx` line 2). Render a button to the immediate left of the Settings button block (currently lines 108-116), same `34px` square + hover style as the Settings button. Conditional: `{activeProject?.spreadsheetId && <button onClick={onSyncClick}>...}`. Icon swaps to a spinning `Loader`/`Loader2` (`animate-spin`, matches the pattern already used at `SettingsOverlay.tsx` line 129/225) when `state.syncBusy` is true, otherwise shows `CloudSync`. Needs a new `onSyncClick` prop threaded through `AppShellProps` (currently lines 6-14) the same way `onSettingsClick` is. Depends on task 15 (action to dispatch), task 5/14 (the `syncNow` call the click handler invokes).
18. **Build `SyncConflictOverlay.tsx`.** New file `src/overlays/SyncConflictOverlay.tsx`, following the `DepsPickerOverlay.tsx` pattern exactly (backdrop div + centered panel, `stopPropagation` on panel click, same width/shadow/rounded classes as `DepsPickerOverlay.tsx` lines 90-105). Visible when `state.syncConflicts.length > 0`. Content: one row per conflict — task name, field name, two selectable options ("Sheet version: <value>" / "Browser version: <value>") as radio-style clickable rows (mirror the checkbox-row pattern at `DepsPickerOverlay.tsx` lines 141-158, but radio semantics: exactly one of the two picked, default unpicked). Footer: "Apply and Sync" button, disabled until every conflict has a choice made — dispatch `SYNC_RESOLVE_CONFLICTS` with the full `choices` map, which triggers `applyResolutions` + push (task 15's async continuation). No backdrop-click-to-dismiss — user must resolve or there needs to be an explicit "Cancel" text link that aborts the sync entirely (clears `syncConflicts`/`syncPendingMerge`, does NOT touch local state, does NOT push) — add this per the "no auto-resolve" requirement, since blocking forever with no way out is bad UX (flagged in Risks, recommend adding Cancel even though not explicitly requested). Depends on task 15.
19. **Wire the conflict overlay into the app root.** Wherever `SettingsOverlay`/`DepsPickerOverlay`/`TaskDetailsOverlay` are currently mounted (likely `src/App.tsx` — check the file), add `<SyncConflictOverlay state={state} dispatch={dispatch} />` alongside them. Depends on task 18.
20. **Build the sync toast.** New small component or inline in `AppShell.tsx`/`App.tsx` — a transient bottom-corner toast, shown when `state.syncStatus` is set and `syncConflicts.length === 0`. Success text: `Synced at ${formatTime(timestamp)}` (use existing time-formatting convention from `formatTs` in `src/lib/dates.ts` line 46-49, or a simpler `toLocaleTimeString` matching the `hour: 'numeric', minute: '2-digit'` style already used at `SettingsOverlay.tsx` lines 207-213). Error text: the raw error message + a "Retry" button that re-invokes `syncNow`. Auto-dismiss success toasts after ~4s (clear `syncStatus`); error toasts stay until retried or manually dismissed (add a close X, matching the `X` icon pattern from `SettingsOverlay.tsx` line 2/106). Depends on task 15.

## Phase 5 — Settings overlay changes

Depends on Phase 3 (shared action).

21. **Rename "Back Up Now" to "Sync Now".** In `src/overlays/SettingsOverlay.tsx`, `handleBackupNow` (lines 56-61) currently dispatches `BACKUP_TO_SHEET` — rename to `handleSyncNow`, call the same `syncNow` orchestration used by the new chrome icon (task 14) so there's exactly one code path, not two. Button label at line 193 "Back Up Now" → "Sync Now". Keep the same button styling/position (lines 188-194).
22. **Remove "Load From Backup" button entirely.** Delete `handleLoadFromBackup` (lines 63-73) and the button block (lines 195-201) in `SettingsOverlay.tsx`. The `flex gap-[10px]` wrapper (line 187) now holds a single full-width "Sync Now" button — adjust `flex-1` styling if a lone button looks stretched-odd, or drop `flex` wrapper and just render one block-level button.
23. **Update "last backup" status line to "last synced".** Lines 204-215 read `activeProject?.lastBackupAt` — switch to `activeProject?.lastSyncedAt` (per task 1's field), fallback text "Not backed up yet." → "Not synced yet."
24. **Confirm spreadsheetId input and Google connect/disconnect UI untouched.** `handleSpreadsheetIdChange` (lines 23-35), `handleConnectGoogle`/`handleDisconnectGoogle` (lines 37-54), and the whole Google Account section (lines 121-169) stay as-is — feature requirement 6 only touches the backup buttons. No task here, just a checkpoint before moving on.

## Phase 6 — Polish & manual verification

25. **Manual smoke test with a real test spreadsheet.** Create a project, set `spreadsheetId`, connect Google, click sync with an empty sheet (first-sync case — task 6's `snapshot === null` path), verify tasks land in the sheet. Edit a task locally, edit a different task's field directly in the sheet, sync again, verify both land with no conflict dialog. Edit the *same* field on the *same* task in both places, sync, verify the conflict dialog appears and both "pick sheet"/"pick browser" paths commit correctly. Depends on all prior phases.
26. **Verify icon visibility toggling live.** Clear `spreadsheetId` in Settings → chrome icon disappears immediately (no reload needed) since it's driven by `activeProject?.spreadsheetId` in the render, not cached. Re-set it → icon reappears. Depends on task 17.

---

## Test cases (Vitest, `src/lib/sync.test.ts`)

1. **No-conflict two-way sync:** browser has task A field changed, sheet has task B field changed (different tasks) → `threeWayMerge` returns both changes applied, zero conflicts.
2. **Sheet-only changes:** browser identical to `lastSyncedSnapshot`, sheet has 2 field edits → merge result equals sheet state, zero conflicts, browser fields not touched.
3. **Browser-only changes:** sheet identical to `lastSyncedSnapshot`, browser has edits → merge result equals browser state, zero conflicts, `pushToSheet` payload matches browser state exactly.
4. **Single-field conflict, pick sheet:** same task+field changed differently on both sides → one `SyncConflict` emitted; `applyResolutions` with `{[key]: 'sheet'}` yields the sheet's value in the final merged task.
5. **Single-field conflict, pick browser:** same setup, `applyResolutions` with `{[key]: 'browser'}` yields the browser's value.
6. **Multiple simultaneous conflicts:** 3 different tasks each with one conflicting field → 3 `SyncConflict` entries, all independently resolvable, `applyResolutions` handles a mixed `choices` map (some 'sheet', some 'browser') correctly per-key.
7. **Sync failure/retry:** mock `pullFromSheet` (or `getAccessToken`) to reject → `syncNow` dispatches `SYNC_ERROR` with the thrown message, `syncBusy` returns to `false`; re-invoking `syncNow` after fixing the mock succeeds and dispatches `SYNC_SUCCESS`.
8. **Icon visibility toggling:** (component-level, or plain assertion on the render condition) `activeProject.spreadsheetId` truthy → icon present in `AppShell` output; set to `null`/`''` → icon absent; Settings gear present in both cases.
9. **Settings overlay button rename/removal:** `SettingsOverlay` renders a single "Sync Now" button, no "Load From Backup" button exists in the output; clicking "Sync Now" dispatches the same action path as the chrome icon's click handler.
10. **Comments merge (from task 8):** a comment added locally and a different comment added via a manual sheet edit on the same task, both present with no conflict, in `id`-based union order.
11. **First-ever sync (`lastSyncedSnapshot === null`):** all current browser tasks treated as "browser-only added," pushed to an empty/tab-less sheet, `ensureSheetTabs`-equivalent creates tabs first.

## Acceptance criteria

- [ ] `CloudSync` icon appears in `AppShell.tsx`'s top chrome bar, positioned left of the Settings gear.
- [ ] Icon is visible only when `activeProject.spreadsheetId` is truthy; Settings gear always visible regardless.
- [ ] Clicking the icon immediately triggers sync — no confirmation dialog.
- [ ] Sync pulls sheet data, diffs against local state and against the last-synced snapshot, pushes local-only changes, pulls sheet-only changes — true two-way, not one-directional overwrite.
- [ ] Any field changed on both sides since last sync is surfaced as a conflict in a dedicated resolution dialog (`SyncConflictOverlay`) — never auto-resolved.
- [ ] Conflict dialog lists every conflicted task/field, lets the user choose "Sheet version" or "Browser version" per item, and only commits (local state + push to sheet) after all conflicts are resolved.
- [ ] Non-conflicting changes apply silently, no per-item prompt.
- [ ] Icon shows a spinner while sync is in flight; no text label, no progress bar.
- [ ] On success, a toast shows only a timestamp ("Synced at 3:45 PM"), no per-field change summary.
- [ ] On failure, a toast shows the error message plus a "Retry" button that re-triggers sync.
- [ ] Settings overlay: "Back Up Now" renamed to "Sync Now", reusing the same handler/action as the chrome icon.
- [ ] Settings overlay: "Load From Backup" button removed entirely.
- [ ] Spreadsheet ID input and Google connect/disconnect UI in Settings are unchanged.
- [ ] No periodic/background auto-sync or polling exists anywhere — sync only runs from an explicit click.
- [ ] `npm run test` runs the new `sync.test.ts` suite (Test Cases 1-11) green, alongside the existing `scheduling.test.ts` suite.

---

## Risks / open judgment calls

1. **"Changed since last sync" needs a stored baseline — how to store it.** Recommended (and what this plan builds): store a full JSON snapshot of `{tasks, milestones}` as of the last successful sync on the `Project` record (`lastSyncedSnapshot`, task 1). Diff current-vs-snapshot on both sides (browser and freshly-pulled sheet), then diff those two diffs against each other. Alternative considered and rejected: per-field `updatedAt` timestamps on every `Task` field. Rejected because (a) it requires threading a timestamp-touch into every single `updateTask`/`addComment`/etc. call site in `src/lib/state.ts` (roughly a dozen functions, lines 621-897), a much bigger surface than one new field on `Project`, and (b) it still doesn't solve the "what did the sheet look like at last sync" problem by itself — you'd need a sheet-side timestamp too, which means writing timestamp metadata into spreadsheet cells, complicating the wire format. Snapshot-diffing is simpler and self-contained but costs one extra field written to `localStorage` per project (the full task list, potentially large for big projects) — acceptable tradeoff for a task-management app of this scale.
2. **Snapshot storage location and size.** `lastSyncedSnapshot` is proposed as a JSON string on `Project` (task 1), which lives in `state.projects` and is included in `PERSIST_STATE_KEYS`'s implicit "always persisted" set (`snapshotForPersist`, `src/lib/state.ts` lines 135-148, `snap.projects = state.projects` at line 141) — so it rides along in every localStorage write automatically, no new persistence plumbing needed. Watch localStorage's ~5-10MB ceiling if a project grows very large; not a concern at seed-data scale, flag if it becomes one.
3. **Task deleted on one side, edited on the other.** Task 7 treats this as a conflict (a `'__deleted'` pseudo-field). This wasn't in the original 10 requirements — recommend keeping it as a conflict rather than silently picking a side, since silently un-deleting or silently deleting an edited task are both surprising. No dedicated test case was requested for it beyond what's implied by "multiple simultaneous conflicts"; add one if this edge case matters in practice.
4. **No explicit "Cancel" was specified for the conflict dialog, but one is needed.** The requirements say "on conflict, do not auto-resolve... only after the user resolves all conflicts does the sync commit" — that's a description of the happy path, not a statement that the dialog must be inescapable. Task 18 adds a Cancel/dismiss link that aborts the sync (no local mutation, no push) so a user isn't trapped if they don't want to resolve conflicts right now. Flagging in case the intent was truly modal-with-no-escape.
5. **Switching projects mid-sync.** Not addressed in the 10 requirements. Recommended default (task 16): if the user switches the active project while a sync is in flight, let the in-flight promise finish but discard its result if `state.activeProjectId` no longer matches the project it was syncing (compare a captured `projectId` at sync-start time to current state when the async work resolves) — avoids writing project A's synced tasks into project B's slot after a switch. Needs a small guard added to task 14/15's success/error dispatch, not called out as its own task above — fold into task 15 during implementation.
6. **`googleBusy` vs `syncBusy` overlap.** Kept deliberately separate (task 2) since `REQUEST_GOOGLE_TOKEN`/connect-disconnect and sync are logically different operations that could in theory overlap (token expired mid-sync triggers a re-auth prompt inside `getAccessToken`, task 14 calls it). If `getAccessToken()` internally re-prompts, the chrome icon's spinner (driven by `syncBusy`) stays on for the whole duration including the OAuth popup — acceptable, avoids a confusing "two spinners" state, but worth knowing that a sync click can trigger a Google consent popup with no distinct visual cue that that's what's happening (still just "spinner," as specced in requirement 5).
7. **Repurposing `lastBackupAt` vs adding `lastSyncedAt`.** Recommended (task 1): rename/repurpose rather than adding a second field, since keeping both would leave `lastBackupAt` permanently stale/unused after this feature lands. If any other code reads `project.lastBackupAt` outside `SettingsOverlay.tsx`, grep for it before renaming — plan assumes it's only read at `SettingsOverlay.tsx` lines 206-214 based on the files read for this plan.
