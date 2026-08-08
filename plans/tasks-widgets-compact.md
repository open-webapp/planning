# Tasks Widgets Density Pass — Implementation Plan

## Overview

Follow-up density pass on the in-flight Dashboard-merge work (`plans/tasks-dashboard-merge.md`) that ported the 5 stat cards and the "Breakdown" collapsible (assignee bar chart + upcoming milestones) into `TasksView`. That work is functionally done — this plan does not touch what's computed (`STAT_ACCENTS`, `statCards`, `assigneeBreakdown`, `filteredUpcomingMilestones`) or any behavior/filter logic. It only makes the resulting widgets visually denser:

1. Replace the 5 boxed stat cards with a single-row inline stat strip (~44px tall, no card chrome).
2. Shrink `Collapsible`'s toggle row globally (it currently renders a full bordered/shadowed card header at ~64px; target ~28-32px, plain bottom-border style) — this is a shared component, so its default styling changes for every consumer.
3. Tighten the Breakdown section's internal spacing (assignee bars, milestone list, grid gap) and cap the upcoming-milestones list to 3 items by default with a "+N more" expand control.
4. Reduce the vertical rhythm between the stat strip / Breakdown toggle / task table from `mb-s6` (32px) to `mb-2` (~8px, Tailwind's default `2` unit, not an `--ns-s-*` token — see Phase 1 note).

No new dependencies, no new components required. All new styling reuses existing tokens (`--ns-*` CSS vars via `fg-1/2/3`, `border-divider`, `ink-100`, `rounded-pill`, `s2`-`s7` spacing scale) or plain Tailwind numeric utilities where the `s*` scale is too coarse (e.g. `mb-2` = 8px vs. `s2` = 8px — these coincide, see note in Phase 1).

### Key existing-code findings that shape this plan

- `Collapsible` (`src/components/Collapsible.tsx`) is used **only** by `TasksView.tsx` — confirmed via `grep -rln "Collapsible" src` (excluding its own test file). No other view depends on the current bordered/shadowed card look, so this plan changes `Collapsible`'s default styling in place rather than adding a `variant`/`compact` prop. If a future consumer wants the old boxed look, that's a new requirement to handle then, not now.
- The project's spacing scale (`tailwind.config.js` `spacing`, backed by `--ns-s-*` in `src/styles/colors_and_type.css`) is: `s1`=4px, `s2`=8px, `s3`=12px, `s4`=16px, `s5`=24px, `s6`=32px, `s7`=48px. There is no `s0` or half-step below 8px, so "~8px margin" maps exactly to `s2` (or Tailwind's built-in `2` = 0.5rem = 8px — identical value, `s2` is preferred for consistency with the rest of the file). "~8px/12px" padding for the toggle row maps to `py-s2 px-s3` (8px/12px) exactly.
- `STAT_ACCENTS` (lines 27-33) and the `statCards` computation (`useMemo` at lines 97-100) are untouched — only the JSX at lines 251-281 (the `grid grid-cols-5 ...` card wrapper) changes. The `idx`-based `displayValue` formatting logic (lines 256-259, mapping index 1→`Nd`, index 2→`N%`) is preserved verbatim, just re-rendered inline instead of per-card.
- `renderAssigneeBreakdownChart` (lines 171-200) uses `space-y-[12px]` on its wrapper div (line 177) — this is the "assignee bars" spacing referenced in requirement 3, to shrink to `space-y-2` (8px).
- `renderUpcomingMilestonesChart` (lines 202-240) has no per-item gap class itself (each row is `pb-[14px] border-b ... p-[10px]`, line 215) — the "milestone list gap" referenced in the requirements is actually the *outer* wrapper's `gap-[14px]` at the call site (line 292: `<div className="flex flex-col gap-[14px]">{renderUpcomingMilestonesChart()}</div>`), since `renderUpcomingMilestonesChart` returns a single non-flex `<div>` wrapping all rows, not the flex container. Need to also reduce the `pb-[14px]`/`p-[10px]` per-row padding for a fully tightened look, and cap the row count for the "+N more" control (requirement 3).
- The two-column grid gap for the Breakdown content lives at line 285 (`grid grid-cols-1 lg:grid-cols-2 gap-s5`, 24px) — shrinks to `gap-s3` (12px) per requirement 3 ("grid gaps to something smaller").
- `Collapsible`'s children are only mounted while `open` is true (`{open && <div>...}`, line 26 in current file) — this means any new "+N more" expand state added inside `TasksView`'s Breakdown content is independent of the outer `Collapsible`'s open/close state; collapsing the outer section and reopening it will reset to the default `useState(false)` " show all" state each mount (acceptable, no persistence requirement was given).
- Existing `Collapsible.test.tsx` asserts DOM presence/absence and one literal CSS value (`chevron?.style.transform` — inline `style`, not a class, so untouched by the density pass) — the chevron rotation mechanics stay exactly as-is; only wrapper/header Tailwind classes change, so most of that file needs no changes except any test that queries by old class name (grep confirms none do — all queries are by text/role/style, not class selector).
- `TasksView.test.tsx`'s "stat cards respect filters" test (line 249: `container.querySelectorAll('.text-\\[1\\.75rem\\]')`) selects stat card values by their literal font-size class — this class will change/disappear once cards become an inline strip, so this test's selector must be updated in Phase 4 to match the new markup.

---

## Phases

### Phase 1: Compact Stat Strip (T1)
**File:** `src/views/TasksView.tsx`
**Depends on:** None
**Duration:** 25 min

- Replace the stat card grid JSX (lines 251-281) with a single-row inline strip. Keep `STAT_ACCENTS` and the `statCards` useMemo completely unchanged; only the rendering wrapper and each item's markup change.
- New markup, replacing the `<div className="grid grid-cols-5 gap-[16px] mb-s6">...</div>` block:

```tsx
{/* Stat Strip */}
<div className="flex items-center flex-wrap gap-s5 mb-2" style={{ minHeight: '44px' }}>
  {STAT_ACCENTS.map((accent, idx) => {
    const statKey = ['totalItems', 'totalEstimateDays', 'completedPercent', 'inProgressCount', 'overdueCount'][idx] as keyof typeof statCards
    const value = statCards[statKey]
    const displayValue =
      idx === 1 ? `${value}d` :
      idx === 2 ? `${value}%` :
      String(value)

    return (
      <div key={accent.label} className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent.color }}
        />
        <span className="text-[0.9375rem] font-semibold text-fg-1">{displayValue}</span>
        <span className="text-[0.75rem] text-fg-3">{accent.label}</span>
      </div>
    )
  })}
</div>
```

- Dot size shrinks from `w-3 h-3` (12px) to `w-2 h-2` (8px) to fit the slim row.
- Drops the per-card `bg-white border border-border rounded-lg p-[20px] shadow-1` box entirely — no card chrome, per requirement 1 ("no card borders/shadow/padding-box").
- `gap-s5` (24px) between metric groups gives clear visual separation on one line without a divider character; `flex-wrap` is a safety net for narrow viewports (not explicitly required, but prevents the strip from clipping — cheap to include).
- Outer margin drops from `mb-s6` (32px) to `mb-2` (8px) per requirement 4.
- Uppercase label styling (`uppercase font-semibold`, previously on the label) is dropped in favor of plain sentence-case (`In Progress` as authored in `STAT_ACCENTS`, not `IN PROGRESS`) — a minor deliberate visual simplification since uppercase small-caps reads heavier in a dense inline row; flagged in the summary as a judgment call.

**Test case (Phase 4):** covered in Phase 4.

---

### Phase 2: Slim Collapsible Toggle Row (T1)
**File:** `src/components/Collapsible.tsx`
**Depends on:** None (independent of Phase 1)
**Duration:** 20 min

Since grep confirms `Collapsible` has exactly one consumer (`TasksView.tsx`), this changes the component's default styling in place — no new prop needed.

- Replace the outer wrapper class `bg-white border border-border rounded-lg shadow-1 mb-s6` with `border-b border-divider mb-2` — drops the card look (background/border-all-sides/rounded-corners/shadow) for a plain thin bottom rule, and shrinks the trailing margin from `mb-s6` (32px) to `mb-2` (8px) per requirement 4.
- Replace the toggle row class `flex items-center gap-s2 p-s6 cursor-pointer select-none` with `flex items-center gap-s2 py-2 px-3 cursor-pointer select-none` — padding drops from `p-s6` (32px all sides) to `py-2 px-3` (8px/12px), matching the ~28-32px total row height target (8px padding top + 8px bottom + ~16px line height ≈ 32px).
- Shrink the chevron from `size={16}` to `size={14}` and the label from `text-body font-medium` to `text-[0.8125rem] font-medium` — both per requirement 2's "smaller chevron/text if needed."
- Expanded content padding (`px-s6 pb-s6`, line 26 in the old file) shrinks to `px-3 pb-3` to match the new horizontal rhythm (`px-3` mirrors the header's `px-3`).
- Full updated component:

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
    <div className="border-b border-divider mb-2">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-s2 py-2 px-3 cursor-pointer select-none"
      >
        <ChevronDown
          size={14}
          className="text-fg-2 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="text-[0.8125rem] font-medium text-fg-1">{label}</span>
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export default Collapsible
```

- No prop signature change — `CollapsibleProps` is untouched, so `TasksView`'s existing `<Collapsible label="Breakdown" defaultOpen={false}>` call site needs no edit.

**Test case (Phase 4):** covered in Phase 4 (existing `Collapsible.test.tsx` assertions are by text/role/inline-style, not class, so most pass unchanged — confirm no test asserts the old wrapper class).

---

### Phase 3: Tighten Breakdown Content + Cap Milestones List (T2)
**File:** `src/views/TasksView.tsx`
**Depends on:** None directly, but should land alongside Phase 1/2 in the same review unit since all three touch the same visual region
**Duration:** 30 min

**Grid gap (line 285):**
- `grid grid-cols-1 lg:grid-cols-2 gap-s5` → `grid grid-cols-1 lg:grid-cols-2 gap-s3` (24px → 12px).

**Assignee bars (`renderAssigneeBreakdownChart`, line 177):**
- `space-y-[12px]` → `space-y-2` (12px → 8px).
- No other change to this function — bar height, colors, sort order, empty state untouched.

**Upcoming milestones — cap to 3 + expand control:**
- Add local state near the top of the component (alongside `resizingColumn`/`resizeStart`): `const [showAllMilestones, setShowAllMilestones] = useState(false)`.
- Modify `renderUpcomingMilestonesChart` to slice the list and append a toggle:

```tsx
const renderUpcomingMilestonesChart = (): React.ReactNode => {
  if (filteredUpcomingMilestones.length === 0) {
    return <p className="text-[0.8125rem] text-fg-3">No upcoming milestones</p>
  }

  const visibleMilestones = showAllMilestones
    ? filteredUpcomingMilestones
    : filteredUpcomingMilestones.slice(0, 3)
  const hiddenCount = filteredUpcomingMilestones.length - visibleMilestones.length

  return (
    <div>
      {visibleMilestones.map((milestone) => (
        <div
          key={milestone.id}
          onClick={() => {
            dispatch({ type: 'SET_FILTER', filterKey: 'milestone', value: milestone.id })
          }}
          className="pb-2 border-b border-border last:border-b-0 cursor-pointer hover:bg-bg transition-colors p-2 rounded"
        >
          <div className="text-[0.8125rem] font-medium text-fg-1 mb-1">{milestone.name}</div>
          <div className="text-[0.75rem] text-fg-3 mb-1">
            {milestone.startDate && milestone.endDate
              ? `${milestone.startDate} - ${milestone.endDate} · ${milestone.itemCount} items`
              : 'No tasks assigned'}
          </div>
          {milestone.itemCount > 0 && (
            <div className="w-full h-2 bg-ink-100 rounded-pill overflow-hidden">
              <div
                className="h-full rounded-pill"
                style={{ width: `${milestone.progress}%`, background: statusColor('Done') }}
              />
            </div>
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAllMilestones(true)}
          className="text-[0.75rem] text-fg-3 hover:text-fg-1 mt-1 underline-offset-2 hover:underline"
        >
          +{hiddenCount} more
        </button>
      )}
      {showAllMilestones && filteredUpcomingMilestones.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAllMilestones(false)}
          className="text-[0.75rem] text-fg-3 hover:text-fg-1 mt-1 underline-offset-2 hover:underline"
        >
          Show fewer
        </button>
      )}
    </div>
  )
}
```

- Per-row padding shrinks from `pb-[14px]` / `p-[10px]` to `pb-2` / `p-2` (14px/10px → 8px), and inner label margins from `mb-[6px]`/`mb-[8px]` to `mb-1` (4px) — all part of "tighter" per requirement 3.
- The outer call-site wrapper (line 292) `<div className="flex flex-col gap-[14px]">{renderUpcomingMilestonesChart()}</div>` → `<div className="flex flex-col gap-2">{renderUpcomingMilestonesChart()}</div>` (14px → 8px). Since `renderUpcomingMilestonesChart` now returns its own `<button>` controls inside the same single wrapping `<div>` it already returned, this outer `gap-2` mainly affects spacing between the "Assignee breakdown" heading block and this chart's own top-level div (there's only one child here, consistent with the pre-existing structure) — no functional change, just token consistency with Phase 1/2's `gap-2`/`mb-2` convention.
- Adding a "Show fewer" toggle back to 3 is not explicitly required by the interview (only "+N more" that expands was specified) but is included as a low-cost, obvious UX completion — flagged as a judgment call in the summary.
- `showAllMilestones` is local `useState` in `TasksView`, resets on unmount/remount (e.g. collapsing and reopening the outer `Collapsible` does NOT unmount this state since `TasksView` itself doesn't remount — only `Collapsible`'s internal `open` toggles which children are mounted in the DOM tree via `{open && ...}`, and `TasksView`'s own state, including `showAllMilestones`, lives above that and survives). Confirm this in Phase 4 tests: collapse then reopen Breakdown after clicking "+N more" → expanded milestone state should still show all (not reset) since `showAllMilestones` lives in `TasksView`, not inside `Collapsible`.

**Test case (Phase 4):** covered in Phase 4.

---

### Phase 4: Update Tests for New Markup (T1)
**Files:** `src/__tests__/TasksView.test.tsx`, `src/components/Collapsible.test.tsx`
**Depends on:** Phase 1, Phase 2, Phase 3
**Duration:** 30 min

**`src/__tests__/TasksView.test.tsx`:**
- Test "stat cards show counts from filtered tasks only" (line 212) currently selects via `container.querySelectorAll('.text-\\[1\\.75rem\\]')` (the old per-card big-number class, removed in Phase 1). Update the selector to match the new inline strip markup — e.g. query by the new value/label span classes (`.text-\\[0\\.9375rem\\]`) or, more robustly, assert on `container.textContent` containing the expected values (`'2'` items, filtered count) alongside their labels (e.g. regex matching `/2\s*Total Items/i]` depending on exact DOM text adjacency) instead of relying on a specific font-size class, since that's brittle to any future visual tweak. Recommend the text-content approach for durability.
- Test "breakdown section is collapsed by default and toggles on click" (line 256) and "assignee breakdown shows correct grouping and sorting by estimate" (line 309) both do `label.closest('div')` to find the clickable header — this still works after Phase 2 since the header is still a `<div>` with an `onClick`, just with different classes; no assertion touches the removed classes, so these should pass unchanged. Run them to confirm.
- Add a new test: "upcoming milestones list caps at 3 with a '+N more' control that expands" — build 5 tasks with distinct milestones so `filteredUpcomingMilestones` has 5 entries (need milestones set on `mockState.milestones` and `milestoneId` on tasks, since `computeUpcomingMilestones` only surfaces milestones referenced by the filtered tasks — check `computeUpcomingMilestones`'s exact signature/output shape in `src/lib/selectors.ts` before writing, since it may aggregate tasks per milestone rather than 1:1). Expand Breakdown, assert only 3 milestone name rows in the DOM plus a `"+2 more"` button; click it, assert all 5 render and the button now reads `"Show fewer"`; click again, assert back to 3.
- Add a new test: "stat strip renders inline with no card boxes" — assert the stat strip container has no descendant with the old `shadow-1` class (regression guard that the card look is actually gone).

**`src/components/Collapsible.test.tsx`:**
- Read through all 10 existing tests: none query by the removed wrapper/header classes (`bg-white`, `shadow-1`, `p-s6`) — all assertions are `getByText`/`queryByText`/`closest('div')`/inline `style.transform` on the chevron. Confirm this holds after Phase 2's edit (the `closest('div')` calls still resolve to the same clickable header element, since it's still the nearest ancestor `<div>` around the label span) — expect **zero required changes** to this file's test bodies. Run the suite to verify; if any assertion unexpectedly breaks (e.g. due to a snapshot-style check not visible in the current read), patch the class expectation only, not the test's intent.
- Optionally (not required, cheap value-add): add one assertion that the wrapper no longer carries `shadow-1`/`bg-white` classes, mirroring the TasksView regression guard above, to lock in the new default and catch accidental reversion.

**Test case:** `npm run typecheck` and full test suite (`npm test` or project equivalent) pass with zero regressions; the new milestones-cap and stat-strip-no-cards tests pass; manual/`verify` skill check confirms visually: stat strip is one row (~44px), Breakdown toggle is a slim row with a bottom rule (no box/shadow), milestones list shows 3 + a working "+N more" toggle, and overall vertical spacing between the three regions reads noticeably tighter than before.

---

## File Changes Summary

1. **src/views/TasksView.tsx** — replace 5-card stat grid with inline stat strip (Phase 1); tighten Breakdown grid gap, assignee-bar spacing, and milestone-row padding, add `showAllMilestones` state + "+N more"/"Show fewer" control capping the milestones list to 3 by default (Phase 3).
2. **src/components/Collapsible.tsx** — shrink the toggle row from a bordered/shadowed card header (`p-s6`, `size={16}` chevron, `text-body`) to a slim bottom-border row (`py-2 px-3`, `size={14}` chevron, `text-[0.8125rem]`); no prop/signature change. This is a global default-style change — confirmed safe via grep, `TasksView` is the only consumer.
3. **src/__tests__/TasksView.test.tsx** — update the stat-card-selector test to match new inline strip markup; add tests for the milestones cap/expand control and for absence of card-box classes on the stat strip.
4. **src/components/Collapsible.test.tsx** — expected to need no changes (verify by running); optionally add a class-absence regression guard.

---

## Acceptance Criteria

- [ ] Stat strip renders as a single row (~44px tall) with 5 inline `dot + value + label` groups, no per-metric card border/shadow/box padding.
- [ ] Stat strip still shows the same 5 metrics, same values/formatting (`{n}d` estimate, `{n}%` completed), same colors as `STAT_ACCENTS`, computed from the same filtered `statCards` as before — no computation logic changed.
- [ ] `Collapsible`'s default toggle row is a slim ~28-32px row with a plain thin bottom border (`border-b border-divider`), not a bordered/shadowed card; chevron and label are visibly smaller than before.
- [ ] `Collapsible`'s expand/collapse behavior, `defaultOpen` prop, and children-only-mounted-when-open behavior are unchanged.
- [ ] Breakdown section's internal grid gap, assignee-bar spacing, and milestone-row spacing are visibly tighter than the pre-pass version.
- [ ] Upcoming milestones list shows at most 3 items by default with a "+N more" control; clicking it reveals the full list inline (no navigation, no modal); a "Show fewer" control (or equivalent) collapses back to 3.
- [ ] Vertical gaps between the stat strip, Breakdown toggle, and task table are ~8px (`mb-2`), not the previous `mb-s6` (32px).
- [ ] `Collapsible` remains a generic component with no new required prop; confirmed via grep that no other consumer depended on the old boxed styling.
- [ ] `npm run typecheck` (or equivalent) and the full test suite pass with no regressions, including updated/new tests in `TasksView.test.tsx` and (if needed) `Collapsible.test.tsx`.
- [ ] Manual/visual check (or `verify` skill) confirms the Tasks page reads noticeably denser at the top: stat strip, Breakdown toggle, and section spacing all visibly compact, while the table and its existing behavior are unaffected.
