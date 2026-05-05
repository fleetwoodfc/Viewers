---
description: "Task list for WorkItems List — Task Performer Actions"
---

# Tasks: WorkItems List — Task Performer Actions

**Input**: Design documents from `specs/002-workitems-task-performer/`
**Branch**: `002-workitems-task-performer`
**Prerequisites**: Feature 001 (`001-ups-rs-full-api`) merged — provides `store.changeState`, `store.cancelWorkitem`, `retrieve.subscriptionChannel`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: User story label (US1–US5)
- Exact file paths are included in all implementation tasks

---

## Phase 1: Setup

**Purpose**: Extend datasource config type and prepare file scaffolding before user story implementation.

- [X] T001 Add `performerAeTitle?: string` to `UpsConfig` type in `extensions/default/src/DicomWebUpsDataSource/index.ts`

**Checkpoint**: Datasource config accepts `performerAeTitle` — foundational for US1, US4, US5.

---

## Phase 2: Foundational — `useWorkitemActions` Hook

**Purpose**: Core hook that all action user stories (US1–US4) depend on. Must be complete before any action button can be wired up.

**⚠️ CRITICAL**: US1, US2, US3, US4 all depend on this phase being complete.

- [X] T002 Create `useWorkitemActions.ts` in `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts` with the hook signature from `contracts/performer-actions.md` — export `claim`, `complete`, `cancel`, `reject`, `isClaimedByMe`, `getActionState`; initialise `claimedWorkitemsRef` (Map) and `actionStates` (useState Map)
- [X] T003 Implement `claim(uid)` in `useWorkitemActions.ts`: generate Transaction UID via `crypto.randomUUID()`, call `dataSource.store.changeState(uid, 'IN PROGRESS', txUID)`, store txUID in `claimedWorkitemsRef`, call `onRefresh`, show success/error notification via `uiNotificationService`
- [X] T004 Implement `complete(uid)` in `useWorkitemActions.ts`: look up txUID from `claimedWorkitemsRef`, call `dataSource.store.changeState(uid, 'COMPLETED', txUID)`, remove uid from map, call `onRefresh`, show notification
- [X] T005a Extend `store.changeState` in `extensions/default/src/DicomWebUpsDataSource/index.ts` to accept an optional 4th parameter `extraAttributes?: Record<string, unknown>` and merge it into the PUT request body alongside the state value; update the function signature and the body-building block only
- [X] T005 Implement `cancel(uid, reason?)` in `useWorkitemActions.ts`: look up txUID, call `dataSource.store.changeState(uid, 'CANCELED', txUID, reason ? { '00741238': { vr: 'LO', Value: [reason] } } : undefined)` (per data-model.md §4), remove uid from map, call `onRefresh`, show notification
- [X] T006 Implement `reject(uid)` in `useWorkitemActions.ts`: call `dataSource.store.cancelWorkitem(uid)`, show info notification (no state change, no refresh needed)
- [X] T007 Implement `getActionState(uid)` and `isClaimedByMe(uid)` helpers in `useWorkitemActions.ts`

**Checkpoint**: `useWorkitemActions` hook is complete and all four action functions are implemented.

---

## Phase 3: User Story 1 — Claim a Scheduled Workitem (Priority: P1) 🎯 MVP

**Goal**: A performer can click "Claim" on a SCHEDULED row; it transitions to IN PROGRESS and a success toast appears.

**Independent Test**: Navigate to `/workitems`, find a SCHEDULED row, click "Claim", verify row transitions to IN PROGRESS and a success toast is shown.

- [X] T008 [P] [US1] Create `WorkItemActionsPanel.tsx` in `platform/app/src/routes/WorkItemsList/WorkItemActionsPanel.tsx` with props interface from `contracts/performer-actions.md` §2; render a "Claim" button when `procedureStepState === 'SCHEDULED'`; disable the button when `actionState !== 'idle'`; show loading label "Claiming…" during action
- [X] T009 [US1] Extract `scheduledPerformerAe` from `_rawDicom['00404025']` in `WorkItemsList.tsx` table row builder (tag path: `Value[0]['00080100'].Value[0]`) and pass it to `WorkItemActionsPanel` as `isAssignedToMe` (compare with `dataSource.getConfig().performerAeTitle`)
- [X] T010 [US1] Wire `useWorkitemActions` into `WorkItemsList.tsx`: destructure `claim`, `isClaimedByMe`, `getActionState` from the hook; pass `onClaim={claim}` and `actionState` to each row's `WorkItemActionsPanel`
- [X] T011 [US1] Add "Actions" column header to the `WorkItemsList.tsx` table header array (gridCol: 4) and render `<WorkItemActionsPanel>` as the last cell in each data row

**Checkpoint**: US1 fully functional — SCHEDULED rows show "Claim" and clicking it transitions to IN PROGRESS.

---

## Phase 4: User Story 2 — Complete a Claimed Workitem (Priority: P1)

**Goal**: A performer who claimed a workitem can click "Complete"; the state changes to COMPLETED.

**Independent Test**: Claim a workitem (US1), then click "Complete" on the resulting IN PROGRESS row; verify state becomes COMPLETED.

- [X] T012 [P] [US2] Add "Complete" button to `WorkItemActionsPanel.tsx`: render when `procedureStepState === 'IN PROGRESS' && claimedByMe`; disable when `actionState !== 'idle'`; show "Completing…" label during action; call `onComplete(uid)`
- [X] T013 [US2] Wire `complete` and `isClaimedByMe` from `useWorkitemActions` in `WorkItemsList.tsx` and pass `claimedByMe={isClaimedByMe(uid)}` and `onComplete={complete}` to each row's `WorkItemActionsPanel`

**Checkpoint**: US1 + US2 both functional — full claim → complete flow works end-to-end.

---

## Phase 5: User Story 3 — Cancel an In-Progress Workitem (Priority: P2)

**Goal**: A performer who claimed a workitem can click "Cancel", optionally provide a reason in a confirmation modal, and the state changes to CANCELED.

**Independent Test**: Claim a workitem, click "Cancel", enter an optional reason, confirm — verify state becomes CANCELED and the reason is sent.

- [X] T014 [P] [US3] Create `CancelWorkitemModal.tsx` in `platform/app/src/routes/WorkItemsList/CancelWorkitemModal.tsx`: render a modal with a `<textarea>` (optional, max 256 chars) for the reason, a "Cancel Workitem" confirm button, and a "Dismiss" button; call `onConfirm(reason)` on confirm and `onClose()` on dismiss; `onClose()` also fires on Escape key
- [X] T015 [P] [US3] Add "Cancel" button to `WorkItemActionsPanel.tsx`: render when `procedureStepState === 'IN PROGRESS' && claimedByMe`, alongside the "Complete" button; call `onCancel(uid)` on click; disable when `actionState !== 'idle'`; show "Canceling…" during action
- [X] T016 [US3] In `WorkItemsList.tsx`, handle the Cancel button click: use `useModal().show(CancelWorkitemModal, { onConfirm: (reason) => cancel(uid, reason), onClose: modal.hide })` to open the confirmation dialog before calling `cancel`; wire `onCancel` in the `WorkItemActionsPanel` props

**Checkpoint**: US1 + US2 + US3 functional — claim → cancel flow with modal confirmation and optional reason.

---

## Phase 6: User Story 4 — Reject an Assigned Workitem (Priority: P2)

**Goal**: When `performerAeTitle` is configured and a SCHEDULED workitem is assigned to this performer, a "Reject" button appears; clicking it sends a cancelrequest without claiming.

**Independent Test**: Configure `performerAeTitle`, load a SCHEDULED workitem assigned to that AE title, click "Reject" — verify a cancelrequest is sent and an info toast appears (workitem state unchanged).

- [X] T017 [P] [US4] Add "Reject" button to `WorkItemActionsPanel.tsx`: render when `procedureStepState === 'SCHEDULED' && isAssignedToMe`; render alongside "Claim" (not instead of it); disable when `actionState !== 'idle'`; show "Rejecting…" during action; call `onReject(uid)`
- [X] T018 [US4] Wire `reject` from `useWorkitemActions` in `WorkItemsList.tsx` and pass `onReject={reject}` to each row's `WorkItemActionsPanel`

**Checkpoint**: US1–US4 all functional. Full MVP: claim, complete, cancel, reject all work correctly.

---

## Phase 7: User Story 5 — Real-time Notification of Assigned Workitems (Priority: P3)

**Goal**: When `performerAeTitle` is configured and a WebSocket channel is open, the worklist auto-refreshes and shows a toast when the Task Manager assigns a workitem to this performer.

**Independent Test**: With WorkItems List open and `performerAeTitle` set, have the Task Manager send an assignment — verify a toast appears within 5 seconds and the list refreshes to show the new workitem.

- [X] T019 [P] [US5] Create `useUpsNotifications.ts` in `platform/app/src/routes/WorkItemsList/useUpsNotifications.ts` with the hook signature from `contracts/performer-actions.md` §4; if `performerAeTitle` is absent, return early (no-op)
- [X] T020 [US5] Implement mount logic in `useUpsNotifications.ts`: call `dataSource.store.subscribe('1.2.840.10008.5.1.4.34.5', performerAeTitle)` then `dataSource.retrieve.subscriptionChannel(performerAeTitle)` to open the WebSocket; parse incoming JSON event objects as `UpsEventNotification` per data-model.md §5
- [X] T021 [US5] Implement notification handling in `useUpsNotifications.ts`: when `eventType === 'UPS State Report'` and `assignedPerformerAe` matches `performerAeTitle`, call `onAssigned(workitemUID)`, then call `onRefresh`; silently ignore events for other performers; show a toast via `uiNotificationService`
- [X] T022 [US5] Implement reconnect logic in `useUpsNotifications.ts`: on WebSocket `close` or `error`, re-subscribe and reopen the channel after a short delay (exponential backoff, max 3 retries)
- [X] T023 [US5] Mount `useUpsNotifications` in `WorkItemsList.tsx`: pass `dataSource`, `performerAeTitle` (from `dataSource.getConfig().performerAeTitle`), `uiNotificationService` (from `servicesManager.services`), `onAssigned` (show toast), `onRefresh`; the hook self-disables when `performerAeTitle` is absent

**Checkpoint**: US5 functional — real-time assignments appear in the list without a manual refresh.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Regression guard, accessibility, and style consistency across all user stories.

- [X] T024 [P] Add `aria-label` attributes to all action buttons in `WorkItemActionsPanel.tsx` (e.g., `aria-label="Claim workitem"`, `"Complete workitem"`, `"Cancel workitem"`, `"Reject workitem"`)
- [X] T025 [P] Add button loading/disabled visual styles in `WorkItemActionsPanel.tsx` using Tailwind classes consistent with existing OHIF button patterns (`@ohif/ui-next` Button component or equivalent `className` approach)
- [X] T026 Verify existing WorkItemsList features are unaffected: manually test filter, sort, pagination, study launch buttons, and DICOM tag browser with the Actions column present (SC-006 regression guard)
- [X] T027 [P] Update `WorkItemsList.tsx` grid column total to account for the new Actions column (adjust existing `gridCol` values if the total exceeds the layout container)
- [X] T028 [P] Implement `resolveTxUID(uid)` in `useWorkitemActions.ts`: (1) check `claimedWorkitemsRef` first; (2) on miss, read `sessionStorage.getItem('ups_txuid_${uid}')` and re-hydrate the ref; (3) throw a descriptive error if neither resolves.  Also persist to `sessionStorage` on successful `claim` and remove on `complete`/`cancel`.  Add unit tests covering: (a) in-memory cache hit, (b) sessionStorage hit after simulated refresh, (b3/b4) cleanup on complete/cancel, (c) no UID → error notification without calling changeState.

---

## Dependencies (Story Completion Order)

```
T001 (UpsConfig type) → T002–T007 (useWorkitemActions) → US1 (T008–T011)
                                                         → US2 (T012–T013) [after US1]
                                                         → US3 (T014–T016) [after US2]
                                                         → US4 (T017–T018) [parallel with US3]
                                                         → US5 (T019–T023) [independent]
T024–T027 (Polish) [after US1–US4 complete]
```

**Parallel opportunities per story**:
- US1: T008 (panel component) can be started while T009 (data extraction) is in progress — different concerns, same file pass at end
- US3: T014 (modal) and T015 (button) can be built in parallel before T016 (wiring)
- US4: T017 (button) can be built in parallel with T018 (wiring)
- US5: T019 (hook scaffold) and T020 (mount) are sequential; T021–T022 can be parallel once T020 is done
- Polish: T024, T025, T027 are all parallel

---

## Implementation Strategy

**MVP Scope** (deliver US1 + US2 first):
1. Complete Phase 1 (T001) + Phase 2 (T002–T007) — the hook foundation
2. Complete Phase 3 (T008–T011) → US1 "Claim" works end-to-end
3. Complete Phase 4 (T012–T013) → US2 "Complete" works

**Increment 2** (complete P2 stories):
4. Phase 5 (T014–T016) → US3 "Cancel with modal"
5. Phase 6 (T017–T018) → US4 "Reject"

**Increment 3** (P3, optional):
6. Phase 7 (T019–T023) → US5 Real-time WebSocket notifications

**Polish** (any time after US1–US4):
7. Phase 8 (T024–T027)

---

## Task Summary

| Phase | Tasks | User Story | Priority |
|-------|-------|-----------|---------|
| 1 — Setup | T001 | — | — |
| 2 — Foundation | T002–T007 | — (blocking) | — |
| 3 — Claim | T008–T011 | US1 | P1 |
| 4 — Complete | T012–T013 | US2 | P1 |
| 5 — Cancel | T014–T016 | US3 | P2 |
| 6 — Reject | T017–T018 | US4 | P2 |
| 7 — WebSocket | T019–T023 | US5 | P3 |
| 8 — Polish | T024–T028 | — | — |
| **Total** | **28 tasks** | 5 stories | — |

**Parallel opportunities**: 12 tasks marked [P]
**MVP scope**: T001–T013 (13 tasks) delivers US1 + US2 (claim + complete)
