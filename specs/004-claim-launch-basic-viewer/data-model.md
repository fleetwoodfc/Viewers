# Data Model: Claim Launches Basic Viewer + Deterministic TxUID Refactor

**Feature**: `004-claim-launch-basic-viewer`
**Phase**: 1 — Design
**Date**: 2026-05-07 (updated; originally 2026-05-06)

## Entities

### Modified: `UseWorkitemActionsOptions` (in `useWorkitemActions.ts`)

| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `dataSource` | `any` | existing | UPS-RS data source |
| `onRefresh` | `() => void` | existing | Refresh worklist after action |
| `uiNotificationService` | `{ show }` | existing | Toast notifications |
| `performerAeTitle` | `string \| undefined` | existing | AE title for DICOM codes; **effectively required** — all state-change operations block with error notification if absent |
| **`onClaimSuccess`** | `(uid: string) => void \| undefined` | **NEW (phase 1)** | Called after successful claim; receives the workitem UID |

### Unchanged: `UseWorkitemActionsReturn`

No change to the returned interface — `claim`, `complete`, `cancel`, `reject` retain
their existing signatures.

### Removed: `claimedWorkitemsRef` / `storageKey` / `resolveTxUID`

| Symbol | Removed | Reason |
|--------|---------|--------|
| `claimedWorkitemsRef` | Yes | In-memory txUID cache no longer needed |
| `storageKey(uid)` | Yes | `ups_txuid_*` keys no longer written |
| `resolveTxUID(uid)` | Yes | Replaced by inline `await generateDicomUidFromInstanceAndStation(...)` |
| `uuidToDicomUID(uuid)` | Yes | Random UUID fallback removed; `performerAeTitle` required |

### Retained: `claimStartDTsRef` / `startDtKey` / `resolveStartDT`

| Symbol | Retained | Reason |
|--------|----------|--------|
| `claimStartDTsRef` | Yes | In-memory cache for claim start-datetime |
| `startDtKey(uid)` | Yes | `ups_startdt_*` localStorage keys still written at claim time |
| `resolveStartDT(uid, fallback)` | Yes | Used by `complete()` to re-send start-datetime in SQ |

### Added: `generateDicomUidFromInstanceAndStation`

Module-level async function (already implemented in `claim()`; now also called by
`complete()` and `cancel()`):

```
Input:  instanceUID: string, stationName: string
Output: Promise<string>  — "2.25.<decimal>" DICOM UID
Algorithm: SHA-256("instanceUID|stationName.trim()") → first 16 bytes → 128-bit int → decimal
```

### localStorage Key Inventory (post-refactor)

| Key pattern | Written | Read | Deleted | Purpose |
|-------------|---------|------|---------|---------|
| `ups_txuid_<uid>` | ~~claim~~ | ~~complete/cancel~~ | ~~complete/cancel~~ | **REMOVED** |
| `ups_startdt_<uid>` | claim | complete | complete/cancel | Claim start-datetime |

### Unchanged: Workitem row shape (`workitemToStudyRow` output)

The `studyInstanceUid` field (from DICOM tag `0020000D`) is already present on
every workitem row.

## State Transitions

```
Claim button clicked
     │
     ▼
claim(uid) called
     │
     ├── performerAeTitle absent ──► error notification "Station name not configured"
     │                                no network call, no state change
     │
     ├── success ──► Transaction UID derived on demand (no storage)
     │                PerformedProcedureStepStartDateTime stored (memory + ups_startdt_*)
     │                Success notification shown
     │                onRefresh() called
     │                onClaimSuccess?.(uid)
     │                     │
     │                     ├── studyInstanceUid present AND viewer mode found
     │                     │       └── navigate(`/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems&...`)
     │                     │
     │                     ├── studyInstanceUid absent / empty
     │                     │       └── (no navigation — user stays on worklist)
     │                     │
     │                     └── viewer mode NOT in loadedModes
     │                             └── info notification + no navigation
     │
     └── failure ──► Error notification shown, no state change, no navigation

complete(uid) / cancel(uid) called
     │
     ├── performerAeTitle absent ──► error notification "Station name not configured"
     │                                no network call
     │
     └── success ──► txUID = await generateDicomUidFromInstanceAndStation(uid, performerAeTitle)
                      startDT = resolveStartDT(uid, completionDT)
                      updateWorkitem(...) → changeState(...)
                      ups_startdt_* removed from localStorage on success
```

## Value Formatting / URL Shape

```
/viewer[dataPath]?StudyInstanceUIDs=<studyInstanceUid>&returnTo=/workitems[&configUrl=<url>][&<preserved-params>]
```

| Parameter | Source | Condition |
|-----------|--------|-----------|
| `StudyInstanceUIDs` | `workitem.studyInstanceUid` | Always (guard ensures non-empty) |
| `returnTo` | Hard-coded `/workitems` | Always |
| `configUrl` | `filterValues.configUrl` | Only when non-empty |
| preserved query params | `preserveQueryParameters(query)` | Always |
| `dataPath` path segment | `dataPath` prop | Appended only when non-empty |


| Field | Type | Change | Description |
|-------|------|--------|-------------|
| `dataSource` | `any` | existing | UPS-RS data source |
| `onRefresh` | `() => void` | existing | Refresh worklist after action |
| `uiNotificationService` | `{ show }` | existing | Toast notifications |
| `performerAeTitle` | `string \| undefined` | existing | AE title for DICOM codes |
| **`onClaimSuccess`** | `(uid: string) => void \| undefined` | **NEW** | Called after successful claim; receives the workitem UID |

### Unchanged: `UseWorkitemActionsReturn`

No change to the returned interface — `claim` still has signature `(uid: string) => Promise<void>`.

### Unchanged: Workitem row shape (`workitemToStudyRow` output)

The `studyInstanceUid` field (from DICOM tag `0020000D`) is already present on
every workitem row. The navigation callback reads it from the `workitems` prop in
`WorkItemsList`.

## State Transitions

```
Claim button clicked
     │
     ▼
claim(uid) called
     │
     ├── success ──► Transaction UID stored (memory + localStorage)
     │                PerformedProcedureStepStartDateTime set (best-effort)
     │                Success notification shown
     │                onRefresh() called
     │                onClaimSuccess?.(uid)  ◄── NEW call
     │                     │
     │                     ├── studyInstanceUid present AND viewer mode found
     │                     │       └── navigate(`/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems&...`)
     │                     │
     │                     ├── studyInstanceUid absent / empty
     │                     │       └── (no navigation — user stays on worklist)
     │                     │
     │                     └── viewer mode NOT in loadedModes
     │                             └── info notification + no navigation
     │
     └── failure ──► Error notification shown, no state change, no navigation
```

## Value Formatting / URL Shape

```
/viewer[dataPath]?StudyInstanceUIDs=<studyInstanceUid>&returnTo=/workitems[&configUrl=<url>][&<preserved-params>]
```

Parameters:
| Name | Source | Condition |
|------|--------|-----------|
| `StudyInstanceUIDs` | `workitem.studyInstanceUid` | Always present (guard ensures non-empty) |
| `returnTo` | Hard-coded `/workitems` | Always |
| `configUrl` | `filterValues.configUrl` | Only when non-empty |
| preserved query params | `preserveQueryParameters(query)` | Always (function is idempotent) |
| `dataPath` path segment | `dataPath` prop | Appended to route only when non-empty |

## No New Data Stored

This feature does not introduce new `localStorage` keys, new service state, or
new DICOM network requests beyond those already triggered by `claim()`.
