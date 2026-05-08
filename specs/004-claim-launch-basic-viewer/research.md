# Research: Claim Launches Basic Viewer + Deterministic TxUID Refactor

**Feature**: `004-claim-launch-basic-viewer`
**Phase**: 0 — Research & Decisions
**Date**: 2026-05-07 (updated; originally 2026-05-06)

## Decision Log

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Integration point | Add `onClaimSuccess?: (uid: string) => void` to `useWorkitemActions` | Keeps navigation in the component (which owns `navigate`, `appConfig`, `filterValues`); keeps the hook testable without mocking react-router-dom |
| Route identification | Find mode by `routeName === 'viewer'` in `appConfig.loadedModes` | Longitudinal mode (`modes/longitudinal/src/index.ts`) is the Basic Viewer (`displayName: 'Basic Viewer'`, `routeName: 'viewer'`). Stable identifier used by all existing mode-launch buttons |
| Fallback (mode absent) | Stay on worklist + `uiNotificationService.show` info notification | Matches existing error-handling style; avoids silent 404 navigation |
| URL construction | Mirror existing mode-launch button pattern exactly | `filterValues.configUrl`, `StudyInstanceUIDs`, `returnTo=/workitems`, `preserveQueryParameters(query)` — all already in scope in `WorkItemsList.tsx` |
| Missing Study Instance UID | No navigation; success notification already shown by claim | FR-004 requirement; workitem still transitions to IN PROGRESS |
| New dependencies | None | Change confined to two existing files + one test file |
| Files changed | `useWorkitemActions.ts`, `WorkItemsList.tsx`, `useWorkitemActions.test.ts` | Minimal surface area; no new files, no new routes, no new services |
| TxUID derivation | Deterministic SHA-256 (first 16 bytes → 128-bit int → `2.25.<decimal>`) | Eliminates localStorage dependency for txUID; same UID re-derived on demand per session and across sessions |
| `performerAeTitle` required | Blocked with error notification if absent | No fallback needed once deterministic; simpler than keeping old chain |
| `ups_txuid_*` localStorage | Removed | txUID now derived, not stored |
| `ups_startdt_*` localStorage | Retained | Start-datetime is a one-time wall-clock event; cannot be re-derived |
| `resolveTxUID` removal | Removed from hook | Replaced by inline `await generateDicomUidFromInstanceAndStation(...)` |
| `claimedWorkitemsRef` removal | Removed from hook | No longer needed; txUID derived on demand |
| jsdom polyfill | `TextEncoder` + `crypto.subtle` injected in `beforeAll` | jsdom doesn't expose WebCrypto; Node.js `crypto` module provides `.subtle` |

## Background Research

### Basic Viewer Route

`modes/longitudinal/src/index.ts` registers the mode with:
```ts
routeName: 'viewer',
displayName: i18n.t('Modes:Basic Viewer'),
```
The existing worklist already navigates to `/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems`
via the mode-launch buttons in the expanded row. This feature replicates that
exact URL shape but triggers it automatically on claim success.

### `useWorkitemActions` Hook — Current State (after Phase 1)

The `claim` function:
1. Derives `txUID` via `generateDicomUidFromInstanceAndStation(uid, performerAeTitle)` (or random UUID fallback when no station name — **this fallback is now removed per clarification Q2**)
2. Calls `dataSource.store.changeState(uid, 'IN PROGRESS', txUID)`
3. Records claim start-datetime in memory + `ups_startdt_*` localStorage
4. Calls `uiNotificationService.show(...)` success notification
5. Calls `onRefresh()`
6. Calls `onClaimSuccess?.(uid)` → triggers viewer navigation
7. On any failure: shows error notification, does NOT re-throw

`complete()` and `cancel()` still use `resolveTxUID()` — this is the remaining work.

### TxUID Deterministic Algorithm

```ts
async function generateDicomUidFromInstanceAndStation(
  instanceUID: string,
  stationName: string
): Promise<string> {
  const input = `${instanceUID}|${stationName.trim()}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hashBuffer).slice(0, 16);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return `2.25.${n.toString(10)}`;
}
```

Test vector: `generateDicomUidFromInstanceAndStation('workitem-uid-001', 'WORKLIST_SCU')`
→ `'2.25.261487955094107788825981291489004302396'`

### `resolveTxUID` Callers

Confirmed via grep: `resolveTxUID` is only called within `useWorkitemActions.ts`
at two sites — `complete()` (line 252) and `cancel()` (line 330). No external callers.

### URL Construction (Existing Pattern)

```ts
// From WorkItemsList.tsx ~line 511-516
const query = new URLSearchParams();
if (filterValues.configUrl) query.append('configUrl', filterValues.configUrl);
query.append('StudyInstanceUIDs', studyInstanceUid);
query.append('returnTo', '/workitems');
preserveQueryParameters(query);
navigate(`/${mode.routeName}${dataPath || ''}?${query.toString()}`);
```

### `studyInstanceUid` Resolution

The `workitemToStudyRow` mapping in `DicomWebUpsDataSource/index.ts` maps DICOM
tag `0020000D` → `studyInstanceUid`. The `workitems` array in `WorkItemsList` is
already typed with this field.

### Testing Approach

`useWorkitemActions.test.ts` uses `renderHook` + `act` from `@testing-library/react`.
The existing `resolveTxUID` describe block (T028) will be reworked:
- Tests that set `PERSISTED_TX_UID` via localStorage become tests that verify
  the deterministic UID is computed and passed to `changeState`/`updateWorkitem`.
- Tests for "no txUID → error notification" become tests for "no `performerAeTitle`
  → error notification, no network call".

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Wrap `claim` in `WorkItemsList` directly (no hook change) | `claim` catches errors silently; caller cannot distinguish success from failure |
| Add navigation inside `useWorkitemActions` | Hook would need `navigate` + `appConfig` injected, coupling it to routing |
| Global event bus | Overkill for a single callback |
| Keep `resolveTxUID` + localStorage for fallback | Unnecessary complexity once deterministic derivation covers all cases |
| Remove `ups_startdt_*` entries | Removes the only record of original claim timestamp; breaks `complete()` DICOM conformance |

| Integration point | Add `onClaimSuccess?: (uid: string) => void` to `useWorkitemActions` | Keeps navigation in the component (which owns `navigate`, `appConfig`, `filterValues`); keeps the hook testable without mocking react-router-dom |
| Route identification | Find mode by `routeName === 'viewer'` in `appConfig.loadedModes` | Longitudinal mode (`modes/longitudinal/src/index.ts`) is the Basic Viewer (`displayName: 'Basic Viewer'`, `routeName: 'viewer'`). Stable identifier used by all existing mode-launch buttons |
| Fallback (mode absent) | Stay on worklist + `uiNotificationService.show` info notification | Matches existing error-handling style; avoids silent 404 navigation |
| URL construction | Mirror existing mode-launch button pattern exactly | `filterValues.configUrl`, `StudyInstanceUIDs`, `returnTo=/workitems`, `preserveQueryParameters(query)` — all already in scope in `WorkItemsList.tsx` |
| Missing Study Instance UID | No navigation; success notification already shown by claim | FR-004 requirement; workitem still transitions to IN PROGRESS |
| New dependencies | None | Change confined to two existing files + one test file |
| Files changed | `useWorkitemActions.ts`, `WorkItemsList.tsx`, `useWorkitemActions.test.ts` | Minimal surface area; no new files, no new routes, no new services |

## Background Research

### Basic Viewer Route

`modes/longitudinal/src/index.ts` registers the mode with:
```ts
routeName: 'viewer',
displayName: i18n.t('Modes:Basic Viewer'),
```
The existing worklist already navigates to `/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems`
via the mode-launch buttons in the expanded row. This feature replicates that
exact URL shape but triggers it automatically on claim success.

### `useWorkitemActions` Hook

The `claim` function:
1. Calls `dataSource.store.changeState(uid, 'IN PROGRESS', txUID)`
2. Stores txUID in memory + localStorage
3. Sets `PerformedProcedureStepStartDateTime` (best-effort)
4. Calls `uiNotificationService.show(...)` success notification
5. Calls `onRefresh()`
6. On any failure: shows error notification, does NOT re-throw

Because claim catches all errors silently, the caller cannot detect success/failure.
An `onClaimSuccess` callback added to the hook options is therefore the correct
extension point — it is called only when step 1 succeeds.

### URL Construction (Existing Pattern)

```ts
// From WorkItemsList.tsx ~line 511-516
const query = new URLSearchParams();
if (filterValues.configUrl) query.append('configUrl', filterValues.configUrl);
query.append('StudyInstanceUIDs', studyInstanceUid);
query.append('returnTo', '/workitems');
preserveQueryParameters(query);
navigate(`/${mode.routeName}${dataPath || ''}?${query.toString()}`);
```

The new claim handler will produce an identical URL shape, with
`mode.routeName === 'viewer'`.

### `studyInstanceUid` Resolution

The `workitemToStudyRow` mapping in `DicomWebUpsDataSource/index.ts` maps DICOM
tag `0020000D` → `studyInstanceUid`. The `workitems` array in `WorkItemsList` is
already typed with this field. The claim handler looks up the workitem from the
`workitems` prop by UID to retrieve its `studyInstanceUid`.

### Testing Approach

`useWorkitemActions.test.ts` (455 lines) uses `renderHook` + `act` from
`@testing-library/react`. The `onClaimSuccess` callback is a simple Jest mock
passed to the hook options — no additional setup needed.

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Wrap `claim` in `WorkItemsList` directly (no hook change) | `claim` catches errors silently, so caller cannot distinguish success from failure |
| Add navigation inside `useWorkitemActions` itself | Hook would need `navigate` + `appConfig` injected, coupling it to routing — violates single responsibility |
| Global event bus / custom event | Overkill for a single callback; adds indirection with no benefit |
| `onClaimSuccess` carrying the `studyInstanceUid` directly | The hook does not know about `studyInstanceUid` (it only knows `workitemUID`); the lookup should remain in the component which has the full workitem row |
