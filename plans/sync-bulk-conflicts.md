# Bulk Sync Conflict Resolution — Implementation Plan

## Overview

When sync conflicts exceed 5, the SyncConflictOverlay switches from showing individual conflict items with per-conflict radio buttons to showing a simplified UI with only the count and two bulk action buttons. This improves UX for high-conflict scenarios while preserving the detailed per-conflict UI for typical cases (≤5 conflicts).

**Key design:**
- Individual UI when `conflicts.length ≤ 5`
- Bulk UI when `conflicts.length > 5`
- Deletion conflicts (field: '__deleted') are always auto-resolved to keep data (no user choice required)
- Bulk choice generates `choices` object with all conflicts mapped to same value: 'sheet' or 'browser'

## Phases

### Phase 1: Conditional UI Toggle in SyncConflictOverlay (T0)
**File:** `src/overlays/SyncConflictOverlay.tsx`  
**Depends on:** None  
**Duration:** 20 min

Modify the overlay to render one of two UI modes:
1. **Individual mode** (≤5 conflicts): current UI — list all conflicts with per-conflict radio buttons
2. **Bulk mode** (>5 conflicts): header with count + two buttons ("Accept Google Drive version" / "Accept Browser version")

**Implementation details:**
- Add conditional: `if (state.syncConflicts.length > 5) { renderBulkUI() } else { renderIndividualUI() }`
- In bulk mode, hide the conflict list and footer "Apply and Sync" button
- Add two bulk action buttons that generate choices object in one shot: `{ [key1]: choice, [key2]: choice, ... }` for all conflicts
- Button states and styling match individual mode's "Apply and Sync" button
- Keep the X close button available in both modes

**Test case (Phase 4):** Render overlay with 6 conflicts → verify bulk UI shown; with 5 conflicts → verify individual UI shown

---

### Phase 2: Bulk Choice Handler (T0)
**File:** `src/overlays/SyncConflictOverlay.tsx`  
**Depends on:** T0 (Phase 1)  
**Duration:** 10 min

Add two new handler functions for bulk button clicks:
1. `handleBulkAcceptDrive()` — generates `choices` where all conflicts map to 'sheet'
2. `handleBulkAcceptBrowser()` — generates `choices` where all conflicts map to 'browser'

**Implementation details:**
- Iterate `state.syncConflicts` and build `{ [conflictKey]: 'sheet' | 'browser' }` object
- Dispatch same `SYNC_RESOLVE_CONFLICTS` action as individual mode (no reducer changes needed)
- Filter out deletion conflicts (`field === '__deleted'`) from choices since they auto-resolve

**Test case (Phase 4):** Click bulk button with 6 conflicts → verify all non-deletion conflicts appear in choices with same value

---

### Phase 3: Deletion Conflict Documentation (T1)
**File:** `src/lib/sync.ts`  
**Depends on:** None  
**Duration:** 5 min

Add/clarify comments explaining deletion conflict handling:
- **Lines 212-234** (task deletion conflicts): Comment that when one side deletes and the other edits, a conflict is emitted with `field: '__deleted'`; resolution always keeps the data (never actually deletes)
- **Lines 330-353** (milestone deletion conflicts): Same pattern for milestones
- **Lines 467-470, 483-486** (applyResolutions): Comment that `__deleted` pseudo-field is skipped during resolution — the entity remains in the merged result because mergeTask/mergeMilestone already added it

**Rationale:** Future maintainers and bulk-choice code need to understand that deletion conflicts don't participate in user choice logic.

**Test case (Phase 4):** Code review confirms comments clarify deletion-conflict semantics

---

### Phase 4: Test Coverage (T2)
**File:** `src/lib/sync.test.ts` + optional `src/__tests__/SyncConflictOverlay.test.tsx`  
**Depends on:** T0, T1, T2  
**Duration:** 25 min

**Test 1 (sync.ts):** Round-trip with 6 field conflicts (no deletions)
- 6 tasks, each with one field conflicted on both sides
- threeWayMerge returns 6 conflicts
- applyResolutions with all choices set to 'sheet' → verify all tasks have sheet values
- applyResolutions with all choices set to 'browser' → verify all tasks have browser values

**Test 2 (sync.ts):** Mixed conflicts (6 field + 1 deletion)
- 5 tasks with field conflicts + 1 task with deletion conflict
- applyResolutions with bulk choice 'sheet' → verify 5 field tasks have sheet values, 1 deleted task is kept
- applyResolutions with bulk choice 'browser' → verify 5 field tasks have browser values, 1 deleted task is kept

**Test 3 (sync.ts):** ≤5 conflicts (unchanged behavior)
- Verify that 5-or-fewer conflicts still apply resolutions correctly (no regression)

**Test 4 (UI optional):** SyncConflictOverlay with 6+ conflicts
- Render overlay with 7 conflicts → verify bulk buttons shown, individual items hidden
- Click "Accept Google Drive version" → verify SYNC_RESOLVE_CONFLICTS dispatched with all conflicts mapped to 'sheet'
- Click "Accept Browser version" → verify SYNC_RESOLVE_CONFLICTS dispatched with all conflicts mapped to 'browser'

**Test 5 (UI optional):** SyncConflictOverlay with ≤5 conflicts
- Render overlay with 3 conflicts → verify individual UI shown, bulk buttons hidden
- Per-conflict radio buttons still functional (spot check one conflict)

---

## File Changes Summary

1. **src/overlays/SyncConflictOverlay.tsx** (primary)
   - Add conditional render for bulk vs. individual mode
   - Implement `handleBulkAcceptDrive()` and `handleBulkAcceptBrowser()` handlers
   - Add bulk action buttons with styling

2. **src/lib/sync.ts** (documentation only)
   - Add/clarify comments on deletion conflict handling in threeWayMerge (lines 212–234, 330–353)
   - Add/clarify comments in applyResolutions on `__deleted` pseudo-field skip (lines 467–470, 483–486)

3. **src/lib/sync.test.ts** (new tests)
   - Add test: 6 field conflicts → bulk resolution to both sheet and browser values
   - Add test: mixed 5 field + 1 deletion → bulk resolution preserves deleted entities
   - Add test: ≤5 conflicts (regression)

4. **No changes needed:**
   - src/lib/reducer.ts (SYNC_RESOLVE_CONFLICTS handler unchanged)
   - src/lib/state.ts (state shape unchanged)
   - src/lib/types.ts (SyncConflict type unchanged)
   - src/App.tsx (dispatch flow unchanged)

---

## Acceptance Criteria

✅ When `conflicts.length > 5`: Show bulk UI (count + two buttons), hide individual conflicts  
✅ When `conflicts.length ≤ 5`: Show individual UI (list of conflicts with per-conflict radio buttons)  
✅ Bulk "Accept Google Drive version" button → all non-deletion conflicts resolve to 'sheet'  
✅ Bulk "Accept Browser version" button → all non-deletion conflicts resolve to 'browser'  
✅ Deletion conflicts (field: '__deleted') are not presented to user; data always kept  
✅ SYNC_RESOLVE_CONFLICTS action format unchanged; same flow to applyResolutions  
✅ All existing tests pass (≤5 conflicts behavior unchanged)  
✅ New tests verify 6+ conflict bulk resolution and mixed deletion scenarios  
✅ Comments in sync.ts explain deletion conflict semantics
