---
description: "Task list for 004-claim-launch-basic-viewer"
---

# Tasks: Claim Launches Basic Viewer + Deterministic TxUID Refactor

**Input**: Design documents from `/specs/004-claim-launch-basic-viewer/`
**Branch**: `004-claim-launch-basic-viewer`
**Source root**: `platform/app/src/routes/WorkItemsList/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Tasks marked `[X]` are already implemented.

---

## Phase 1: Setup ✅

**Purpose**: Extend the `UseWorkitemActionsOptions` interface with the new optional callback.

- [X] T001 Add `onClaimSuccess?: (uid: string) => void` to `UseWorkitemActionsOptions` interface and destructure it in the `useWorkitemActions` function body in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`

**Checkpoint**: TypeScript compiles; existing callers without `onClaimSuccess` pass type-check unchanged.

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Call `onClaimSuccess` inside `claim()` after all success-path side-effects complete.

- [X] T002 Call `onClaimSuccess?.(uid)` inside the `claim` callback immediately after `onRefresh()` (success path only, inside the `try` block after the success notification) in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`

**Checkpoint**: `onClaimSuccess` is called with the workitem UID on every successful claim; never called on failure.

---

## Phase 3: User Story 1 — Claim Workitem and Open Basic Viewer (Priority: P1) 🎯 MVP ✅

**Goal**: After a successful claim on a workitem with a Study Instance UID, the browser navigates to the Basic Viewer loaded with that study.

**Independent Test**: Click Claim on a SCHEDULED workitem with a Study Instance UID. The browser navigates to `/viewer?StudyInstanceUIDs=<uid>&returnTo=%2Fworkitems`. Clicking back returns to the worklist.

- [X] T003 [US1] Implement `onClaimSuccess` callback in `WorkItemsList.tsx`: look up the workitem row by `uid` from the `workitems` prop array, extract `studyInstanceUid`; if absent or empty, return early in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`
- [X] T004 [US1] Inside `onClaimSuccess`: find Basic Viewer mode via `appConfig.loadedModes?.find(m => m.routeName === 'viewer')`; if not found, call `uiNotificationService.show` info notification and return in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`
- [X] T005 [US1] Inside `onClaimSuccess`: build `URLSearchParams` with `StudyInstanceUIDs`, `returnTo=/workitems`, `configUrl` (when present in `filterValues`), call `preserveQueryParameters(query)`, then `navigate(`/${viewerMode.routeName}${dataPath || ''}?${query.toString()}`)` in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`
- [X] T006 [US1] Pass `onClaimSuccess` to the `useWorkitemActions` call in `WorkItemsList.tsx` in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`
- [X] T007 [P] [US1] Unit test T-CS-01: `onClaimSuccess` called with correct workitem UID after successful claim in `platform/app/src/routes/WorkItemsList/useWorkitemActions.test.ts`
- [X] T008 [P] [US1] Unit test T-CS-02: `onClaimSuccess` NOT called when `changeState` rejects in `platform/app/src/routes/WorkItemsList/useWorkitemActions.test.ts`
- [X] T009 [P] [US1] Unit test T-CS-03: omitting `onClaimSuccess` does not throw when claim succeeds in `platform/app/src/routes/WorkItemsList/useWorkitemActions.test.ts`

**Checkpoint**: All tests pass; clicking Claim in the browser navigates to the Basic Viewer.

---

## Phase 4: User Story 2 — Claim With No Study Reference (Priority: P2) ✅

**Goal**: Claiming a workitem with no `studyInstanceUid` succeeds and shows success toast but does NOT navigate.

**Independent Test**: Claim a workitem with no Study Instance UID → row goes IN PROGRESS, toast appears, URL stays `/workitems`.

- [X] T010 [US2] Verify early-return guard covers both `undefined`/`null` and empty-string `studyInstanceUid` with `if (!studyInstanceUid) return;` in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`

**Checkpoint**: Claiming a no-study workitem shows only success toast and does not call `navigate`.

---

## Phase 5: User Story 3 — Return to Worklist (Priority: P3) ✅

**Goal**: `returnTo=/workitems` in the viewer URL enables back-navigation. Filter parameters are preserved.

**Independent Test**: Viewer URL contains `returnTo=%2Fworkitems`; activating the viewer's return affordance lands on `/workitems` with previous filters intact.

- [X] T011 [US3] Verify `returnTo=/workitems` is appended by the URL builder in T005 and `preserveQueryParameters(query)` is called in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`

**Checkpoint**: Viewer URL always contains `returnTo=%2Fworkitems`; returning from viewer restores worklist filters.

---

## Phase 6: Deterministic TxUID Refactor 🔧

**Goal**: Replace `resolveTxUID` + localStorage txUID fallback with on-demand derivation via `generateDicomUidFromInstanceAndStation`. Require `performerAeTitle` for all state-change operations.

**Independent Test**: With `performerAeTitle: 'WORKLIST_SCU'` — claim/complete/cancel all pass the deterministic UID `2.25.261487955094107788825981291489004302396` to `changeState`. Without `performerAeTitle` — all three operations show an error notification and make no network call. `ups_txuid_*` keys are never written to localStorage; `ups_startdt_*` keys are still written and read.

### Implementation

- [X] T014 Update `claim()` in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`
- [X] T015 Refactor `complete()` in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`
- [X] T016 Refactor `cancel()` in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`
- [X] T017 Remove cleanup of `ups_txuid_*` in `complete()` and `cancel()` success paths
- [X] T018 Remove dead code from `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`

### Tests

- [X] T019 [P] Rewrite deterministic txUID derivation tests
- [X] T020 [P] Add test: `complete()` with no `performerAeTitle` → error, no `changeState`
- [X] T021 [P] Add test: `cancel()` with no `performerAeTitle` → error, no `changeState`
- [X] T022 [P] Add test: `claim()` with no `performerAeTitle` → error, no `changeState`
- [X] T023 [P] Update existing claim tests (remove `ups_txuid_*` localStorage assertions)

### Validation

- [X] T024 Run tests — all 18 pass, 0 failures
- [X] T025 [P] TypeScript check — no errors in `useWorkitemActions.ts`

**Checkpoint**: All tests pass; `resolveTxUID`, `claimedWorkitemsRef`, `storageKey`, `uuidToDicomUID` are gone from the source; `ups_txuid_*` is never written to localStorage.

---

## Phase 7: Final Polish

- [ ] T026 [P] Manual smoke test per `quickstart.md`: Claim workitem with study → deterministic UID used, viewer opens; Complete workitem → same UID re-derived, completes successfully; Missing `performerAeTitle` → error toast

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phases 1–5**: Already complete ✅
- **Phase 6**: Independent of phases 1–5 (modifies different code paths); can start now
  - T014 must complete before T018 (T018 removes helpers that T014 stops calling)
  - T015 depends on T014 completion (same file, sequential)
  - T016 depends on T015 completion (same file, sequential)
  - T017 depends on T015 + T016 (removes from complete/cancel)
  - T018 depends on T014 + T015 + T016 (removes helpers only after callers are gone)
  - T019–T023 [P] can be written in parallel with T014–T018 (different file)
  - T024 depends on T014–T023 all complete
  - T025 [P] can run in parallel with T024
- **Phase 7 (Polish)**: Depends on Phase 6 complete

### Parallel Opportunities in Phase 6

```bash
# These can run simultaneously:
T014–T018:  useWorkitemActions.ts — implementation changes (sequential within file)
T019–T023:  useWorkitemActions.test.ts — test updates (can be written in parallel with impl)

# After both sets complete:
T024:  yarn jest (validates both)
T025:  yarn tsc (validates types)
```

---

## Implementation Strategy

### Recommended order for Phase 6

1. T014 (`claim()` guard + remove random fallback)
2. T015 (`complete()` refactor)
3. T016 (`cancel()` refactor)
4. T017 (remove cleanup of txUID localStorage in complete/cancel)
5. T018 (remove dead code)
6. T019–T023 in parallel (update tests)
7. T024 (run tests)
8. T025 (type check)
9. T026 (smoke test)

---

## Total Task Count

| Phase | Tasks | Story | Status |
|-------|-------|-------|--------|
| 1 Setup | 1 | — | ✅ Done |
| 2 Foundational | 1 | — | ✅ Done |
| 3 US1 | 7 | P1 | ✅ Done |
| 4 US2 | 1 | P2 | ✅ Done |
| 5 US3 | 1 | P3 | ✅ Done |
| 6 TxUID Refactor | 12 | — | ⬜ Remaining |
| 7 Polish | 1 | — | ⬜ Remaining |
| **Total** | **24** | | **13 done / 13 remaining** |

---

## Notes

- `generateDicomUidFromInstanceAndStation` is already implemented at module level in `useWorkitemActions.ts` — T015/T016 call it, no new implementation needed
- Test vector: `generateDicomUidFromInstanceAndStation('workitem-uid-001', 'WORKLIST_SCU')` → `'2.25.261487955094107788825981291489004302396'`
- jsdom polyfill (`TextEncoder` + `crypto.subtle`) is already in `beforeAll` of the test file — no change needed
- The `complete()` and `cancel()` callbacks must be declared `async` to `await` the UID derivation — verify they already are before editing
- `resolveTxUID` is only called in `complete()` (line 252) and `cancel()` (line 330) — confirmed via grep; safe to remove once both callers are updated
