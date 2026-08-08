# schema-spec.md

See `design.md` for how these types flow through state/sync, `product-behavior.md` for user-facing effects.

## TypeScript types (`src/lib/types.ts`)

| Type | Field | Type | Meaning / constraints |
|---|---|---|---|
| `Comment` | `id` | `string` | `uid('c')` |
| | `author` | `string` | Hardcoded `'Current User'` at creation (no real auth identity) |
| | `ts` | `string` | ISO timestamp |
| | `text` | `string` | Trimmed non-empty on creation |
| `Task` | `id` | `string` | `uid('t')` |
| | `name` | `string` | Non-empty on commit (blur reverts empty edits) |
| | `milestoneId` | `string \| null` | FK to `Milestone.id`; `null`/dangling = unassigned bucket |
| | `parentId` | `string \| null` | FK to another `Task.id`; `null` = top-level |
| | `category` | `string` | Free text, backed by `customCategories` autocomplete list |
| | `assignee` | `string` | Free text, backed by `customAssignees` autocomplete list |
| | `status` | `string` | Free text, backed by `customStatuses` autocomplete list (no fixed enum; `'Done'`/`'In Progress'`/`'Started'` are the only status strings with special-cased behavior — see stat cards) |
| | `estimate` | `number` | Days; used in working-day schedule calc |
| | `startDate` | `string` | `YYYY-MM-DD` |
| | `progress` | `number` | `0`–`100`; editable only on leaf tasks, parents show a computed rollup |
| | `order` | `number` | Fractional manual-sort index within a sibling group; `0` until the group is "backfilled" (see `design.md`) |
| | `dependencies` | `string[]` | Array of other `Task.id`s (not names) |
| | `comments` | `Comment[]` | |
| | `notes` | `string \| undefined` | Free text |
| `Milestone` | `id` | `string` | `uid('m')` |
| | `name` | `string` | |
| `Project` | `id` | `string` | `uid('p')` |
| | `name` | `string` | |
| | `color` | `string` | Hex or Tailwind color name |
| | `driveFileId` | `string \| undefined` | Set once the project's Drive CSV file is provisioned |
| | `lastSyncedSnapshot` | `string \| null` | JSON-serialized `{ tasks, milestones }` as of the last successful sync — the three-way-merge baseline |
| | `lastSyncedAt` | `string \| null` | ISO timestamp |
| `SyncConflict` | `taskId` | `string` | |
| | `taskName` | `string` | Display name (browser-side, in case of a rename-on-both-sides conflict) |
| | `field` | `keyof Task \| '__deleted'` | `'__deleted'` = deletion-vs-edit conflict, not a real field |
| | `browserValue` | `unknown` | |
| | `driveValue` | `unknown` | |

`AppState`/`ProjectState` (in `state.ts`) are not a persisted schema per se — see `design.md`'s Data model section and `PERSIST_STATE_KEYS`/`PROJECT_STATE_KEYS` in `state.ts` for exactly what's kept where.

## CSV format (`src/lib/csv.ts`)

Single flat CSV per project — one row per `Task`; `Milestone`s are implied by the `Milestone` column (not written as separate rows).

**Columns** (in order): `ID, Name, Milestone, Category, Assignee, Status, Start Date, Estimate (days), Est. End Date, Progress %, Dependencies`

**Encoding** (`escapeCSVField`): any field containing `"`, `,`, or newline is wrapped in `"..."` with internal `"` doubled. Standard comma-separated otherwise.

**Per-column semantics**:
- `ID` — the task's `id`, written and read back verbatim (round-trips).
- `Milestone` — the milestone's **name**, not id. On parse, an unseen name is assigned a fresh `uid('m')`; an existing milestone (matched by exact name against `existingMilestones` passed into `parseTasksCsvString`) reuses its id. Milestone name collisions across differently-`id`'d milestones are indistinguishable after a round-trip.
- `Dependencies` — `; `-joined list of dependency **task ids** (not names), parsed back with `.split('; ')`.
- `Estimate (days)` / `Progress %` — parsed with `parseInt(...) || 0`; non-numeric or missing becomes `0`.
- `Est. End Date` — computed via `computeBaseSchedules` at export time; **write-only**, ignored on import (end date is always recomputed from `startDate`+`estimate`+dependencies, never read from the sheet).

**Fields NOT represented in CSV** (lost on every Drive round-trip unless already tracked via the sync snapshot/diff mechanism):
- `parentId` — always written flat; `parseTasksCsvString` always sets it to `null` on import. Subtask hierarchy does not survive a raw CSV parse.
- `order` — always parsed back as `0`. Manual ordering does not survive a raw CSV parse.
- `comments`, `notes` — always parsed back as `[]` / `undefined`.

Because of the above, `syncNow`'s sheet-side diff (`diffAgainstSnapshot(sheetData, snapshot, ['order', 'parentId'])`) explicitly skips `order` and `parentId` — otherwise every sync would register a spurious sheet-side edit reverting the browser's manual ordering/nesting to the CSV's flattened defaults.

**Validation**: none beyond the numeric-parse fallbacks above and CSV-escaping. No schema/shape validation is run on parsed rows; a malformed row can produce a `Task` with an empty `id`/`name`.
