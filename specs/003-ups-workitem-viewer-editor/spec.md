# Feature Specification: UPS Workitem Attribute Viewer/Editor

**Feature Branch**: `003-ups-workitem-viewer-editor`  
**Created**: 2026-05-05  
**Status**: Draft  
**Reference**: IHE RAD RRR-WF Table 40.4.1-1 Reading Task Attributes

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Organised Workitem Attributes (Priority: P1)

A radiologist or technologist sees a workitem in the worklist and wants to inspect
its full details before deciding whether to claim it. They open the attribute viewer
and see attributes grouped into human-readable sections (Patient, Study, Scheduling,
Performer, Performed Step, Output) rather than a raw tag dump.

**Why this priority**: Every downstream story depends on finding and reading the
right attribute. This is the minimal viable view; all other capabilities add
value on top of it.

**Independent Test**: Can be fully tested by opening the detail panel for any
SCHEDULED workitem and verifying that each section header appears and every
expected IHE RAD RRR-WF Table 40.4.1-1 attribute (see FR-001) is displayed with a
human-readable label, formatted value, and its DICOM tag.

**Acceptance Scenarios**:

1. **Given** the worklist is loaded with at least one workitem, **When** the user
   opens the attribute viewer for a workitem, **Then** six sections appear:
   Patient, Study, Scheduling, Requested Procedure, Performer (Scheduled), and
   Performed Step.
2. **Given** the viewer is open, **When** the workitem has a Patient Name
   (0010,0010) value, **Then** the Patient section shows the name in human-readable
   format alongside its DICOM tag label.
3. **Given** a section contains a Sequence attribute (e.g., Scheduled Station Name
   Code Sequence 0040,4025), **When** the value is present, **Then** each code
   item is displayed as "Code Value / Coding Scheme / Code Meaning" on a single
   line.
4. **Given** an attribute has no value in the workitem, **When** the viewer renders
   that row, **Then** the row shows an em dash (—) as the value so the field
   label is still visible.

---

### User Story 2 — Edit Scheduled/Requested Attributes on a Claimed Workitem (Priority: P2)

A performing radiologist has claimed a workitem (state = IN PROGRESS). They need to
record or correct the Scheduled Procedure Step Start DateTime and the input study
details before completing the step. They open the editor, modify the values, and
save; the changes are persisted to the UPS SCP via `updateWorkitem`.

**Why this priority**: Editing is the key differentiator from the existing raw-dump
modal. Supporting it on IN PROGRESS workitems covers the most common real-world
update scenario.

**Independent Test**: Can be fully tested by claiming a workitem, opening the
editor, changing the Input Readiness State (0040,4041) field, saving, reopening the
editor, and verifying the updated value is displayed.

**Acceptance Scenarios**:

1. **Given** the user has claimed a workitem (IN PROGRESS), **When** they open the
   editor, **Then** editable fields are visually distinct from read-only fields and
   an enabled Save button is present.
2. **Given** the editor shows editable fields, **When** the user changes a value
   and clicks Save, **Then** the system calls `updateWorkitem` with only the
   changed attributes and shows a success notification.
3. **Given** a SCHEDULED or COMPLETED or CANCELED workitem, **When** the user
   opens the attribute viewer, **Then** all fields are read-only and no Save button
   is present.
4. **Given** a workitem not claimed by this viewer instance (no Transaction UID in
   local storage for this UID), **When** the user opens the viewer for an IN
   PROGRESS workitem, **Then** all fields are displayed as read-only.
5. **Given** the user has made changes and clicks Save, **When** the `updateWorkitem`
   call fails, **Then** an error notification is shown and the form retains the
   unsaved values.

---

### User Story 3 — Search / Filter Attributes Within the Viewer (Priority: P3)

A power user or support engineer wants to quickly locate a specific DICOM attribute
by tag number, keyword, or value within the structured view. They type in a filter
box and the sections collapse to show only matching rows while keeping section
headers for context.

**Why this priority**: The structured view covers the IHE RRR-WF attribute set.
Filter support makes the viewer useful for debugging edge-case workitems that carry
non-standard attributes not in the structured sections.

**Independent Test**: Can be fully tested by opening the viewer for a workitem with
known values, typing a tag number fragment, and verifying only the matching rows
are visible.

**Acceptance Scenarios**:

1. **Given** the viewer is open with multiple sections, **When** the user types
   "0010" in the filter box, **Then** only rows whose tag, label, or value
   contains "0010" are shown (section headers remain visible if they have a match).
2. **Given** the user clears the filter box, **When** the input is empty, **Then**
   all sections and rows are restored to the unfiltered view.

---

### Edge Cases

- What happens when a workitem's DICOM dataset contains no value for any attribute in
  a section? The section header is still shown, but each row displays "—" so the
  user knows which attributes are expected.
- What happens if the viewer is opened while the SCP returns a network error?
  A notification is shown and the panel remains empty (no partial render).
- How does the system handle very long free-text values (e.g., Reason for Requested
  Procedure)? Values are displayed with word-wrap and a scrollable cell; no
  truncation occurs silently.
- What happens if two browser tabs have claimed different workitems and one tab opens
  the editor for a workitem claimed by the other? The viewer detects the absence of
  a Transaction UID in its own localStorage scope and renders the viewer as read-only.

## Requirements *(mandatory)*

### Functional Requirements

**Attribute Display**

- **FR-001**: The viewer MUST display all attributes defined in IHE RAD RRR-WF
  Table 40.4.1-1 (Reading Task Attributes), organised into the six sections below.
  Each row MUST show: DICOM tag (formatted as `(XXXX,XXXX)`), human-readable label,
  VR, and formatted value. Attributes absent from the workitem MUST render as "—".

  | Section | Attributes (tag — label) |
  |---------|--------------------------|
  | **Patient** | (0010,0010) Patient Name · (0010,0020) Patient ID · (0010,0030) Date of Birth · (0010,0040) Sex |
  | **Study** | (0008,0050) Accession Number · (0020,000D) Study Instance UID · (0008,1030) Study Description · (0008,0060) Modality |
  | **Scheduling** | (0074,1000) Procedure Step State · (0074,1200) Scheduled Procedure Step Priority · (0040,4005) Scheduled Procedure Step Start DateTime · (0040,4041) Input Readiness State · (0040,4018) Scheduled Workitem Code Sequence · (0040,4025) Scheduled Station Name Code Sequence · (0040,4034) Scheduled Human Performer Sequence |
  | **Requested Procedure** | (0040,1001) Requested Procedure ID · (0032,1060) Requested Procedure Description · (0040,A370) Referenced Request Sequence (Accession / Study UID per item) |
  | **Performed Step** | (0008,1195) Transaction UID · (0040,4050) Performed Procedure Step Start DateTime · (0040,4051) Performed Procedure Step End DateTime · (0040,4028) Performed Station Name Code Sequence · (0040,4019) Performed Workitem Code Sequence · (0074,1238) Reason for Cancellation |
  | **Output** | (0040,4033) Output Information Sequence (Referenced SOP Class / Instance per item) |

- **FR-002**: Sequence (SQ) attribute items MUST be expanded inline; each item
  MUST display its child attributes as indented sub-rows. Nested sequences MUST
  recurse to at least two levels of depth.

- **FR-003**: Patient Name values (VR = PN) MUST be rendered as "Family^Given" or
  the Alphabetic component; not as a raw JSON object.

- **FR-004**: DateTime values (VR = DT, DA, TM) MUST be formatted as
  `YYYY-MM-DD HH:mm:ss` in the viewer's display (storage in DICOM format is
  unchanged).

- **FR-005**: The viewer MUST include a free-text filter input. Typing in the filter
  MUST narrow displayed rows (across all sections) to those whose tag, label, or
  formatted value contains the query (case-insensitive). Section headers with zero
  matching rows MUST be hidden while the filter is active. Clearing the filter
  restores the full view.

**Edit Mode**

- **FR-006**: The viewer MUST enter edit mode only when: (a) the workitem state is
  IN PROGRESS, AND (b) a Transaction UID for that workitem UID exists in
  `localStorage` (key `ups_txuid_{workitemUID}`). In all other cases the viewer
  MUST be read-only.

- **FR-007**: In edit mode, the following attributes MUST be editable:
  - (0040,4041) Input Readiness State — select from: `INCOMPLETE`, `UNAVAILABLE`, `READY`
  - (0040,4005) Scheduled Procedure Step Start DateTime — free-text, validated as DICOM DT format
  - (0074,1200) Scheduled Procedure Step Priority — select from: `HIGH`, `MEDIUM`, `LOW`
  - (0040,4018) Scheduled Workitem Code Sequence — editable code triplet (Code Value / Scheme / Meaning)

- **FR-008**: In edit mode, a Save button MUST be visible and enabled only when at
  least one editable field has been changed from its loaded value.

- **FR-009**: On Save, the system MUST call `updateWorkitem` passing only the
  attributes modified by the user, using the Transaction UID from localStorage. On
  success, the viewer MUST reload the workitem data and display a success
  notification. On failure, the viewer MUST display an error notification and retain
  the unsaved edits.

- **FR-010**: Cancelling edits (via a Cancel/Discard button or closing the panel
  without saving) MUST restore all fields to their last-loaded values without any
  network call.

**Integration**

- **FR-011**: The viewer MUST be accessible from the workitem list via a dedicated
  "Details" action button on each row, supplementing (not replacing) the existing
  Claim / Complete / Cancel actions.

- **FR-012**: The viewer MUST be implemented as a modal or slide-over panel opened
  via `useModal`. It MUST NOT navigate away from the worklist route.

- **FR-013**: On open, the viewer MUST retrieve the latest workitem data from the
  data source (`retrieve.workitem` or equivalent) rather than relying solely on the
  cached list row data.

### Key Entities

- **UPS Workitem**: The DICOM Unified Procedure Step instance identified by its
  Affected SOP Instance UID. Key attributes: Procedure Step State, Priority,
  Scheduled/Performed DateTime, Patient demographics, Referenced Request, Output
  Information.

- **DICOM Code Triplet**: A structured code item containing Code Value, Coding
  Scheme Designator, and Code Meaning. Used in Scheduled/Performed Station Name
  Code Sequence and Workitem Code Sequences.

- **Transaction UID**: A per-claim UID stored in `localStorage` under
  `ups_txuid_{workitemUID}`. Controls whether the viewer enters edit mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open the detail panel for any workitem and identify the
  patient name, accession number, modality, and current step state within 5 seconds
  without scrolling through a raw tag list.

- **SC-002**: All attributes from IHE RAD RRR-WF Table 40.4.1-1 are visible in the
  structured view for a workitem that carries values for all of them (100%
  attribute coverage from the table).

- **SC-003**: A performing user can locate any specific attribute by tag number or
  label using the filter in under 10 keystrokes.

- **SC-004**: A claimed workitem's editable field can be updated and saved in under
  3 user interactions (open → change field → save).

- **SC-005**: The viewer correctly enforces read-only mode for non-IN-PROGRESS
  workitems and for IN PROGRESS workitems not owned by the current browser session
  in 100% of cases (no accidental edits to unclaimed workitems).

## Assumptions

- The existing `WorkItemDetailsModal` (raw tag dump) will be replaced or augmented
  by this structured viewer; both cannot coexist in the same modal slot. Final
  decision (replace vs. augment) is deferred to planning.
- The `dataSource.retrieve.workitem(uid)` call returns a full DICOM JSON object for
  a single workitem; this API already exists (used by `useWorkitemActions`).
- Edit mode is limited to the four attributes in FR-007 for v1; additional editable
  fields are out of scope.
- Mobile/responsive layout is out of scope; the viewer targets desktop-class
  viewport widths (≥ 1024 px).
- Accessibility (WCAG 2.1 AA) is a desired goal but not a hard gate for v1.
- The IHE RAD RRR-WF Table 40.4.1-1 attribute set is treated as the canonical
  "structured" section content; any attributes in the workitem not covered by the
  table are accessible via the filter but may not appear in the structured sections.
