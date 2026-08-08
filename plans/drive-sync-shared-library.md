# Drive Sync Shared Library — `@open-webapp/drive-sync` — Implementation Plan

Source of truth: this doc + real current source. Line refs point at files as of 2026-08-06 — re-check before editing if other work landed first. No `plans/_template.md` in this repo; structure/style follows `plans/drive-csv-sync.md` and `plans/projects-app-sync.md`, but task lines here are deliberately terse (each ≤30 min, explicit deps).

All design decisions below were resolved in a design interview. **Do not re-litigate them during implementation.** Open questions are confined to the final section.

## Overview

Two apps duplicate per-project Google OAuth + Drive file I/O:

- `open-webapp/planning` (this repo, `/Users/mdoraiswamy/owa/planning`) — React 19, localStorage, CSV sync, 3-way merge. Auth+Drive live in `src/lib/googleAuth.ts` (531 lines, both concerns fused).
- `notesdiary/app` (`/Users/mdoraiswamy/owa/notesdiary/app`) — React 18, IndexedDB, JSON sync, union-by-id merge. Auth in `src/lib/googleAuth.ts` (178), Drive in `src/lib/driveApi.ts` (266).

The two auth modules are near-identical forks and carry the **same 11 bugs**. Extract one plain-TypeScript, React-free library `@open-webapp/drive-sync` that owns OAuth token lifecycle + storage + low-level Drive file/permission ops. Merge logic, file naming, and content format stay app-side.

**Repo shape — endpoints and repos are FROZEN.** Both existing apps stay exactly where they are:

- planning stays in `open-webapp/planning`, keeps deploying to `https://open-webapp.github.io/planning/` via its existing **unchanged** `.github/workflows/deploy.yml`.
- notesdiary stays in `notesdiary/app`, unchanged.

A new monorepo `open-webapp/owa` starts as a **single-package repo** holding `packages/drive-sync`, with npm workspaces (`packages/*`, `apps/*`) configured for future apps only. Neither existing app is imported into it. Both existing apps are external npm consumers with identical workflows, using `npm link` for local iteration during migration.

The written spec (34 decisions, storage layout, refresh state machine) is a 2–3 page descriptive byproduct, not a deliverable contract — the library is the contract. No non-JS consumers.

**Scope change for notesdiary:** it currently requests only `drive.file`. All apps move to `drive.file` + `userinfo.email`. Email scope is REQUIRED (it enables the `hint` param, which is the only defense against silent refresh returning a wrong-account token). notesdiary users hit a one-time re-consent. Detect proactively via recorded `grantedScopes`, never via a 403.

**Not in scope:** moving either app's repo or deploy target; any sync/merge/diff abstraction in the library; Changesets; a bundler; non-JS consumers; token migration between old and new storage (the scope change invalidates every stored token anyway).

---

## The 34 behaviors the library must implement

Every item gets a test. Column 3 names the task that implements it, column 4 the test-case number in the Test Cases section.

### Bugs present in BOTH apps — 11 named regression tests (R1–R11)

| # | Bug | Task | Test |
|---|---|---|---|
| 1 | `tokenClient` module singleton closes over the FIRST call's `projectId` → project B's token gets written under project A's key (`planning/src/lib/googleAuth.ts:168-184`, `notesdiary/.../googleAuth.ts:114-129`) | T16 | R1 |
| 2 | `tokenClient` ignores the `scopes` arg on every call after the first (scope baked into the singleton at init) | T16 | R2 |
| 3 | `inFlightTokenPromise` is a single module global, not keyed by `(projectId, scopeSet)` (`planning:19,110-117`) | T17 | R3 |
| 4 | Module-level `tokenResolve`/`tokenReject` clobber each other on concurrent calls — first caller's promise never settles (`planning:17-18,186-188`) | T16 | R4 |
| 5 | Hardcoded `3600 * 1000` expiry instead of the response's `expires_in` (`planning:68`, `notesdiary:60`) | T15 | R5 |
| 6 | `grantedScopes` never recorded → no way to detect a token granted under narrower consent without a 403 | T15 | R6 |
| 7 | No 401 handling anywhere — expired/revoked token surfaces as a raw fetch error | T22 | R7 |
| 8 | No `hint` param on silent refresh → GIS can return a token for a DIFFERENT signed-in Google account | T18 | R8 |
| 9 | Missing `response.ok` checks in notesdiary `driveApi.ts` (`findOrCreateAppFolder:9`, `findOrCreateSubfolder:34`, `listBackupFiles:61`, `uploadFileContent:92,114`, `listPermissions:180`, `createPermission:203`, `createAnyonePermission:224`) → `.json()` on an error body yields `undefined` ids | T21 | R9 |
| 10 | No 429/5xx retry in either app | T23 | R10 |
| 11 | Hand-rolled multipart boundary string (`planning:371-382`) — a CSV containing the boundary literal corrupts the upload | T26 | R11 |

### Fixes to adopt from whichever app already got it right

| # | Item | Source | Task |
|---|---|---|---|
| 12 | `waitForGoogleIdentityServices` poll-with-timeout guard | planning `:126-144` | T14 |
| 13 | `isScopeInsufficientError` → 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` handling | planning `:92-94` | T22 |
| 14 | `q=` escaping — escape backslash THEN quote. **Both apps are incomplete:** planning does neither (`:262-263`), notesdiary escapes only `'` (`driveApi.ts:29`) | neither | T24 |
| 15 | Error-message discipline: include status + response body text | planning (all call sites) | T19 |
| 16 | `revokeToken(projectId)` signature + early-return when no token cached | planning `:199-206` (notesdiary takes a raw token and always POSTs) | T20 |

### Other resolved decisions

| # | Decision | Task |
|---|---|---|
| 17 | `prompt:'consent'` on user gesture; `prompt:'none'` + `hint:<email>` on refresh | T18 |
| 18 | Async everywhere — no sync accessors | T9 |
| 19 | Collapse `getAuthStatus`'s redundant `{authenticated, cachedToken}` to one connection object: `{email, needsReauth, expiresAt}` | T20 |
| 20 | Shared logger, no-op by default, injectable via factory option | T8 |
| 21 | `FormData` for multipart create (adopts notesdiary `driveApi.ts:102-113`, kills #11) | T26 |
| 22 | Content-agnostic payload: `string | Blob` + explicit `mimeType` | T25 |
| 23 | `folderPath` supplied by the app at factory time (`['OpenWebApp','Planning']` / `['Notes Diary']`) | T27, T56, T68 |
| 24 | Retry = bounded exponential, 3 tries, honor `Retry-After`, NEVER retry a non-429 4xx | T23 |
| 25 | `ensureJsonExtension` stays app-side (notesdiary) | T71 |
| 26 | `getCSVFilename`/`buildTasksCsvString` stay app-side (planning) | T60 |
| 27 | `connectDriveSync` stays app-side (planning) | T60 |
| 28 | Library NEVER stores `folderId` or `driveFileId` — apps own those | T4 |
| 29 | One IndexedDB DB **per project**: `owa-drive-{appId}-{projectId}`, v1, single k-v store `auth` | T10 |
| 30 | Store split into `conn` (durable: `{email, grantedScopes, connectedAt}`) and `token` (ephemeral: `{accessToken, expiresAt, grantedScopes}`). Expiry deletes ONLY `token` — connection survives | T11 |
| 31 | Cross-tab via `BroadcastChannel`: logout propagation + token sharing | T12 |
| 32 | `drive.reconcile(knownProjectIds)` at boot drops orphaned auth DBs; `drive.dropProject(id)` is the eager path | T13 |
| 33 | NO timer. Lazy + warm-up on `visibilitychange`→visible and `pageshow` (persisted). Guard: only if `conn` exists AND token missing/within 5-min buffer. Never START while hidden; let in-flight retries finish | T29 |
| 34 | `interactive` option, default **false** on all Drive paths (throws typed `NeedsReauthError`); `true` only from a user gesture | T18, T22 |

---

## Public API (frozen — build to this)

```ts
const drive = createDriveSync({ appId, clientId, folderPath, logger? })
const dispose = drive.activate()          // attach listeners; NO listeners at import time
await drive.reconcile(knownProjectIds)    // drop orphaned auth DBs
await drive.dropProject(projectId)

const p = drive.project(projectId)
await p.connect()                         // interactive; prompt:'consent'
await p.getConnection()                   // { email, needsReauth, expiresAt } | null
await p.disconnect()

await p.ensureFolderPath()                // uses factory folderPath -> folderId
await p.files.list({ folderId, mimeType?, nameEquals? })
await p.files.read(fileId)                // null on 404
await p.files.write({ fileId? , folderId?, name?, content, mimeType })
await p.files.remove(fileId)
await p.permissions.list(fileId) / .grant(...) / .update(...) / .revoke(...)
```

Every Drive call acquires its token INTERNALLY. No `token` or `projectId` parameter at any call site. Every call accepts `{ interactive?: boolean }` (default `false`).

---

## Phase 1 — Create `open-webapp/owa`, scaffold `packages/drive-sync`

**No app moves. No deploy changes. No git history import.** Both existing apps are untouched in this phase and in every phase until they consume the published package.

1. **T1.** Verify npm scope free: `npm view @open-webapp/drive-sync`, `npm org ls open-webapp`. Expect 404. If taken, STOP — see Open Questions. Deps: none.
2. **T2.** Create empty GitHub repo `open-webapp/owa`, public (needed for free npm provenance later), default branch `main`. Deps: none.
3. **T3.** Root `package.json`: `"private": true`, `"workspaces": ["packages/*", "apps/*"]` (`apps/*` empty, reserved for future apps), scripts `test`/`build` fanning out via `npm run -ws --if-present`. Add root `.gitignore`, `tsconfig.base.json`. Deps: T2.
4. **T4.** `packages/drive-sync/package.json`: name `@open-webapp/drive-sync`, `"type":"module"`, `"exports"` map with `"."` and `"./testing"`, `files:["dist"]`, single runtime dep `idb`, `publishConfig.access: public`. No bundler. Deps: T3.
5. **T5.** `packages/drive-sync/tsconfig.json` — `module: nodenext`, `declaration: true`, `outDir: dist`, strict. Build = plain `tsc`. Deps: T4.
6. **T6.** `npm install` at root; stub `src/index.ts`; confirm `npm -w packages/drive-sync run build` emits `dist/index.js` + `dist/index.d.ts`. Deps: T5.
7. **T7.** Checkpoint (no edits): confirm `open-webapp/planning/.github/workflows/deploy.yml` and its `VITE_GOOGLE_CLIENT_ID` secret are untouched, and that `notesdiary/app` has no pending changes. Nothing in this plan may modify either deploy path. Deps: T6.

**Acceptance — Phase 1**

- [ ] `open-webapp/owa` exists, public, with npm workspaces `packages/*` + `apps/*` and exactly one package.
- [ ] `npm -w packages/drive-sync run build` succeeds and emits both JS and `.d.ts`.
- [ ] Zero commits, zero workflow edits, zero secret changes in `open-webapp/planning` and `notesdiary/app`.
- [ ] `https://open-webapp.github.io/planning/` still serves from the unchanged existing pipeline.

## Phase 2 — Build `packages/drive-sync`

Nothing consumes it yet. Depends on Phase 1.

### 2a — Core plumbing

8. **T8.** `src/logger.ts`: `Logger` interface + no-op default, injectable via factory option. Deps: T6.
9. **T9.** `src/types.ts`: `DriveSyncOptions`, `Connection`, `StoredToken`, `FileRef`, `DrivePermission`, `CallOptions {interactive?}`. All API surfaces async. Deps: T8.
10. **T10.** `src/storage.ts`: `openAuthDb(appId, projectId)` → `owa-drive-{appId}-{projectId}` v1, one k-v store `auth`. Handle cache in a `Map<string, Promise<IDBPDatabase>>` (mirror `notesdiary/src/lib/db.ts:7`). Deps: T9.
11. **T11.** Storage accessors: `getConn/setConn/clearConn`, `getToken/setToken/clearToken`. Expiry path deletes ONLY `token`. Deps: T10.
12. **T12.** `src/broadcast.ts`: `BroadcastChannel('owa-drive-{appId}')`, messages `{type:'logout'|'token', projectId, ...}`. Feature-detect; no-op where absent. Deps: T10.
13. **T13.** `src/reconcile.ts`: `reconcile(knownProjectIds)` enumerates via `indexedDB.databases()`, deletes `owa-drive-{appId}-*` DBs not in the set; **no-op (not throw) where `databases()` is unsupported** (Firefox, older Safari — same guard shape as `notesdiary/src/lib/projectRegistry.ts:68-78`). `dropProject(id)` deletes one DB eagerly. Deps: T11.

### 2b — Auth core (kills bugs 1–8, 12, 16, 17, 19)

14. **T14.** `src/gis.ts`: port `waitForGoogleIdentityServices` (planning `:126-144`) — 100ms poll, 10s timeout, typed `GisLoadError`. Deps: T8.
15. **T15.** `src/token.ts` — token record: read `expires_in` from the GIS response (**never** hardcode 3600) and record `grantedScopes` from `response.scope`. Deps: T11, T14. [R5, R6]
16. **T16.** Token client: create a FRESH `initTokenClient` per request, with per-request `resolve`/`reject` captured in the closure — no module-level `tokenClient`/`tokenResolve`/`tokenReject`. Deps: T15. [R1, R2, R4]
17. **T17.** In-flight coalescing keyed by `` `${projectId}|${sortedScopes.join(' ')}` `` in a `Map`, cleared in `finally`. Deps: T16. [R3]
18. **T18.** Acquire paths: `connect()` → `prompt:'consent'`; refresh → `prompt:'none'` + `hint: conn.email`. Non-interactive path with no usable token throws `NeedsReauthError`. Deps: T17. [R8, #17, #34]
19. **T19.** `src/errors.ts`: `DriveSyncError` base + `NeedsReauthError`, `ScopeInsufficientError`, `WrongAccountError`, `NotFoundError`, `RateLimitedError`, `TransientError`, `GisLoadError`. **Structured fields** (`status`, `reason`, `email`, `fileId`, `retryAfter`), NOT formatted message strings. Deps: T9.
20. **T20.** `connect()` / `getConnection()` / `disconnect()`. `getConnection()` returns `{email, needsReauth, expiresAt} | null` — `needsReauth` true when `conn` exists but `conn.grantedScopes` lacks a required scope, or refresh previously failed. `disconnect()` = revoke (early-return if no token, per planning `:201-206`) + clear both keys + broadcast logout. Deps: T18, T12, T19. [#16, #19]

### 2c — HTTP layer (kills bugs 7, 9, 10, 13, 15, 24)

21. **T21.** `src/http.ts`: single `driveFetch` wrapper. **Every** response goes through an `ok` check before `.json()`. Deps: T19. [R9]
22. **T22.** In `driveFetch`: 401 → clear token, retry once non-interactively, then `NeedsReauthError`. 403 + `ACCESS_TOKEN_SCOPE_INSUFFICIENT` in body → clear token, throw `ScopeInsufficientError`. Deps: T21. [R7, #13, #34]
23. **T23.** Retry policy: 429 and 5xx only, 3 attempts, exponential backoff, honor `Retry-After` when present. Never retry any other 4xx. Deps: T21. [R10, #24]
24. **T24.** `src/query.ts`: `escapeQ(s)` → replace `\` first, then `'`. Used by every `q=` builder. Deps: T8. [#14]

### 2d — Drive ops

25. **T25.** `src/files.ts`: `read(fileId)` → text/Blob, **null on 404**; `remove(fileId)`; content-agnostic `content: string | Blob` + `mimeType`. Deps: T22, T23.
26. **T26.** `write()`: update = `PATCH ...?uploadType=media`; create = `POST ...?uploadType=multipart&fields=id` with `FormData` (kills the hand-rolled boundary). Deps: T25. [R11, #21]
27. **T27.** `list()` (uses `escapeQ`) and `ensureFolderPath()` — walk the factory's `folderPath` array, find-or-create each level, return the leaf id. Library returns the id; it does not persist it. Deps: T24, T26. [#23, #28]
28. **T28.** `src/permissions.ts`: `list/grant/update/revoke`, ported from `notesdiary/src/lib/driveApi.ts:162-265` but through `driveFetch`. Fold `createAnyonePermission` into `grant({type:'anyone'|'user'})`. Deps: T22, T23.
29. **T29.** `src/refresh.ts` + `activate()`: attach `visibilitychange` and `pageshow` listeners; return a disposer. **No listeners at import time. No timer.** Warm-up fires only if `conn` exists AND (`token` missing OR within the 5-min buffer); always non-interactive. Never START while `document.hidden`; in-flight retries are allowed to finish. Deps: T18, T20. [#33]
30. **T30.** `src/index.ts`: `createDriveSync()` factory + `drive.project(id)` handle, wiring everything above. Deps: T13, T20, T27, T28, T29.

### 2e — Test harness and test migration

31. **T31.** Test setup: `vitest`, `fake-indexeddb`, `vi.stubGlobal('fetch')`, `vi.useFakeTimers`. **No MSW.** Deps: T6.
32. **T32.** `src/testing/gisFake.ts`: scriptable GIS double — queued responses, per-call capture of `prompt`/`hint`/`scope`, configurable `expires_in`/`scope`/`error`. Deps: T31.
33. **T33.** `src/testing/driveFake.ts`: in-memory Drive — folders, files, permissions; injectable status overrides (404/401/403/429/500) and `Retry-After`. Must record the exact folder-name sequence passed to `ensureFolderPath` so consumers can pin it. Deps: T31.
34. **T34.** Export both under `./testing` in the exports map; smoke test that the subpath import resolves from `dist`. Deps: T32, T33, T4.
35. **T35.** Migrate `notesdiary/src/__tests__/driveApi.test.ts` (503 lines) → library file/permission tests. Deps: T27, T28, T33.
36. **T36.** Migrate `notesdiary/src/__tests__/googleAuth-integration.test.ts` (78) → library auth tests. Deps: T20, T32.
37. **T37.** Migrate `notesdiary/src/__tests__/googleAuth-concurrentSync.test.ts` (51) → coalescing tests. Deps: T17, T32.
38. **T38.** Migrate `planning/src/lib/googleAuth.test.ts` (67, GIS-not-yet-loaded cases) → library GIS tests. Deps: T14, T32.
39. **T39.** Write regression tests **R1–R11** (see Test Cases). Deps: T30, T32, T33.
40. **T40.** Write `packages/drive-sync/SPEC.md` — 2–3 pages: the 34 decisions, storage layout, refresh state machine diagram. Descriptive byproduct; write it LAST, from the shipped code. Deps: T39.

**Acceptance — Phase 2**

- [ ] `npm -w packages/drive-sync run build` emits `dist/` with `.js` + `.d.ts`; `tsc --noEmit` clean under strict.
- [ ] Package has exactly one runtime dependency: `idb`. Zero React, zero bundler.
- [ ] All 34 behaviors have at least one passing test; R1–R11 exist by those names.
- [ ] ~700 lines of migrated tests pass in the library.
- [ ] `@open-webapp/drive-sync/testing` resolves and exports the GIS fake + in-memory Drive, and the Drive fake records the `ensureFolderPath` name sequence.
- [ ] Importing the package attaches ZERO global listeners; `activate()` attaches them and its disposer removes them (assert with a listener spy).
- [ ] No `token` or `projectId` parameter appears in any exported Drive-op signature.
- [ ] Grep for `3600`, hand-rolled boundary strings, and `tokenResolve` in `src/` returns nothing.
- [ ] `SPEC.md` exists and matches shipped behavior.

## Phase 3 — Publish `0.1.0` to public npm

Both migrations consume from the registry, so this precedes them. `npm link` covers local iteration during Phases 4 and 5.

41. **T41.** Create the npm org/scope `@open-webapp`; add an automation token as `open-webapp/owa` repo secret `NPM_TOKEN`. Deps: T1.
42. **T42.** `.github/workflows/publish.yml` — trigger on tag `drive-sync-v*`, run build + tests, `npm publish --access public --provenance`. Deps: T41, Phase 2.
43. **T43.** `npm pack` dry-run; inspect the tarball contains only `dist/` + `README` + `SPEC.md`, and that both `.` and `./testing` resolve from the packed artifact. Deps: T42.
44. **T44.** `npm version 0.1.0 -w packages/drive-sync`, tag, push, confirm the Action publishes. Deps: T43.
45. **T45.** Install-path proof: in a scratch dir outside all three repos, `npm i @open-webapp/drive-sync`, import both entrypoints, typecheck. Deps: T44.

**Acceptance — Phase 3**

- [ ] `@open-webapp/drive-sync@0.1.0` is on the public registry, ESM-only, with types.
- [ ] A clean `npm i` in an unrelated directory resolves `.` and `./testing` and typechecks.
- [ ] Release is fully tag-driven; no Changesets anywhere.

## Phase 4 — Migrate planning, in place in `open-webapp/planning`

Highest-risk phase: library swap + state-shape change + persisted-data cleanup + `sync.test.ts` rework. **Split at the 4a/4b seam** — 4a is a standalone bug fix against the current `googleAuth.ts` and is independently shippable if 4b needs to slip. The repo, its `deploy.yml`, and `https://open-webapp.github.io/planning/` are unchanged throughout.

### 4a — Token-duplication cleanup (standalone, no library involved)

> **Root-cause note.** `Project.googleAccessToken` (`src/lib/types.ts:37`) is persisted a SECOND time: `snapshotForPersist` copies `snap.projects = state.projects` into `pma_app_state_v1` (`src/lib/state.ts:151`). That copy never expires and is never touched by `clearToken`. Worse, it's the one actually used — `App.tsx:207` reads the token from state (bypassing all expiry logic) and `SettingsOverlay.tsx:90` derives `isConnected` from it. This is the root cause of the stale-account text in `syncErrors.ts:84-91`.
>
> Separately, `extractAccountDiagnostic` (`syncErrors.ts:50-54`) is **dead code** — the `(request was made as X)` producer it parses does not exist in `googleAuth.ts`; only its own test matches it.

46. **T46.** Add `authByProject: Record<string, {email: string, needsReauth: boolean}>` to `AppState`. Do NOT add it to `PERSIST_STATE_KEYS` or `PROJECT_STATE_KEYS` (`state.ts:100-130`) — it's hydrated, not persisted. Deps: none.
47. **T47.** Delete `googleAccessToken` and `googleUserEmail` from `Project` (`types.ts:37-38`). Deps: T46.
48. **T48.** Fix `App.tsx:75-76` (initial project literal) and `reducer.ts:150` (`SET_GOOGLE_TOKEN` → write `authByProject[id] = {email, needsReauth:false}`). Deps: T47.
49. **T49.** Fix `state.ts:1158` `clearProjectGoogleAuth` → delete the `authByProject` entry instead of nulling project fields. Deps: T47.
50. **T50.** Fix `App.tsx:207` — `REVOKE_GOOGLE_TOKEN` must not read a token from state; call `revokeToken(projectId)` unconditionally (it already early-returns when uncached, `googleAuth.ts:201-206`). Deps: T47.
51. **T51.** Fix `SettingsOverlay.tsx:30-34, 90-91, 100-110, 196` and `AppShell.tsx:107` to read `state.authByProject[id]` instead of `activeProject.googleAccessToken`. Note `handleConnectDrive` (`:33-38`) must now obtain its token via `getAccessToken(projectId)` rather than receiving it from state. Deps: T46, T47.
52. **T52.** One-time cleanup on boot: in `loadPersistedApp` (`state.ts:155-167`), strip `googleAccessToken`/`googleUserEmail` from every entry in the loaded `projects` array and rewrite. Idempotent, no version flag needed. **The `pma_app_state_v1` key name is frozen** — rewrite contents, never rename. Deps: T47.
53. **T53.** Hydrate `authByProject` at boot from `getAuthStatus`-equivalent per known project, and on connect/disconnect/reauth — so components render synchronously without an async read. Deps: T46, T52.
54. **T54.** Update `src/__tests__/settings.test.ts:18-19` and add a test that a persisted state containing a token comes back stripped. Deps: T52.

### 4b — Library swap

55. **T55.** `npm i @open-webapp/drive-sync@^0.1.0` in `open-webapp/planning`. For local iteration: `npm link` the workspace package from `open-webapp/owa`. **Unlink and reinstall from the registry before any commit** — a linked `node_modules` must never reach CI. Deps: T44, T53.
56. **T56.** Create `src/lib/drive.ts`: `createDriveSync({appId:'planning', clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID, folderPath:['OpenWebApp','Planning']})`. Deps: T55.
57. **T57.** Pin the `folderPath` with a test asserting the exact array `['OpenWebApp','Planning']` reaches `ensureFolderPath`. **A wrong value does not error** — it silently creates a new empty Drive folder and every existing user backup appears to vanish. Deps: T56, T34.
58. **T58.** Call `drive.activate()` once in `App.tsx` mount effect; dispose on unmount. Call `drive.reconcile(state.projects.map(p=>p.id))` right after boot hydration. Deps: T56.
59. **T59.** Rewrite `src/lib/sync.ts:541,679` — drop `getAccessToken`, call `p.files.read`/`p.files.write` directly (no token threading). Deps: T56.
60. **T60.** Keep app-side and re-point at the library: `connectDriveSync` (currently `googleAuth.ts:504-531`) moves into `src/lib/drive.ts` as an app helper over `p.ensureFolderPath()` + `p.files.write()`; `getCSVFilename`/`buildTasksCsvString` untouched in `src/lib/csv.ts`. Deps: T59.
61. **T61.** Rewrite `App.tsx:125-210` connect/revoke handlers over `p.connect()` / `p.disconnect()`. The manual `oauth2/v3/userinfo` fetch (`:127-140`) is deleted — the library returns the email. Deps: T56, T51.
62. **T62.** Delete `src/lib/googleAuth.ts` entirely (531 lines). Deps: T59, T60, T61.
63. **T63.** Shrink `src/lib/syncErrors.ts` to a `switch` over the library's typed error classes. Delete `extractFirstJsonObject` (`:15-48`) and the dead `extractAccountDiagnostic` (`:50-54`). Keep the `SERVICE_DISABLED` → activation-URL case, now reading `err.activationUrl`. Keep the honest 404 copy ("either deleted, or not accessible to the connected account") — Drive genuinely does not distinguish. Deps: T62.
64. **T64.** Update `src/lib/syncErrors.test.ts` to construct typed errors instead of raw JSON strings; delete the `extractAccountDiagnostic` test. Deps: T63.
65. **T65.** Rework `src/lib/sync.test.ts` (923 lines) — **stays in planning**, but swap the `vi.mock('./googleAuth')` at `:7` for `@open-webapp/drive-sync/testing`. All 3-way-merge assertions unchanged. Deps: T59, T34.
66. **T66.** Manual smoke against the live `open-webapp.github.io/planning/` deploy: connect, sync, disconnect, reconnect, project-switch mid-sync, delete-project → auth DB dropped, and confirm the existing `OpenWebApp/Planning` folder is reused (no new folder created). Deps: all of Phase 4.

**Acceptance — Phase 4**

- [ ] `open-webapp/planning` still deploys via its original unchanged `deploy.yml` to the same URL.
- [ ] `package.json` depends on `@open-webapp/drive-sync` from the registry; no `link:` or `file:` specifier committed.
- [ ] Grep for `googleAccessToken`, `googleUserEmail`, `extractAccountDiagnostic`, `extractFirstJsonObject` across `src/` returns zero hits.
- [ ] `src/lib/googleAuth.ts` no longer exists.
- [ ] No OAuth token is reachable from `AppState` or from `pma_app_state_v1`; a previously-persisted token is stripped on first boot after upgrade; the key name is unchanged.
- [ ] `folderPath` is pinned by a test to exactly `['OpenWebApp','Planning']`; the live app reuses the existing folder.
- [ ] `isConnected` in Settings and the sync icon in `AppShell` derive from `state.authByProject`, render synchronously, and go false when the connection is revoked.
- [ ] `syncErrors.ts` is a switch over typed error classes, under ~40 lines, with no string parsing.
- [ ] `sync.test.ts`'s 3-way-merge assertions are byte-identical apart from the mock swap; full suite green.
- [ ] Deleting a project removes its `owa-drive-planning-{id}` IndexedDB database.

## Phase 5 — Migrate notesdiary, in place in `notesdiary/app`

67. **T67.** `npm i @open-webapp/drive-sync@^0.1.x` in `notesdiary/app` (pick up whatever patch fell out of Phase 4). `npm link` for local iteration; unlink before commit. Deps: T66.
68. **T68.** Create `src/lib/drive.ts`: `createDriveSync({appId:'notesdiary', clientId, folderPath:['Notes Diary']})`. Deps: T67.
69. **T69.** Pin the `folderPath` with a test asserting exactly `['Notes Diary']` (single level, matching `driveApi.ts:6`'s existing folder name). Same silent-data-loss hazard as T57. Deps: T68, T34.
70. **T70.** `activate()` on app mount + `reconcile(await listProjects().map(p=>p.id))` after registry load. Deps: T68.
71. **T71.** Re-point all `driveApi.ts` callers at `p.files.*` / `p.permissions.*`; keep `ensureJsonExtension` (`driveApi.ts:65-71`) app-side. Delete `driveApi.ts` and `googleAuth.ts`. Deps: T68.
72. **T72.** Delete the legacy `oauth-token` key path in `metaRepo.ts:42-58` (`getOAuthToken`/`setOAuthToken`/`clearOAuthToken`) and the key itself from existing DBs on boot. **The `notes-diary-{id}` database names are frozen** — the legacy key is removed from inside them, the DBs are not renamed or recreated. Deps: T71.
73. **T73.** Wire `drive.dropProject(id)` into `projectRegistry.deleteProject` (`projectRegistry.ts:44-50`), alongside the existing `indexedDB.deleteDatabase(project.dbName)`. Deps: T68.
74. **T74.** Re-consent UX: on boot, if `getConnection()` returns `needsReauth` (recorded `grantedScopes` lacks `userinfo.email`), show a Reconnect banner. **Proactive — never wait for a 403.** Deps: T68.
75. **T75.** Delete the three migrated test files from `notesdiary/src/__tests__/` (`driveApi.test.ts`, `googleAuth-integration.test.ts`, `googleAuth-concurrentSync.test.ts`); re-point `driveFolderSelfHeal.test.tsx` and `SettingsView.test.tsx` at `@open-webapp/drive-sync/testing`. Deps: T71, T34.
76. **T76.** Manual: existing user with a `drive.file`-only grant → banner appears, one reconnect click restores sync, the existing `Notes Diary` folder is reused, no data loss. Deps: T74.

**Acceptance — Phase 5**

- [ ] `notesdiary/app` still deploys from its own unchanged workflow.
- [ ] `src/lib/driveApi.ts` and `src/lib/googleAuth.ts` no longer exist.
- [ ] The `oauth-token` key is gone from `metaRepo.ts` and removed from existing DBs on boot; `notes-diary-{id}` DB names unchanged.
- [ ] `folderPath` is pinned by a test to exactly `['Notes Diary']`; the live app reuses the existing folder.
- [ ] `deleteProject` drops both the project DB and `owa-drive-notesdiary-{id}`.
- [ ] An existing single-scope user sees a Reconnect banner before any Drive call fails, and one click restores sync.
- [ ] notesdiary's suite is green with the three files removed and the rest on `/testing`.

---

## Test cases

### Regression tests R1–R11 (library, `packages/drive-sync/src/__tests__/regressions.test.ts`)

1. **R1 — token client does not close over the first projectId.** `connect('A')` then `connect('B')`; assert B's token is written to `owa-drive-app-B` and A's stored token is unchanged.
2. **R2 — scopes honored after the first call.** `connect()` with scopes S1, then a call requiring S2; assert the second `initTokenClient` receives S2, not S1.
3. **R3 — in-flight coalescing is keyed.** Concurrent `getToken('A')` and `getToken('B')` → two GIS requests, each resolving with its own token. Concurrent `getToken('A')` × 3 with identical scopes → exactly one GIS request, three identical resolutions.
4. **R4 — concurrent resolvers do not clobber.** Two overlapping token requests for different projects; assert BOTH promises settle (the old code left the first pending forever).
5. **R5 — expiry from `expires_in`.** GIS returns `expires_in: 120`; assert stored `expiresAt ≈ now + 120s`, not `now + 3600s`.
6. **R6 — `grantedScopes` recorded.** GIS returns `scope: 'drive.file'` only; assert stored `grantedScopes`, and that `getConnection().needsReauth === true` **without any network call**.
7. **R7 — 401 handling.** Drive returns 401 → token cleared, one silent retry, then `NeedsReauthError` (not a raw fetch error). Interactive path re-prompts instead.
8. **R8 — `hint` on silent refresh.** After connecting as `a@x.com`, trigger a refresh; assert the GIS call carried `prompt:'none'` and `hint:'a@x.com'`. Then have the fake return a token for `b@x.com` and assert `WrongAccountError`.
9. **R9 — `response.ok` checked everywhere.** Every Drive op, given a 500 with an HTML body, throws a typed error; none returns an object with `id: undefined`.
10. **R10 — retry policy.** 429 with `Retry-After: 2` → retried after 2s (fake timers), succeeds on attempt 2. Three consecutive 500s → `TransientError` after exactly 3 attempts. A 400 → thrown immediately, zero retries.
11. **R11 — multipart is FormData.** Write content containing the literal old boundary string `===============7330845974216740156==`; assert the upload body is a `FormData` and the round-tripped content is byte-identical.

### Storage / lifecycle (library)

12. Expiry deletes ONLY `token`; `conn` survives → `getConnection()` still returns the email with `needsReauth` reflecting refresh state.
13. `disconnect()` clears both keys, POSTs revoke, and broadcasts logout; early-returns the revoke POST when no token is cached.
14. Cross-tab: a `logout` broadcast in tab A clears tab B's in-memory handle; a `token` broadcast lets tab B skip its own GIS request.
15. `reconcile(['p1'])` with DBs for `p1`,`p2`,`p3` deletes exactly `p2`,`p3`.
16. `reconcile` where `indexedDB.databases` is undefined → resolves, deletes nothing, does not throw.
17. `dropProject('p1')` deletes `owa-drive-app-p1` and evicts the cached handle.
18. Importing the module attaches no listeners; `activate()` attaches `visibilitychange` + `pageshow`; the disposer removes both.
19. Refresh guard: no `conn` → no warm-up. `conn` + fresh token → no warm-up. `conn` + token within the 5-min buffer → exactly one non-interactive warm-up.
20. `visibilitychange` to hidden never STARTS a refresh; a refresh already retrying when the tab hides is allowed to finish.

### Drive ops (library)

21. `read()` returns `null` on 404 (documented ambiguity: Drive 404s for both a wrong id and a wrong account).
22. `ensureFolderPath(['OpenWebApp','Planning'])` finds existing at both levels; creates only the missing level; nests correctly.
23. `escapeQ` — a name containing `'` and one containing `\` and one containing both produce a valid `q=`; assert backslash is escaped BEFORE the quote.
24. `write()` with a `Blob` and with a `string`, each with an explicit `mimeType`; create vs. update paths both round-trip.
25. Permissions: `list`/`grant(user)`/`grant(anyone)`/`update`/`revoke` against the in-memory fake.
26. Non-interactive Drive call with an expired token and no refresh possible → `NeedsReauthError`; the same call with `interactive:true` prompts.
27. The Drive fake records the exact folder-name sequence handed to `ensureFolderPath`, so consumers can assert on it (backs cases 33 and 37).

### planning (`open-webapp/planning`)

28. `sync.test.ts` — all existing 3-way-merge cases pass unchanged against `@open-webapp/drive-sync/testing`.
29. `loadPersistedApp` strips `googleAccessToken`/`googleUserEmail` from persisted projects; running it twice is a no-op; the `pma_app_state_v1` key name is unchanged.
30. `snapshotForPersist` output contains no token field for any project.
31. `authByProject` hydrates at boot; `SettingsOverlay` `isConnected` and `AppShell`'s sync icon follow it, and both go false after disconnect with no re-render lag.
32. `syncErrors.ts` maps each typed error class to its user-facing message; `SERVICE_DISABLED` still yields an `actionUrl`.
33. **`folderPath` pin.** The app's `createDriveSync` call and the resulting `ensureFolderPath` sequence are exactly `['OpenWebApp','Planning']`. Deep-equal on the array, not a substring match. Rationale: a wrong value is silent — it creates a fresh empty folder and every existing backup looks lost.

### notesdiary (`notesdiary/app`)

34. `deleteProject` drops both the project DB and the library auth DB.
35. Boot with a `drive.file`-only recorded grant → `needsReauth`, banner shown, zero network calls made to detect it.
36. Legacy `oauth-token` key removed from an existing meta store on boot; the `notes-diary-{id}` DB itself survives with its entries intact.
37. **`folderPath` pin.** The app's `createDriveSync` call and the resulting `ensureFolderPath` sequence are exactly `['Notes Diary']` — one level, matching the existing folder name at `driveApi.ts:6`.

### Manual (no automated harness)

38. Phase 4: full connect → sync → disconnect → reconnect cycle on the real Drive, against the live `open-webapp.github.io/planning/` deploy; existing `OpenWebApp/Planning` folder reused. (T66)
39. Phase 5: real notesdiary account with the old narrow grant re-consents in one click, existing `Notes Diary` folder reused, no entry loss. (T76)

---

## Notes / accepted tradeoffs

1. **Neither app moves repos, and `npm link` is why that's cheap.** The library is plain TypeScript + `idb` with NO React, so there is no duplicate-React hazard and `npm link` is safe for local iteration during both migrations. That removes the publish-friction argument that would have justified co-locating planning in the monorepo. Moving planning would have cost a cross-repo deploy key, a `VITE_GOOGLE_CLIENT_ID` secret migration, deleting the old workflow, neutering old `main`, and a git history import — all to create a permanent split-brain between the source repo and the deploy repo. Not worth it.
2. **No in-repo canary until app #3.** The monorepo's `apps/*` is empty, so `0.1.0` ships exercised only by the library's own tests. planning's migration (Phase 4) is the first true integration; expect a `0.1.x` or two to fall out of it. Accepted — that's precisely why Phase 4 precedes Phase 5, so notesdiary consumes a version that has met a real app.
3. **Three identifiers are frozen and must not change.** (a) `pma_app_state_v1` — the cleanup rewrites its contents, never its key name. (b) notesdiary's `notes-diary-{id}` database names — the legacy `oauth-token` key is deleted from inside them; the DBs are not renamed or recreated. (c) The two `folderPath` values, `['OpenWebApp','Planning']` and `['Notes Diary']` — pinned by tests 33 and 37.
4. **notesdiary will have TWO IndexedDB databases per project** — its own `notes-diary-{id}` plus the library's `owa-drive-notesdiary-{id}`. Accepted: the alternative (injecting storage) would put the library's correctness at the mercy of each app's schema-version bumps, which is exactly the coupling this extraction exists to remove.
5. **"List all connected projects" costs N database opens.** `indexedDB.databases()` is unsupported in Firefox and older Safari, so `reconcile` degrades to a no-op there and any enumeration must be driven by the app's own project list. Consequence: on those browsers, orphaned auth DBs from deleted projects are never reclaimed unless `dropProject` was called eagerly. That's why `dropProject` in `deleteProject` (T73) is the primary path and `reconcile` is only the safety net.
6. **`read()` returning `null` on 404 hides the wrong-account case.** Drive returns 404 both for a nonexistent id and for a file the authenticated account cannot see. The library cannot distinguish them, so the app's message must stay honest about both (preserved in T63).
7. **The spec is descriptive, not normative.** `SPEC.md` is written last (T40) from shipped behavior. If spec and code disagree, the code wins and the spec gets fixed.
8. **No token migration.** The scope change from `drive.file` to `drive.file + userinfo.email` invalidates every currently stored token in both apps. Reading old storage would buy nothing.
9. **Phase 4a is independently shippable.** If the library swap slips, the token-duplication fix (T46–T54) can land on its own against the current `googleAuth.ts` and still fixes the stale-account bug.

## Risks / open judgment calls

1. **A linked `node_modules` reaching a commit is the main new footgun.** `npm link` during Phases 4 and 5 must be undone before committing; a `link:`/`file:` specifier in `package.json` would break both apps' CI builds and, worse, could ship a stale local build. T55 and T67 both call this out; the acceptance criteria check for it.
2. **`sync.test.ts` rework (T65) is the largest single unknown.** 923 lines currently mock `./googleAuth` at `:7` with a flat `getAccessToken` mock. If the suite reaches deeper into that mock than the single line suggests, T65 could balloon well past 30 minutes and should be split per-describe-block at implementation time.
3. **Wrong-account detection is best-effort.** `hint` is a hint, not a constraint — GIS can still return a different account under some multi-login states. R8 asserts we detect and throw, not that we prevent it.
4. **`response.scope` shape from GIS is not fully pinned.** T15 assumes a space-delimited string. Verify against a real GIS response before finalizing `grantedScopes` comparison logic in T20; a wrong parse silently makes `needsReauth` always true (annoying) or always false (breaks Phase 5's proactive banner).
5. **`0.1.0` is exposed before any app has exercised it.** Deliberate — see tradeoff 2 — but do not treat `0.1.0` as stable. Expect breaking tweaks in `0.2.0` after Phase 5.
6. **The `folderPath` failure mode is silent, not loud.** Tests 33 and 37 are the only guard. If either app's factory call is ever edited, those tests must be treated as data-loss protection, not style checks.
