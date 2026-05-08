# Quickstart: UPS Workitem Attribute Viewer/Editor

## What This Feature Does

Replaces the raw DICOM tag dump in the worklist "Details" modal with a structured
six-section attribute viewer. When the viewer is opened for an IN PROGRESS workitem
that the current browser session has claimed, four scheduling attributes become
editable and can be saved back to the SCP.

---

## Prerequisites

- OHIF Viewers monorepo checked out on branch `003-ups-workitem-viewer-editor`
- Node.js 18+ / yarn workspaces configured
- A running UPS-RS SCP (e.g., dcm4chee-arc) configured as the data source
- `upsRoot` and `performerAeTitle` set in the data source configuration

---

## Running the App

```bash
# from repo root
yarn install
yarn dev
```

Navigate to the WorkItems route (e.g., `/worklist`). For each workitem row there is
now a `Details` button (DicomTagBrowser icon). Clicking it opens the structured
viewer modal.

---

## Running the Tests

```bash
# WorkItemDetailsModal unit tests (new)
cd platform/app
yarn jest src/routes/WorkItemsList/WorkItemDetailsModal --passWithNoTests

# Full WorkItemsList test suite
yarn jest src/routes/WorkItemsList --passWithNoTests
```

---

## Key Files

| File | Purpose |
|------|---------|
| `platform/app/src/routes/WorkItemsList/WorkItemDetailsModal.tsx` | Structured viewer/editor component (replaced) |
| `platform/app/src/routes/WorkItemsList/WorkItemDetailsModal.test.tsx` | Unit tests |
| `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx` | Wires up Details button with new props |

---

## How Edit Mode Works

1. User opens the Details modal for a workitem.
2. The modal fetches `dataSource.retrieve.workitem(uid)`.
3. If `Procedure Step State (0074,1000) = IN PROGRESS` **and**
   `localStorage.getItem('ups_txuid_' + uid)` is not null → edit mode activates.
4. Four fields become editable:
   - **Input Readiness State** (0040,4041): select — `INCOMPLETE` / `UNAVAILABLE` / `READY`
   - **Scheduled Start DateTime** (0040,4005): free-text, DICOM DT format
   - **Priority** (0074,1200): select — `HIGH` / `MEDIUM` / `LOW`
   - **Scheduled Workitem Code** (0040,4018): three text inputs (Code Value / Scheme / Meaning)
5. The **Save** button becomes enabled when any field differs from the loaded value.
6. On Save: `dataSource.store.updateWorkitem(uid, changedAttrs, txuid)` is called.
   - Success → data reloads, success toast shown.
   - Failure → error toast, unsaved edits retained.
7. **Discard** / closing the modal discards all unsaved edits.

---

## Filter Usage

Type in the filter box at the top to narrow rows across all sections:
- Match is case-insensitive against tag `(XXXX,XXXX)`, label, or formatted value.
- Section headers with no matching rows are hidden.
- Clear the input to restore the full view.

---

## Attribute Sections at a Glance

| Section | Key Attributes |
|---------|----------------|
| Patient | Name, ID, DOB, Sex |
| Study | Accession #, Study UID, Description, Modality |
| Scheduling | State, Priority\*, Start DT\*, Input Readiness\*, Workitem Code\*, Station Code, Performer |
| Requested Procedure | Procedure ID, Description, Referenced Requests |
| Performed Step | Transaction UID, Start/End DT, Station Code, Workitem Code, Cancellation Reason |
| Output | Output Information Sequence |

\* = editable in edit mode

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Modal opens empty | `retrieve.workitem` network error | Check SCP is reachable; see browser console for error details |
| Fields read-only on IN PROGRESS workitem | No Transaction UID in localStorage | Claim the workitem first using the Claim button |
| Save returns 409 | Transaction UID mismatch (SCP) | The workitem may have been claimed by another session; refresh the worklist |
| Attribute missing from section | Workitem dataset lacks the tag | Expected; the row shows "—" |
