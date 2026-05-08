# Research: UPS Workitem Attribute Viewer/Editor

## 1. IHE RAD RRR-WF Table 40.4.1-1 — Reading Task Attributes

**Decision**: Use the complete attribute set from the table as the canonical
structured-section content (verified from spec and DICOM PS3.4 §CC).  
**Rationale**: The IHE RRR-WF profile is specifically designed for remote reading
workflow; its attribute table captures everything a reading workstation needs to
know before, during, and after performing a reading task.  
**Alternatives considered**: Using the broader DICOM UPS IOD (all ~60 attributes)
— rejected because it would overwhelm users with rarely relevant attributes.

### Confirmed attribute list by section

| Section | Tag | Name | VR | Edit? |
|---------|-----|------|----|-------|
| **Patient** | (0010,0010) | Patient Name | PN | No |
| | (0010,0020) | Patient ID | LO | No |
| | (0010,0030) | Patient's Birth Date | DA | No |
| | (0010,0040) | Patient's Sex | CS | No |
| **Study** | (0008,0050) | Accession Number | SH | No |
| | (0020,000D) | Study Instance UID | UI | No |
| | (0008,1030) | Study Description | LO | No |
| | (0008,0060) | Modality | CS | No |
| **Scheduling** | (0074,1000) | Procedure Step State | CS | No |
| | (0074,1200) | Scheduled Procedure Step Priority | CS | **Yes** |
| | (0040,4005) | Scheduled Procedure Step Start DateTime | DT | **Yes** |
| | (0040,4041) | Input Readiness State | CS | **Yes** |
| | (0040,4018) | Scheduled Workitem Code Sequence | SQ | **Yes** (code triplet) |
| | (0040,4025) | Scheduled Station Name Code Sequence | SQ | No |
| | (0040,4034) | Scheduled Human Performer Sequence | SQ | No |
| **Requested Procedure** | (0040,1001) | Requested Procedure ID | SH | No |
| | (0032,1060) | Requested Procedure Description | LO | No |
| | (0040,A370) | Referenced Request Sequence | SQ | No |
| **Performed Step** | (0008,1195) | Transaction UID | UI | No |
| | (0040,4050) | Performed Procedure Step Start DateTime | DT | No |
| | (0040,4051) | Performed Procedure Step End DateTime | DT | No |
| | (0040,4028) | Performed Station Name Code Sequence | SQ | No |
| | (0040,4019) | Performed Workitem Code Sequence | SQ | No |
| | (0074,1238) | Reason for Cancellation | LT | No |
| **Output** | (0040,4033) | Output Information Sequence | SQ | No |

---

## 2. Modal vs. Slide-over Panel

**Decision**: Retain `useModal` modal pattern (same as existing `WorkItemDetailsModal`).  
**Rationale**: OHIF's `useModal` hook already handles title, close button, and
`containerClassName`. Adopting it avoids adding a new overlay primitive.  
**Alternatives considered**: Slide-over (right-panel drawer) — adds new UI
component not already available in `@ohif/ui-next`; deferred to a future UX pass.

---

## 3. Edit Mode Gate

**Decision**: Edit mode = IN PROGRESS state **AND** `localStorage` key
`ups_txuid_{uid}` exists.  
**Rationale**: This is the same convention established by `useWorkitemActions.ts`.
The viewer needs no additional API; it reads `localStorage` directly in a `useMemo`
and checks the workitem's `00741000` (Procedure Step State) value.  
**Alternatives considered**: Server-side ownership check — rejected because the SCP
does not expose a "who claimed this" API in PS3.18 §11.10; the Transaction UID
already acts as the ownership token.

---

## 4. Partial Update Semantics for Editable SQ Attributes

**Decision**: For `(0040,4018)` Scheduled Workitem Code Sequence, send the full
replacement SQ item (Code Value + Scheme Designator + Code Meaning) on save. Do
**not** attempt a merge.  
**Rationale**: DICOM PS3.18 §11.10.3 states that SQ attributes replace entirely —
this was confirmed during feature 002 implementation (Q4 clarification).  
**Alternatives considered**: Merge — impossible per standard.

---

## 5. Replace vs. Augment `WorkItemDetailsModal.tsx`

**Decision**: Replace the existing `WorkItemDetailsModal.tsx` in-place (same filename).  
**Rationale**: The existing component is a raw tag dump that serves as a debugging
aid. The new structured viewer provides a superset of that functionality (structured
sections + optional filter). Keeping the filename avoids changing the import in
`WorkItemsList.tsx` and simplifies the diff.  
**Alternatives considered**: New file `WorkItemStructuredModal.tsx` alongside the
old one — rejected because it would require toggling between two modals or
maintaining dead code.

---

## 6. Fetch on Open Strategy

**Decision**: When the Details button is clicked, call `dataSource.retrieve.workitem(uid)`
to get a fresh copy of the workitem before opening the modal.  
**Rationale**: The list row data is a summarised projection (no Sequence sub-items).
The full DICOM JSON returned by `retrieve.workitem` is needed for Section display
and for computing edit state.  
**Alternatives considered**: Passing `_rawDicom` (already available on the row) —
it already exists but does not include expanded SQ sub-items in all SCPs; a fresh
fetch guarantees completeness.

---

## 7. DICOM Value Formatting

**Decision**: Use the `dcmjs` `DicomMetaDictionary.nameMap` (already imported in
the existing modal) for keyword resolution; implement custom formatters for PN, DT,
DA, TM, and SQ inline.  
**Rationale**: No additional library needed; `dcmjs` is already a workspace
dependency. DT/DA/TM formatting can be a pure function without `moment.js` (avoid
adding a dependency for a simple string parse).  
**Alternatives considered**: `moment.js` / `date-fns` — unnecessary for simple
`YYYYMMDDHHMMSS` → `YYYY-MM-DD HH:mm:ss` conversion.

---

## 8. Testing Approach

**Decision**: Jest + React Testing Library (same as `useWorkitemActions.test.ts`).
Tests cover: (a) structured section rendering with mock rawDicom, (b) edit mode
activation/deactivation based on state + localStorage, (c) save path calls
`updateWorkitem` with correct payload, (d) cancel discards unsaved edits.  
**Rationale**: Consistent with existing test infrastructure. No E2E tests for v1
(Playwright tests are for integration scenarios, not component-level).  
**Alternatives considered**: Playwright component tests — heavier setup, not used
elsewhere in the codebase for modal components.
