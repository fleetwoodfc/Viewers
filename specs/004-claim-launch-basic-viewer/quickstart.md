# Quickstart: Claim Launches Basic Viewer + Deterministic TxUID

**Feature**: `004-claim-launch-basic-viewer`
**Date**: 2026-05-07 (updated; originally 2026-05-06)

---

## Key Files

| File | Change |
|------|--------|
| `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts` | txUID refactor: remove `resolveTxUID`, `claimedWorkitemsRef`, `storageKey`, `uuidToDicomUID`; update `complete()`/`cancel()` to derive txUID deterministically; guard on missing `performerAeTitle` |
| `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx` | (already done) Pass `onClaimSuccess` to hook; implement viewer navigation callback |
| `platform/app/src/routes/WorkItemsList/useWorkitemActions.test.ts` | Update T028 tests: replace localStorage-based txUID tests with deterministic derivation tests; add missing-station-name guard tests |

---
## Running the App in Dev mode

```bash
  APP_CONFIG=config/default.js \
  PROXY_TARGET=http://192.168.1.12:8080 \
  PROXY_DOMAIN=http://192.168.1.12:8080 \
  PROXY_PATH_REWRITE_FROM=/ups \
  PROXY_PATH_REWRITE_TO= \
  yarn run dev

## Running the App

```bash
cd /workspaces/Viewers
yarn dev
# Open http://localhost:3000/workitems
# Requires performerAeTitle: 'WORKLIST_SCU' in the UPS data source config (already set in default.js)
```

---

## Running Tests

```bash
cd /workspaces/Viewers
yarn jest platform/app/src/routes/WorkItemsList/useWorkitemActions --passWithNoTests --no-coverage
```

---

## Feature Walk-Through

### Happy path (workitem has Study Instance UID)

1. Load the worklist at `/workitems`.
2. Locate a SCHEDULED workitem with a study reference (`studyInstanceUid` non-empty).
3. Click **Claim**.
4. The workitem transitions to IN PROGRESS.
5. The browser navigates immediately to:
   ```
   /viewer?StudyInstanceUIDs=<studyInstanceUid>&returnTo=%2Fworkitems
   ```
6. Click **Return to Worklist** to go back. The worklist opens with the same filter state.

### Complete a claimed workitem

1. From the worklist, find the IN PROGRESS workitem.
2. Click **Complete**.
3. The hook re-derives the Transaction UID (`generateDicomUidFromInstanceAndStation`) — no localStorage lookup needed.
4. `updateWorkitem` + `changeState(COMPLETED)` are called.
5. The start-datetime read from `ups_startdt_<uid>` is included in the SQ.

### Missing station name

If `performerAeTitle` is not set in the UPS data source configuration, any
claim/complete/cancel attempt shows an error toast:
> "Station name not configured — cannot perform this action."

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Claim succeeds but no navigation | `studyInstanceUid` is empty | Expected — workitem has no study reference |
| "Viewer Not Available" info toast | Basic Viewer mode not in `loadedModes` | Ensure longitudinal mode is registered in app config |
| "Station name not configured" error | `performerAeTitle` absent in data source config | Add `performerAeTitle: 'YOUR_AE_TITLE'` to the UPS data source in `default.js` |
| `complete()` uses wrong start-datetime | `ups_startdt_<uid>` cleared or unavailable | The fallback uses completion time; check localStorage isn't being cleared between claim and complete |
| Tests fail: TextEncoder is not defined | jsdom polyfill missing | Ensure `beforeAll` injects `TextEncoder` from `require('util')` |


---

## Key Files

| File | Change |
|------|--------|
| `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts` | Add `onClaimSuccess?: (uid: string) => void` option; call it on claim success |
| `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx` | Pass `onClaimSuccess` to hook; implement navigation callback |
| `platform/app/src/routes/WorkItemsList/useWorkitemActions.test.ts` | Add 3 test cases for `onClaimSuccess` behaviour |

---

## Running the App

```bash
cd /workspaces/Viewers
yarn dev
# Open http://localhost:3000/workitems
```

---

## Running Tests

```bash
# Run just the affected test file
yarn jest src/routes/WorkItemsList/useWorkitemActions --passWithNoTests

# Run all WorkItemsList tests
yarn jest src/routes/WorkItemsList --passWithNoTests
```

---

## Feature Walk-Through

### Happy path (workitem has Study Instance UID)

1. Load the worklist at `/workitems`.
2. Locate a SCHEDULED workitem whose row shows a study date/patient name (meaning
   it has a `studyInstanceUid`).
3. Click **Claim**.
4. The workitem transitions to IN PROGRESS (row colour changes to yellow).
5. The browser immediately navigates to the Basic Viewer:
   ```
   /viewer?StudyInstanceUIDs=<uid>&returnTo=%2Fworkitems
   ```
6. The viewer loads the referenced study.
7. Click the **Return to Worklist** affordance (or navigate to `/workitems`) to
   go back. The worklist opens with the same filter state as before.

### No Study Instance UID path

1. Claim a workitem whose row shows no study date (no study reference yet).
2. The workitem transitions to IN PROGRESS.
3. A success toast appears: *"Workitem Claimed — The workitem is now IN PROGRESS."*
4. No navigation occurs — the user stays on the worklist.

### Claim failure

1. Claim a workitem that is already IN PROGRESS (or network failure).
2. An error toast appears.
3. No navigation occurs.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Claim succeeds but no navigation | `studyInstanceUid` is empty on the workitem | Expected behaviour — the workitem has no study reference |
| "Viewer Not Available" info toast | Basic Viewer mode not in `appConfig.loadedModes` | Ensure the longitudinal mode is registered in the app config |
| Returns to worklist without filter state | `preserveQueryParameters` not called | Verify the `preserveQueryParameters(query)` call is present in the handler |
| Tests fail: `onClaimSuccess is not a function` | Old hook type cached | Restart TypeScript server and re-run tests |
