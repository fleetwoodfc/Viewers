---
description: "Task list for Full UPS-RS API Support in DicomWebUPS Data Source"
---

# Tasks: Full UPS-RS API Support

**Input**: Design documents from `specs/001-ups-rs-full-api/`
**Prerequisites**: [plan.md](plan.md) ✅ | [spec.md](spec.md) ✅ | [research.md](research.md) ✅ | [data-model.md](data-model.md) ✅ | [contracts/ups-rs-api.md](contracts/ups-rs-api.md) ✅

**Source file**: `extensions/default/src/DicomWebUpsDataSource/index.ts`
**Test file**: `extensions/default/src/DicomWebUpsDataSource/index.test.ts` *(new)*

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files or independent of in-progress tasks)
- **[Story]**: User story this task belongs to (US1–US6)

---

## Phase 1: Setup

**Purpose**: Introduce the `upsRequest` generic HTTP helper and test scaffolding — foundational to all new operations.

- [ ] T001 Add `upsRequest` generic helper function inside `createDicomWebUpsApi` in `extensions/default/src/DicomWebUpsDataSource/index.ts` (supports POST, PUT, DELETE with body, queryParams, contentType; accepts 202 as success; reuses `getAuthorizationHeader()`)
- [ ] T002 [P] Create test file scaffold in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` (mock `global.fetch` and `servicesManager.services.userAuthenticationService`, define `beforeEach` reset)

---

## Phase 2: Foundational (Existing Operation Fixes)

**Purpose**: Fix the two bugs in existing operations before adding new ones. These fixes affect the URL contract relied on by all consumers.

**⚠️ CRITICAL**: Fix these before implementing new operations — subsequent tasks depend on the corrected URL patterns.

- [ ] T003 Fix `store.workitem` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — change create-with-uid from `POST /workitems/{uid}` to `POST /workitems?AffectedSOPInstanceUID={uid}` per DICOM PS3.18 (see research.md §2)
- [ ] T004 Fix `store.subscribe` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — add `deletionLock?: boolean` parameter and append `?deletionlock=1` when true; migrate body to use `upsRequest`

**Checkpoint**: Existing create and subscribe operations now match the DICOM spec URL patterns.

---

## Phase 3: User Story 1 — Search and Retrieve Work Items (Priority: P1) 🎯 MVP

**Goal**: Formalise the read path — search is already functional; add single-item retrieve so the full DICOM dataset can be fetched for any row.

**Independent Test**: Open Work Items List in the viewer, confirm rows load via `GET /workitems`. Click a details icon and confirm `GET /workitems/{uid}` is called and all DICOM tags appear in the modal.

- [ ] T005 [US1] Add `retrieve.workitem(uid: string): Promise<RawDicom>` to the `implementation` object in `extensions/default/src/DicomWebUpsDataSource/index.ts` — calls `upsGet('/workitems/' + uid)` and returns the first element of the JSON array
- [ ] T006 [P] [US1] Write Jest tests for `query.workitems.search` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: correct URL + mapped params sent, 204 returns empty array, non-OK throws Error
- [ ] T007 [P] [US1] Write Jest tests for `retrieve.workitem` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: correct `GET /workitems/{uid}`, returns first element, 404 throws Error

**Checkpoint**: User Story 1 fully functional and tested — read-only worklist with single-item retrieval works end-to-end.

---

## Phase 4: User Story 2 — Create a New Work Item (Priority: P2)

**Goal**: `store.workitem` (already partially exists) is corrected (T003) and covered by tests.

**Independent Test**: Call `dataSource.store.workitem(dataset)` against a live UPS-RS server; confirm `201 Created` and `Location` header present. Call with a UID; confirm `?AffectedSOPInstanceUID` appears in the URL.

- [ ] T008 [US2] Write Jest tests for `store.workitem` (create) in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `POST /workitems` without uid, `POST /workitems?AffectedSOPInstanceUID=...` with uid, body is JSON-serialised dataset, non-OK throws Error

**Checkpoint**: User Story 2 fully functional and tested — work item creation works with and without an explicit UID.

---

## Phase 5: User Story 3 — Update a Work Item (Priority: P2)

**Goal**: Add `store.updateWorkitem` — a new method that POSTs a partial DICOM dataset to `{upsRoot}/workitems/{uid}` with an optional `?transaction` query param.

**Independent Test**: Call `dataSource.store.updateWorkitem(uid, deltaDataset)` and confirm `POST /workitems/{uid}` is sent with the dataset body and `200 OK` received. Call with `transactionUID` and confirm `?transaction=...` is present.

- [ ] T009 [US3] Implement `store.updateWorkitem(uid: string, dataset: RawDicom, transactionUID?: string): Promise<Response>` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — uses `upsRequest('POST', '/workitems/' + uid, { body: dataset, queryParams: txUID ? { transaction: txUID } : {}, contentType: 'application/dicom+json' })`
- [ ] T010 [P] [US3] Write Jest tests for `store.updateWorkitem` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `POST /workitems/{uid}` called, body is dataset, `?transaction` appended when transactionUID provided, non-OK throws Error

**Checkpoint**: User Story 3 fully functional and tested — work item updates (delta or full) work with optional transaction binding.

---

## Phase 6: User Story 4 — Change Work Item State (Priority: P2)

**Goal**: `store.changeState` already exists and is correct; cover it with tests.

**Independent Test**: Call `changeState(uid, 'IN PROGRESS', transactionUID)` and confirm `PUT /workitems/{uid}/state` is sent with a DICOM JSON body containing `(0074,1000)` = `IN PROGRESS` and `(0008,1195)` = transactionUID.

- [ ] T011 [US4] Write Jest tests for `store.changeState` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `PUT /workitems/{uid}/state`, DICOM body contains state tag and transactionUID tag, missing transactionUID omits the tag, non-OK throws Error

**Checkpoint**: User Story 4 fully functional and tested — state transitions (claim, complete, cancel) are reliable and well-tested.

---

## Phase 7: User Story 5 — Cancel a Work Item (Priority: P3)

**Goal**: Add `store.cancelWorkitem` — sends a `POST` to `{upsRoot}/workitems/{uid}/cancelrequest` and treats `202 Accepted` as success.

**Independent Test**: Call `dataSource.store.cancelWorkitem(uid)` against a UPS-RS server and confirm `202 Accepted` is returned and no Error is thrown.

- [ ] T012 [US5] Implement `store.cancelWorkitem(uid: string): Promise<Response>` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — uses `upsRequest('POST', '/workitems/' + uid + '/cancelrequest', { contentType: 'application/dicom+json' })`
- [ ] T013 [P] [US5] Write Jest tests for `store.cancelWorkitem` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: correct URL called, `202 Accepted` treated as success, non-2xx throws Error

**Checkpoint**: User Story 5 fully functional and tested — cancellation requests work without needing to go through the full state-machine PUT flow.

---

## Phase 8: User Story 6 — Manage UPS Subscriptions (Priority: P3)

**Goal**: Add four new subscription methods (`suspendSubscription`, `deleteSubscription`, `retrieve.subscriptionChannel`) and fix/test the existing `subscribe` (done in T004).

**Independent Test**: Create a subscription via `subscribe(uid, aeTitle)`, confirm `201 Created`. Suspend via `suspendSubscription(aeTitle)`, confirm `200 OK`. Delete via `deleteSubscription(uid, aeTitle)`, confirm `200 OK`. Open channel via `retrieve.subscriptionChannel(aeTitle)`, confirm a `Response` with readable body is returned.

- [ ] T014 [US6] Implement `store.suspendSubscription(aeTitle: string): Promise<Response>` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — `upsRequest('POST', '/workitems/1.2.840.10008.5.1.4.34.5/subscribers/' + aeTitle)`
- [ ] T015 [P] [US6] Implement `store.deleteSubscription(uid: string, aeTitle: string): Promise<Response>` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — `upsRequest('DELETE', '/workitems/' + uid + '/subscribers/' + aeTitle)`
- [ ] T016 [P] [US6] Implement `retrieve.subscriptionChannel(aeTitle: string): Promise<Response>` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — raw `fetch` to `{upsRoot}/subscribers/{aeTitle}` with auth headers; return `Response` directly (no JSON parse)
- [ ] T017 [P] [US6] Write Jest tests for `store.subscribe` (fixed) in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: correct URL, `deletionlock=1` appended when `deletionLock: true`, non-OK throws Error
- [ ] T018 [P] [US6] Write Jest tests for `store.suspendSubscription` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `POST /workitems/1.2.840.10008.5.1.4.34.5/subscribers/{aeTitle}`, non-OK throws Error
- [ ] T019 [P] [US6] Write Jest tests for `store.deleteSubscription` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `DELETE /workitems/{uid}/subscribers/{aeTitle}`, non-OK throws Error
- [ ] T020 [P] [US6] Write Jest tests for `retrieve.subscriptionChannel` in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — test: `GET /subscribers/{aeTitle}` called, raw `Response` returned

**Checkpoint**: User Story 6 fully functional and tested — all subscription lifecycle operations work end-to-end.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Ensure TypeScript types are clean, auth headers are consistently applied, and the module compiles without errors.

- [ ] T021 [P] Add TypeScript return-type annotations to all new functions in `extensions/default/src/DicomWebUpsDataSource/index.ts` — `retrieve.workitem`, `store.updateWorkitem`, `store.cancelWorkitem`, `store.suspendSubscription`, `store.deleteSubscription`, `retrieve.subscriptionChannel`
- [ ] T022 [P] Verify `retrieve` property is correctly passed to `IWebApiDataSource.create(implementation)` in `extensions/default/src/DicomWebUpsDataSource/index.ts` — ensure `retrieve.workitem` and `retrieve.subscriptionChannel` are accessible on the returned datasource
- [ ] T023 [P] Run Jest tests to confirm all new tests pass and no regressions exist: `yarn jest extensions/default/src/DicomWebUpsDataSource --passWithNoTests`
- [ ] T024 [P] Add `Authorization` header assertion to each of the 10 operation test blocks in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` — verify `fetch` is called with `headers` containing `Authorization: Bearer test-token` (covers SC-002 / FR-011)
- [ ] T025 Write end-to-end chain test in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` covering SC-004: mock `store.workitem` → `retrieve.workitem` → `store.updateWorkitem` → `store.changeState('IN PROGRESS', txUID)` → `store.changeState('COMPLETED', txUID)` and assert each step produces the correct HTTP call in sequence

---

## Dependencies

```
T001 (upsRequest helper) ──► T003, T004, T009, T012, T014, T015
T002 (test scaffold)     ► T006, T007, T008, T010, T011, T013, T017, T018, T019, T020, T024, T025
T003 (fix store.workitem)► T008
T004 (fix subscribe)     ► T017
T001, T002              ► T005 (retrieve.workitem)
T005                    ► T007
T009                    ► T010
T012                    ► T013
T014, T015, T016        ► T017, T018, T019, T020
T006-T020               ► T024 (auth assertions added to each test block)
T005-T020               ► T025 (all ops implemented before e2e chain test)
T021, T022, T023, T024, T025 ► final gate
```

**User story completion order (suggested)**:
1. T001, T002 (setup — parallel)
2. T003, T004 (bug fixes — parallel)
3. T005, T006, T007 (US1 — T005 then T006/T007 parallel)
4. T008 (US2)
5. T009, T010 (US3 — T009 then T010)
6. T011 (US4)
7. T012, T013 (US5 — T012 then T013)
8. T014, T015, T016 (US6 impl — parallel), then T017–T020 (US6 tests — parallel)
9. T021, T022, T023, T024, T025 (polish — T021/T022/T024 parallel, then T023/T025)

---

## Parallel Execution Examples

### Sprint 1 — Setup + Fixes (all parallelisable after T001/T002 start)
```
Developer A: T001 → T003 → T005 → T009 → T012 → T014
Developer B: T002 → T004 → T006/T007 → T008 → T010 → T011 → T013 → T015/T016/T017–T020
```

### Single-developer order (minimum blocking waits)
```
T001 → T002 (can overlap)
      → T003 → T008
      → T004 → T017
      → T005 → T006 → T007
      → T009 → T010
      → T011
      → T012 → T013
      → T014 → T018
      → T015 → T019
      → T016 → T020
      → T021 → T022 → T023
```

---

## Implementation Strategy

**MVP** (deliver working read path first):
- T001 → T002 → T003 → T005 → T006 → T007 (US1 complete — search + retrieve working)

**Increment 2** (write operations):
- T004 → T008 → T009 → T010 → T011 (US2 create + US3 update + US4 state fixed and tested)

**Increment 3** (cancel + subscriptions):
- T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020

**Final** (polish + validation):
- T021 → T022 → T023 → T024 → T025
