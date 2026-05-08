---
description: "Task list for 003-ups-workitem-viewer-editor"
---

# Tasks: UPS Workitem Attribute Viewer/Editor

**Input**: Design documents from `/specs/003-ups-workitem-viewer-editor/`
**Branch**: `003-ups-workitem-viewer-editor`
**Source root**: `platform/app/src/routes/WorkItemsList/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Scaffold the replacement component file and supporting types.

- [X] T001 Delete existing `WorkItemDetailsModal.tsx` body and replace file with skeleton (`WorkItemDetailsModal` component that accepts `workitemUID`, `dataSource`, `uiNotificationService` props) in `platform/app/src/routes/WorkItemsList/WorkItemDetailsModal.tsx`
- [X] T002 [P] Create `WorkItemDetailsModal.test.tsx` with empty describe block in `platform/app/src/routes/WorkItemsList/WorkItemDetailsModal.test.tsx`
- [X] T003 Update `WorkItemsList.tsx` to pass `workitemUID`, `dataSource`, `uiNotificationService` to `WorkItemDetailsModal` (remove `rawDicom` prop) in `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`

**Checkpoint**: App compiles; Details button opens a blank modal.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure utility functions and type definitions shared by all three user stories. Must be complete before US1–US3 implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define TypeScript types `DicomElement`, `RawDicom`, `AttributeRow`, `SectionDefinition`, `AttributeDefinition`, `EditState`, `ViewerMode` at top of `WorkItemDetailsModal.tsx` (matching `data-model.md`)
- [X] T005 [P] Implement `SECTION_DEFINITIONS` constant — ordered array of six `SectionDefinition` objects with all 24 IHE RRR-WF Table 40.4.1-1 tag/label pairs and `editable`/`editType`/`selectOptions` fields — in `WorkItemDetailsModal.tsx`
- [X] T006 [P] Implement pure value-formatting functions: `formatPN`, `formatDA`, `formatTM`, `formatDT`, `formatSQ`, `formatValue` (dispatch by VR) — in `WorkItemDetailsModal.tsx` (per `data-model.md` formatting rules)
- [X] T007 [P] Implement `resolveRows(rawDicom, sectionDef)` — builds `AttributeRow[]` for a section; returns "—" row for absent tags — in `WorkItemDetailsModal.tsx`
- [X] T008 [P] Implement `computeViewerMode(rawDicom, uid)` — returns `'edit'` iff state = `IN PROGRESS` AND `localStorage.getItem('ups_txuid_' + uid)` is not null — in `WorkItemDetailsModal.tsx`
- [X] T009 [P] Implement `buildPatch(editState, rawDicom)` — returns DICOM JSON patch object containing only the changed attributes — in `WorkItemDetailsModal.tsx`

**Checkpoint**: All utility functions exportable and unit-testable in isolation.

---

## Phase 3: User Story 1 — View Organised Workitem Attributes (Priority: P1) 🎯 MVP

**Goal**: Replace the raw tag dump with a six-section structured attribute viewer. Any workitem can be opened and its 24 IHE RRR-WF attributes are displayed in labelled sections with formatted values.

**Independent Test**: Open the Details modal for any SCHEDULED workitem. Verify that six section headers appear (Patient, Study, Scheduling, Requested Procedure, Performed Step, Output) and that each row shows a DICOM tag, label, VR, and formatted value. Attributes absent from the workitem show "—".

- [X] T010 [US1] Implement `useFetchWorkitem(workitemUID, dataSource)` hook — calls `retrieve.workitem` on mount, returns `{ rawDicom, loading, error }` state — in `WorkItemDetailsModal.tsx`
- [X] T011 [US1] Implement `SectionTable` sub-component — renders a section title + table of `AttributeRow[]` with columns tag, label, VR, value; SQ rows rendered as indented sub-rows — in `WorkItemDetailsModal.tsx`
- [X] T012 [US1] Wire the `WorkItemDetailsModal` component body: call `useFetchWorkitem`, iterate `SECTION_DEFINITIONS`, render loading/error states and six `SectionTable` instances — in `WorkItemDetailsModal.tsx`
- [X] T013 [P] [US1] Add unit tests for `formatPN`, `formatDA`, `formatTM`, `formatDT`, `formatValue` (cover all VRs including missing value "—") — in `WorkItemDetailsModal.test.tsx`
- [X] T014 [P] [US1] Add unit tests for `resolveRows` — covers: attribute present, attribute absent (→ "—"), SQ attribute (→ indented sub-rows) — in `WorkItemDetailsModal.test.tsx`
- [X] T015 [US1] Add RTL render test: mount `WorkItemDetailsModal` with mock `dataSource.retrieve.workitem` returning a minimal `RawDicom`; assert six section headers render — in `WorkItemDetailsModal.test.tsx`

**Checkpoint**: `yarn jest WorkItemDetailsModal` passes; six sections visible in browser for a SCHEDULED workitem.

---

## Phase 4: User Story 2 — Edit Attributes on a Claimed Workitem (Priority: P2)

**Goal**: For IN PROGRESS workitems owned by the current session, four fields become editable. Changes are saved via `updateWorkitem`; success/error notifications are shown.

**Independent Test**: Claim a workitem (sets `ups_txuid_{uid}` in localStorage). Open its Details modal. Verify four fields are editable. Change Input Readiness State, click Save. Reopen — value is updated. Then open a SCHEDULED workitem's Details modal — verify all fields are read-only and no Save button appears.

- [X] T016 [US2] Implement `EditField` sub-component — renders either a `<select>` (for CS fields) or `<input type="text">` (for DT field) or a three-input code-triple widget (for SQ field), styled consistently with existing OHIF form inputs — in `WorkItemDetailsModal.tsx`
- [X] T017 [US2] Integrate `computeViewerMode` into modal body — derive `viewerMode` on each render from `rawDicom` + `workitemUID`; pass down to `SectionTable` and `EditField` — in `WorkItemDetailsModal.tsx`
- [X] T018 [US2] Implement `useEditState` hook — manages `EditState`; exposes `editState`, `setField`, `resetState`; initialises from `rawDicom` when `rawDicom` changes — in `WorkItemDetailsModal.tsx`
- [X] T019 [US2] Render Save and Discard buttons in edit mode; Save disabled when `editState` is unchanged from loaded values; Discard calls `resetState` — in `WorkItemDetailsModal.tsx`
- [X] T020 [US2] Implement save handler — calls `buildPatch`, then `dataSource.store.updateWorkitem(uid, patch, txuid)`; on success refetches workitem data and shows success notification via `uiNotificationService`; on failure shows error notification and retains `editState` — in `WorkItemDetailsModal.tsx`
- [X] T021 [P] [US2] Add unit tests for `computeViewerMode` — covers: IN PROGRESS + txuid → edit; IN PROGRESS + no txuid → read-only; SCHEDULED → read-only; COMPLETED → read-only — in `WorkItemDetailsModal.test.tsx`
- [X] T022 [P] [US2] Add unit tests for `buildPatch` — covers: only changed attributes included; SQ attribute serialised correctly; empty patch when nothing changed — in `WorkItemDetailsModal.test.tsx`
- [X] T023 [US2] Add RTL render tests: (a) edit mode renders Save/Discard buttons and editable inputs; (b) read-only mode has no Save button; (c) Save calls `updateWorkitem` with correct patch; (d) save failure retains unsaved edits — in `WorkItemDetailsModal.test.tsx`

**Checkpoint**: `yarn jest WorkItemDetailsModal` passes; IN PROGRESS + owned workitem shows editable fields and save round-trip works.

---

## Phase 5: User Story 3 — Filter Attributes Within the Viewer (Priority: P3)

**Goal**: A filter text input narrows all section rows to those matching tag, label, or value. Sections with no matching rows are hidden. Clearing the filter restores the full view.

**Independent Test**: Open the Details modal for any workitem. Type "0010" in the filter box. Only rows whose tag contains "0010" (Patient section rows) should be visible. Clear the filter and verify all sections return.

- [X] T024 [US3] Add `filterQuery` state to `WorkItemDetailsModal`; render a controlled `<input>` filter box above sections — in `WorkItemDetailsModal.tsx`
- [X] T025 [US3] Implement `filterRows(rows, query)` pure function — returns rows where `tag`, `label`, or `value` contains `query` (case-insensitive); used per-section — in `WorkItemDetailsModal.tsx`
- [X] T026 [US3] Update `SectionTable` rendering: if `filterQuery` is non-empty, pass filtered `AttributeRow[]` to each section; skip rendering section entirely when filtered row count is zero — in `WorkItemDetailsModal.tsx`
- [X] T027 [P] [US3] Add unit tests for `filterRows` — covers: tag match, label match, value match, case-insensitive match, empty query returns all rows, no-match returns empty array — in `WorkItemDetailsModal.test.tsx`
- [X] T028 [US3] Add RTL render test: mount modal, type filter, assert only matching rows visible; clear filter, assert all sections restored — in `WorkItemDetailsModal.test.tsx`

**Checkpoint**: `yarn jest WorkItemDetailsModal` passes; filter box works in browser across all three workitem states.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, UI consistency, and verification against all acceptance criteria.

- [X] T029 [P] Add `aria-label` to filter input; add `role="region"` + `aria-labelledby` to each section; ensure tab-order flows logically — in `WorkItemDetailsModal.tsx`
- [X] T030 [P] Verify modal container class `max-w-3xl` is preserved in `WorkItemsList.tsx` caller change (from T003); confirm modal title renders patient name when available — in `WorkItemsList.tsx`
- [X] T031 Run `yarn jest src/routes/WorkItemsList --passWithNoTests` and confirm all tests pass (includes pre-existing `WorkItemsList` and `useWorkitemActions` tests)
- [X] T032 [P] Manual smoke test per `quickstart.md`: open Details for SCHEDULED workitem → read-only; open Details for IN PROGRESS + claimed → edit; change Priority → save; reopen → updated value visible

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — **BLOCKS** all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — can start once foundational utilities exist
- **Phase 4 (US2)**: Depends on Phase 2 + Phase 3 (`SectionTable` renders needed first)
- **Phase 5 (US3)**: Depends on Phase 2 + Phase 3 (filter builds on the section rendering)
- **Phase 6 (Polish)**: Depends on Phase 3 + Phase 4 + Phase 5

### User Story Dependencies

- **US1 (P1)**: No dependency on US2 or US3 — fully independent
- **US2 (P2)**: Depends on US1 (`SectionTable` is reused; edit fields added on top)
- **US3 (P3)**: Depends on US1 (`filterRows` works against `AttributeRow[]` from US1)

### Within Each User Story

- Utility functions (Phase 2) before any rendering
- `useFetchWorkitem` before component wiring
- Component rendering before RTL tests
- Models and hooks before integration tests

### Parallel Opportunities

- T002, T003 can run in parallel with T001 (different files)
- T005, T006, T007, T008, T009 can all run in parallel (pure functions, no shared state)
- T013, T014 can run in parallel with T010–T012 implementation
- T021, T022 can run in parallel with T016–T020 implementation
- T027 can run in parallel with T024–T026 implementation
- T029, T030 can run in parallel in Phase 6

---

## Parallel Example: Phase 2 (Foundational)

```bash
# All of these can be implemented simultaneously:
T005: SECTION_DEFINITIONS constant (no imports)
T006: Formatting functions (no imports)
T007: resolveRows (imports T004 types only)
T008: computeViewerMode (imports T004 types only)
T009: buildPatch (imports T004 types only)
```

## Parallel Example: User Story 1

```bash
# Implement and test simultaneously:
T010: useFetchWorkitem hook
T011: SectionTable sub-component
# Then wire:
T012: WorkItemDetailsModal body (depends on T010, T011)
# Tests can start as soon as T006/T007 are done:
T013: formatValue unit tests [P]
T014: resolveRows unit tests [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T009)
3. Complete Phase 3: US1 (T010–T015)
4. **STOP and VALIDATE**: `yarn jest WorkItemDetailsModal` passes; open Details in browser for a workitem
5. Demo structured view — no editing yet

### Incremental Delivery

1. Setup + Foundational → Component scaffolded, utilities tested
2. US1 → Structured six-section viewer in production (MVP)
3. US2 → Edit mode on claimed workitems
4. US3 → Filter box for power users
5. Polish → Accessibility + full integration test pass

### Total Task Count

| Phase | Tasks | User Story |
|-------|-------|-----------|
| Setup | 3 | — |
| Foundational | 6 | — |
| US1 | 6 | P1 |
| US2 | 8 | P2 |
| US3 | 5 | P3 |
| Polish | 4 | — |
| **Total** | **32** | |

---

## Notes

- All code changes are confined to `platform/app/src/routes/WorkItemsList/` — no new packages, no new routes
- The `rawDicom` prop on the existing `WorkItemDetailsModal` is a **breaking change** — T003 must update the caller
- `localStorage` access in `computeViewerMode` is mocked via `jest.spyOn(Storage.prototype, 'getItem')` in tests
- `uiNotificationService.show` is passed as a prop so it can be mocked in tests without module-level mocking
- SQ formatting recurses; guard against infinite recursion with a `maxDepth` parameter defaulting to 3
