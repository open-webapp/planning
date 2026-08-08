# product-behavior.md

See `design.md` for architecture/data flow, `schema-spec.md` for data shapes and CSV format.

## App shell

- Dark top bar: project switcher (name + chevron), nav pills (**Tasks**, **Timeline** — no pill for Milestones, reached only by clicking a milestone/upcoming-milestone card), cloud-sync icon (only shown once the active project is Drive-connected + provisioned; spins while syncing), settings gear.
- Toolbar row below the top bar, contents vary by `activeView`:
  - Tasks: search box + Status/Category/Assignee/Milestone filter dropdowns + "New Task" button.
  - Timeline: filter dropdowns only (no search, no add button).
  - Milestones: neither search, filters, nor add button.
- Each filter dropdown has an "(Clear)" entry (when a value is set) and a "+ Add new value..." entry that `window.prompt()`s for a new status/category/assignee, or `ADD_MILESTONE` for the milestone filter.
- Clicking outside the project switcher or a filter dropdown closes it (mousedown listener on document).

## Project switching

- Dropdown lists all projects with a checkmark on the active one; "New Project" row at the bottom prompts for a name (`window.prompt`) and creates it with empty task/milestone data.
- Switching projects snapshots the current project's task/UI state and restores the target project's snapshot (or empty state), and always resets `activeView` to `'tasks'`.

## Tasks view

- Stat strip (5 cards): Total Items, Total Estimate (days, top-level tasks only), Completed (%), In Progress (count), Overdue (count — non-Done tasks whose display end date is before today).
- Collapsible "Breakdown" section (collapsed by default): assignee estimate-days bar chart (empty tasks bucket into "Unassigned"), and an upcoming-milestones list (progress < 100%, sorted by end date; shows 3 by default with a "+N more"/"Show fewer" toggle). Clicking an upcoming-milestone entry sets the milestone filter.
- Table columns: #, Name, (details), Category, Status, Assignee, Start, Estimate, Est. End, Dependencies, Progress, (actions). Column headers are click-to-sort (toggles asc/desc on repeat click); `#`/details/actions columns aren't sortable. Column widths are per-column, drag-resizable (min 160px for Name, 50px for others), persisted in `state.columnWidths`.
- Rows are grouped under milestone header rows (name is inline-editable); tasks whose `milestoneId` doesn't match a live milestone are rendered as a flat unassigned group at the end.
- **Row editing**: name (textarea, auto-grows), category/assignee/status (autocomplete cells backed by custom value lists), start date (date input), estimate (number), progress (number 0–100, editable only on leaf tasks — parent progress is a read-only rollup average of descendant progress), dependencies (count, click opens the deps picker), Est. End is read-only (computed).
- **Row actions**: expand/collapse chevron (for parents), drag handle (hidden until row hover), Details button (opens comments/notes overlay; shows a comment count badge and highlights blue once any comment exists), delete (trash icon).
- Critical-path tasks get an orange dot next to the name and an orange side border.

### Keyboard interactions (Tasks view, when focus isn't in an input/textarea)
- `↑`/`↓` — move row selection to the previous/next visible task row.
- `Alt+↑`/`Alt+↓` — reorder the selected task among same-depth siblings (switches sort to `'manual'`); no-op if any filter is active or the task is already at an edge.
- `Alt+←` — outdent (remove parent).
- `Alt+→` — indent (become child of the previous top-level sibling in the same milestone).
- In the Name cell: `Tab`/`Shift+Tab` indent/outdent; `Enter` commits (blurs) the field.
- Autocomplete cells (category/status/assignee): `Enter` commits, `Escape` reverts, `↑`/`↓` move the highlighted suggestion.

### Drag-and-drop reorder
- Row drag handle (`@dnd-kit`) reorders/reparents a task: dropping above/below a target row's vertical midpoint inserts before/after it at that target's depth (milestone/parent). Dropping onto a descendant of the dragged task is rejected. Disabled whenever any filter is active (drag handle shows a "Clear filters to reorder" tooltip and 30% opacity).
- Moving a task always switches the sibling group's sort to manual (`'manual'`/`'asc'`), backfilling fractional `order` values on both the source and destination sibling groups if not already backfilled.
- Moving a task to a different milestone propagates the new `milestoneId` to its entire subtree.

## Milestones view

- Card grid (one card per milestone): name (click pencil icon to rename inline — `Enter` saves, `Escape` cancels, blur saves), date range + item count (or "No tasks assigned"), progress bar (average of task progress), status chips (count per distinct `status` value, sorted descending). Clicking a card switches to Tasks view filtered to that milestone.
- Empty state: "No milestones yet" / "Create a milestone to get started" (milestones are created via the Toolbar's Milestone filter "+ Add new value..." or the task-details overlay's milestone selector).

## Timeline view

- Read-only Gantt: left column of task/milestone names (indented by depth), right column of day-scale bars. Bar position/width derive from each task's display schedule; critical-path bars are orange with a highlight ring, others blue. Week-tick header shows Monday dates across the visible date range (task date range expanded ±3 days, minimum a 14-day window from today when there are no scheduled tasks). Clicking a task bar or name selects the task (opens no overlay by itself — selection only matters for the Tasks-view keyboard shortcuts).

## Task details overlay (Details button)

- Modal: milestone dropdown (includes "+ Add new" which prompts a name and atomically creates+assigns the milestone), a free-text Notes textarea, and an Updates feed of timestamped comments (newest first, comments with unparseable timestamps are filtered out) with a "Post a text update…" composer at the bottom (author is hardcoded to `'Current User'`).

## Dependencies picker overlay

- Modal: filterable list of every other task (checkbox, `#row` number, name), filter matches by name substring or row number. Clicking a row toggles that task as a dependency of the current task. No explicit save button — every click is applied immediately via `TOGGLE_DEPENDENCY`.

## Settings overlay

Two tabs, General (default on open) and Projects.

**General tab**:
- Explains local-first storage.
- Google Account: shows a spinner while `googleBusy`; if connected, shows the account email + "Disconnect"; if not, shows "Connect Google Account" and "Download CSV" buttons.
- Connecting Google auto-provisions this project's Drive file in the same action (single click does both connect + first upload). If a project is connected but its Drive file isn't provisioned yet (e.g. after switching to it), a "Setting up Drive sync..." spinner auto-fires provisioning.
- Google Drive Sync (only shown once connected): "Sync Now" button (disabled while `syncBusy` or before the Drive file is provisioned), last-sync timestamp or "Not synced yet.", a "View in Google Drive" link once synced, and inline success/error status text (errors include an action link when `parseSyncError` supplies one, e.g. "Enable the API").

**Projects tab**:
- Lists every project with a color dot, name, Drive sync status line ("Not connected to Drive" / "Synced to Drive" / "Synced to Drive — last synced …"), and a delete (trash) button.
- Deleting always backs up that project's tasks to a CSV download first (`window.confirm` gate), then deletes. Cannot delete the last remaining project (silently refused).

## Sync conflict overlay

- Appears automatically when a sync detects conflicting edits; blocks other UI (no backdrop-click dismiss).
- **≤5 conflicts**: per-field radio choice between "Drive version" / "Browser version" (click again to unpick); "Apply and Sync" is disabled until every conflict has a choice.
- **>5 conflicts**: bulk mode — two buttons, "Accept Google Drive version" / "Accept Browser version", applied to all non-`__deleted` conflicts at once.
- "Cancel" clears conflicts without applying/pushing anything (`CLEAR_SYNC_CONFLICTS`); the merged-but-unresolved data is discarded, nothing is written to Drive or local state.
- A `__deleted` conflict (one side deleted a task, the other edited it) always keeps the task — there's no per-choice UI for it since deletion is never silently applied.

## Sync toast

- Bottom-right toast, shown whenever `syncStatus` is set and there are no open conflicts.
- Success (message starts with `"Synced at "`): green, auto-dismisses after 4s, closable early.
- Error: red, shows the friendly message (+ action link if any) and a "Retry" button that re-runs `syncNow`.

## Empty/edge-case behavior

- Fresh install (no localStorage data): a single "Main Project" is created with zero tasks/milestones — no demo/seed content.
- Tasks with a `milestoneId` pointing at a deleted/nonexistent milestone still render, grouped into a flat unassigned bucket at the bottom of the Tasks/Timeline views.
- A Drive sync that returns a completely empty file when a non-empty snapshot exists is treated as a transient read failure (not "everything was deleted") — the sync falls back to first-sync semantics and re-pushes the browser's data rather than wiping it.
