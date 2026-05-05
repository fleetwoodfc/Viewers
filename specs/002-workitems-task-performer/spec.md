# Feature Specification: WorkItems List — Task Performer Actions

**Feature Branch**: `002-workitems-task-performer`
**Created**: 2026-05-04
**Status**: Draft
**Reference**: IHE RAD Supplement RRR-WF Rev. 1.1, Section 40.4.2 Use Cases

## User Scenarios & Testing *(mandatory)*

<!--
  Use cases are drawn directly from IHE RAD RRR-WF §40.4.2.
  Actors: Task Requester, Task Manager, Task Performer, Watcher.
  This feature extends the existing WorkItemsList screen to support
  Task Performer actions across all six §40.4.2 use cases.
-->

### User Story 1 — Claim a Scheduled Workitem (Priority: P1)

A radiologist opens the WorkItems List and sees workitems awaiting action.
They select a scheduled reading task and claim it, signalling that they will
perform the read.  Once claimed, the workitem transitions to IN PROGRESS and
is locked to that performer.

*Corresponds to §40.4.2.1 Open Worklist — performer side.*

**Why this priority**: Claiming is the entry point for all performer activity.
Without it, no further actions (complete, cancel, update) are possible.

**Independent Test**: Navigate to `/workitems`, find a SCHEDULED row, click
"Claim", verify the row state changes to IN PROGRESS and a success notice
appears.

**Acceptance Scenarios**:

1. **Given** the worklist shows a workitem in SCHEDULED state, **When** the
   performer clicks "Claim", **Then** the workitem transitions to IN PROGRESS,
   the list refreshes automatically, and a confirmation message is displayed.
2. **Given** a SCHEDULED workitem that is already IN PROGRESS (claimed by
   another performer), **When** the current performer attempts to claim it,
   **Then** an error message is shown and the list state is unchanged.
3. **Given** a workitem in IN PROGRESS or COMPLETED state, **When** the
   performer views that row, **Then** no "Claim" button is visible for that
   row.

---

### User Story 2 — Complete a Claimed Workitem (Priority: P1)

After finishing the reading task, the radiologist marks the workitem
complete.  The system closes the procedure step and notifies the Task
Requester.

*Corresponds to §40.4.2.1 and §40.4.2.2 — final completion step.*

**Why this priority**: Completing workitems is the primary outcome of the
reading workflow; without it the Task Requester cannot retrieve results.

**Independent Test**: With an IN PROGRESS workitem (claimed by the current
performer), click "Complete", verify the state becomes COMPLETED and the row
is updated accordingly.

**Acceptance Scenarios**:

1. **Given** the performer owns an IN PROGRESS workitem, **When** they click
   "Complete", **Then** the workitem state changes to COMPLETED, the row is
   updated, and a success notice is displayed.
2. **Given** an IN PROGRESS workitem owned by a different performer, **When**
   the current user views the row, **Then** no "Complete" button is shown for
   that row.
3. **Given** a SCHEDULED or COMPLETED workitem, **When** the performer views
   the row, **Then** no "Complete" button is visible.

---

### User Story 3 — Cancel an In-Progress Workitem (Priority: P2)

The radiologist discovers they cannot complete the read (e.g., images are
incomplete or corrupted) and cancels the claimed workitem, providing a reason.
This enables the Task Requester to reassign or recreate the task.

*Corresponds to §40.4.2.6 Failure.*

**Why this priority**: Graceful failure recovery is essential for operational
continuity; without it, tasks remain "stuck" in IN PROGRESS indefinitely.

**Independent Test**: With an IN PROGRESS workitem owned by the current
performer, click "Cancel", enter a reason, confirm — verify state becomes
CANCELED and the reason is recorded.

**Acceptance Scenarios**:

1. **Given** the performer owns an IN PROGRESS workitem, **When** they click
   "Cancel" and confirm with an optional reason, **Then** the workitem state
   changes to CANCELED, the row updates, and a confirmation notice is shown.
2. **Given** a confirmation dialog is shown, **When** the performer clicks
   "Dismiss" or presses Escape, **Then** the workitem state is unchanged and
   the dialog closes.
3. **Given** the cancellation fails (server error), **When** the performer
   submits the cancellation, **Then** an error message is shown and the
   workitem state remains IN PROGRESS.

---

### User Story 4 — Reject an Assigned Workitem (Priority: P2)

The Task Manager assigns a specific workitem to this performer's system.  The
performer cannot accept the assignment (overloaded, system issue) and sends a
rejection, allowing the Task Manager to reassign it.

*Corresponds to §40.4.2.4 Re-assignment — performer side.*

**Why this priority**: Explicit rejection speeds reassignment; without it the
Task Manager must rely on timeouts.

**Independent Test**: With a SCHEDULED workitem whose Scheduled Performer
matches the current system, click "Reject", verify the rejection request is
sent (the workitem is not claimed and a notification is shown).

**Acceptance Scenarios**:

1. **Given** a SCHEDULED workitem assigned to the current performer (Scheduled
   Station Name Code Sequence matches), **When** the performer clicks
   "Reject", **Then** a cancelation request is sent without claiming the
   workitem, and a notice is displayed.
2. **Given** a SCHEDULED workitem not assigned to the current performer,
   **When** the performer views the row, **Then** no "Reject" button appears
   (only "Claim" is shown).
3. **Given** a workitem in IN PROGRESS or COMPLETED state, **When** the
   performer views the row, **Then** no "Reject" button is visible.

---

### User Story 5 — Real-time Notification of Assigned Workitems (Priority: P3)

When the Task Manager assigns a workitem to this performer, the performer
receives an in-app notification without manually refreshing the list.  This
supports the §40.4.2.2 Assigned Read use case.

*Corresponds to §40.4.2.2 — performer receives RAD-87 notification.*

**Why this priority**: Reduces latency from assignment to start-of-read;
however polling remains viable for MVP so this is deferred to P3.

**Independent Test**: While the WorkItems List is open, have the Task Manager
assign a workitem to the current performer AE — verify a toast notification
appears and the list refreshes to show the new assignment.

**Acceptance Scenarios**:

1. **Given** the performer has the WorkItems List open and a WebSocket channel
   is active, **When** the Task Manager sends an assignment notification,
   **Then** a toast notification appears within 5 seconds and the workitem
   appears in the list.
2. **Given** the WebSocket channel drops, **When** the channel reconnects,
   **Then** the system re-subscribes and pending notifications are surfaced.
3. **Given** a global subscription is active, **When** a notification for a
   workitem not assigned to this performer arrives, **Then** the notification
   is silently ignored.

---

### Edge Cases

- What happens when the server rejects a Claim because another performer
  already claimed the workitem simultaneously?  → Conflict error shown; list
  refreshed.
- What happens when the network is unavailable at the moment of an action
  (Claim / Complete / Cancel)?  → Error message shown; no state change
  assumed; user may retry.
- What happens when the performer's AE title is not configured?  → Action
  buttons requiring performer identity (Reject) are hidden; Claim and
  Complete remain available using only the transaction UID.
- What happens when a workitem is in a terminal state (COMPLETED or CANCELED)
  and the user clicks an action button that was rendered before the list
  refreshed?  → The server returns an error; the UI shows the error and
  refreshes.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The worklist MUST display a "Claim" action button on rows whose
  Procedure Step State is SCHEDULED.
- **FR-002**: Claiming a workitem MUST change its Procedure Step State to
  IN PROGRESS (RAD-82: Change UPS State → IN PROGRESS).
- **FR-003**: The worklist MUST display "Complete" and "Cancel" action buttons
  on rows whose Procedure Step State is IN PROGRESS and which were transitioned
  to IN PROGRESS by the configured performer AE title.  The Transaction UID
  required for these actions is retrieved from the SCP (`GET /workitems/{uid}`
  tag `00081195`) when the session cache is cold (e.g., after a page refresh).
- **FR-004**: Completing a workitem MUST change its Procedure Step State to
  COMPLETED (RAD-85: Complete UPS Workitem).
- **FR-005**: Canceling a workitem MUST change its Procedure Step State to
  CANCELED (RAD-85 with CANCELED state) and allow the performer to supply an
  optional free-text reason.
- **FR-006**: The worklist MUST display a "Reject" button on SCHEDULED rows
  whose Scheduled Station Name Code Sequence matches the configured performer
  AE title.
- **FR-007**: Rejecting a workitem MUST send a cancelation request (RAD-88)
  without claiming (changing state) the workitem.
- **FR-008**: Action buttons MUST be contextually visible only for valid
  state transitions; buttons for inapplicable transitions MUST be hidden.
- **FR-009**: Every action outcome (success or failure) MUST be communicated
  to the user via an in-app notification (toast or status message).
- **FR-010**: After any successful state-changing action, the worklist MUST
  automatically refresh within 2 seconds to display the updated state.
- **FR-011**: The system MUST support opening a persistent event channel
  (WebSocket) to the Task Manager to receive real-time UPS notifications
  (RAD-87 / RAD-109).
- **FR-012**: Incoming assignment notifications MUST cause the workitem to
  appear in the worklist and a toast notification to be shown, without
  requiring a manual refresh.

### Key Entities

- **WorkItem**: A UPS procedure step managed by the Task Manager.  Key
  attributes: SOP Instance UID, Procedure Step State, Scheduled Performer
  (AE title / organization), Transaction UID (held by claimant), Patient
  info, Scheduled date/time, Priority.
- **Transaction UID**: A per-claim identifier generated by the performer when
  claiming one specific workitem (one UID per claim, not per AE).  Required
  for all subsequent N-SET and N-ACTION requests (Complete, Cancel) on that
  workitem.  The SCP is the authoritative store (tag `00081195` on the
  workitem instance); the client caches it in session memory as a performance
  optimisation.  On session restore the UID is fetched from the SCP.
- **Performer Identity**: The AE title or station name used to match assigned
  workitems and to populate Performing Station fields on claim.  Sourced from
  the datasource configuration.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A radiologist can claim a SCHEDULED workitem and see it
  transition to IN PROGRESS in under 3 seconds under normal network
  conditions.
- **SC-002**: State transitions (Claim, Complete, Cancel) are reflected in
  the visible worklist within 2 seconds of the action completing.
- **SC-003**: Action buttons are context-sensitive: in a worklist of mixed
  states, no invalid action button is visible on any row.
- **SC-004**: Assigned workitems appear in the worklist within 5 seconds of
  the Task Manager sending the assignment notification (WebSocket channel
  open).
- **SC-005**: 100% of action outcomes (success or server-returned failure) are
  surfaced to the user before the next user interaction is possible.
- **SC-006**: The feature introduces no regression: existing worklist
  filtering, sorting, pagination, study launch, and DICOM tag browser
  functions continue to operate correctly after the actions panel is added.

---

## Assumptions

- The Task Manager endpoint is reachable at the `upsRoot` URL already
  configured in the DicomWebUps datasource.
- The `store.changeState`, `store.cancelWorkitem`, and `retrieve.workitem`
  operations implemented in the `001-ups-rs-full-api` feature are available
  and functioning.
- The performer AE title is configurable per datasource instance (via a new
  `performerAeTitle` config field); if omitted, the "Reject" button is
  suppressed.
- A generated UUID is sufficient as the Transaction UID for claiming; no
  server-side pre-registration is required.  The UUID MUST be converted to a
  valid DICOM UI VR value using the `2.25.{decimal}` OID arc (ISO/IEC 9834-8 /
  DICOM PS3.5 B.2) because DICOM UID may only contain digits `0–9` and dots.
  RFC 4122 UUIDs in their native hex-and-dash form are not valid DICOM UIDs.
- The WorkItems List page is the sole performer action surface; no viewer-
  embedded actions are in scope for this feature.
- Mobile layout optimisation is out of scope; the existing desktop-first
  layout is acceptable.
- Billing, report storage, and output document management are explicitly out
  of scope (handled by the Task Requester after completion).
