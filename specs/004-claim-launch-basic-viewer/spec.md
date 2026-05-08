# Feature Specification: Claim Launches Basic Viewer

**Feature Branch**: `004-claim-launch-basic-viewer`
**Created**: 2026-05-06
**Status**: Draft
**Reference**: OHIF WorkItemsList worklist — Claim action + viewer routing

## Clarifications

### Session 2026-05-07

- Q: Should deterministic txUID generation replace `resolveTxUID` entirely, covering all operations (claim, complete, cancel, updateWorkitem)? → A: Yes — all txUID usages derive on-demand via `generateDicomUidFromInstanceAndStation(workitemUID, performerAeTitle)`; `resolveTxUID` and `ups_txuid_*` localStorage removed entirely when station name is configured.
- Q: When `performerAeTitle` is not configured, should the fallback path (in-memory + localStorage) be kept, or should `performerAeTitle` be required? → A: Require `performerAeTitle`; if absent when complete/cancel is attempted, surface a user-visible configuration error notification and block the action.
- Q: Should `ups_startdt_*` localStorage entries also be removed along with `ups_txuid_*`? → A: No — keep `ups_startdt_*`; only `ups_txuid_*` entries are removed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Claim Workitem and Open Basic Viewer Automatically (Priority: P1)

A radiologist sees a workitem in the worklist that references a study. They click
**Claim** on that workitem row. The system claims the workitem (transitions state to
IN PROGRESS) and then immediately navigates to the Basic Viewer pre-loaded with the
study identified by the workitem's Study Instance UID. The radiologist can start
reading without any further clicks.

**Why this priority**: This is the entire feature. Claiming a workitem and
immediately viewing the associated study is the primary clinical workflow; every
other scenario is a guard or fallback on top of it.

**Independent Test**: Can be fully tested by clicking Claim on a workitem that has a
Study Instance UID and verifying that the browser navigates to the Basic Viewer
(`/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems`) with the correct study loaded.

**Acceptance Scenarios**:

1. **Given** a workitem with a Study Instance UID in state SCHEDULED is visible in
   the worklist, **When** the user clicks the Claim button, **Then** the workitem
   transitions to IN PROGRESS, the Transaction UID is stored, and the Basic Viewer
   opens for the referenced study.

2. **Given** the claim network call succeeds, **When** the viewer opens, **Then**
   the URL includes `StudyInstanceUIDs=<uid>` and `returnTo=/workitems` so the user
   can navigate back to the worklist.

3. **Given** the claim network call fails, **When** the error is returned, **Then**
   no navigation occurs, the workitem remains in its previous state, and an error
   notification is shown.

---

### User Story 2 — Claim Workitem with No Study Reference (Priority: P2)

A user claims a workitem that does not carry a Study Instance UID (the study has not
yet arrived). The claim still succeeds (workitem transitions to IN PROGRESS) but no
viewer navigation occurs because there is no study to open. The user remains on the
worklist and sees a success notification.

**Why this priority**: Not all UPS workitems reference a study at claim time.
Gracefully handling the absence of a Study Instance UID ensures the claim action
remains functional regardless of workitem data completeness.

**Independent Test**: Can be fully tested by claiming a workitem whose
`studyInstanceUid` is empty/absent and verifying: claim succeeds with notification,
no navigation away from the worklist happens.

**Acceptance Scenarios**:

1. **Given** a workitem with no Study Instance UID in state SCHEDULED, **When** the
   user clicks Claim, **Then** the workitem transitions to IN PROGRESS, a success
   notification is shown, and the user stays on the worklist page.

2. **Given** a workitem with no Study Instance UID, **When** claim succeeds, **Then**
   no viewer URL is constructed and no navigation is attempted.

---

### User Story 3 — Return to Worklist from Viewer (Priority: P3)

After the viewer has been launched via a Claim action, the radiologist finishes
reviewing and wants to return to the worklist. Because the URL carries
`returnTo=/workitems`, any back-navigation affordance in the viewer routes them back
to the worklist where they can complete or cancel the workitem.

**Why this priority**: Without a reliable return path, the user loses their place in
the worklist. The `returnTo` parameter ensures round-trip workflow integrity.

**Independent Test**: Can be fully tested by launching the viewer via Claim, clicking
the viewer's back/return button, and verifying the browser navigates to `/workitems`
(with any active filter query parameters preserved).

**Acceptance Scenarios**:

1. **Given** the viewer was opened via a Claim action, **When** the user activates
   the return-to-worklist affordance in the viewer, **Then** the browser navigates
   back to `/workitems`.

2. **Given** active filter values were present on the worklist before claiming,
   **When** the user returns from the viewer, **Then** the worklist restores with the
   same filter state.

---

### Edge Cases

- What happens if the claim request times out after the Transaction UID is generated
  but before the SCP confirms? The claim logic already handles this (non-fatal
  start-datetime update); the viewer launch only occurs on a confirmed claim success
  response. The Transaction UID can be re-derived on demand — no stale state is left
  behind.
- What happens when `complete()` or `cancel()` is invoked but `performerAeTitle` is
  not configured? The action MUST be blocked and a user-visible error notification
  MUST be shown (e.g., "Cannot complete: no station name configured"). No network
  request is sent. This makes `performerAeTitle` effectively required for all
  state-change operations.
- What happens if the workitem's `studyInstanceUid` is an empty string vs. truly
  absent? Both cases must be treated identically — no viewer navigation.
- What happens if the Basic Viewer mode (`routeName: 'viewer'`) is not loaded in the
  current app configuration? The system must fall back gracefully (stay on the
  worklist with a notification) rather than navigating to a 404 route.
- What happens when multiple workitems are claimed in quick succession? Each claim
  triggers its own navigation; the last claimed workitem's study opens in the viewer.
- What happens if the study exists but has no series (empty study)? Navigation still
  occurs — the viewer handles empty study rendering; this is out of scope for this
  feature.

## Requirements *(mandatory)*

### Functional Requirements

**Core Navigation**

- **FR-001**: When the Claim action for a workitem succeeds AND the workitem has a
  non-empty `studyInstanceUid`, the application MUST navigate to the Basic Viewer
  route for that study.

- **FR-002**: The navigation URL MUST include `StudyInstanceUIDs=<studyInstanceUid>`
  as a query parameter so the viewer loads the correct study.

- **FR-003**: The navigation URL MUST include `returnTo=/workitems` as a query
  parameter (with any active worklist filter query string appended or preserved)
  so the user can return to the worklist.

- **FR-004**: When the Claim action succeeds AND the workitem has no `studyInstanceUid`
  (empty, null, or undefined), the application MUST NOT navigate away from the
  worklist. A success notification MUST still be shown.

- **FR-005**: When the Claim action fails for any reason, the application MUST NOT
  navigate to the viewer. The existing error notification behaviour is unchanged.

**Viewer Route Selection**

- **FR-006**: The viewer route used for navigation MUST be the Basic Viewer mode
  (the mode with `routeName` equal to `'viewer'` or equivalent basic route). If this
  mode is not present in `appConfig.loadedModes`, the application MUST stay on the
  worklist and show an informational notification.

- **FR-007**: The navigation URL MUST include `configUrl` if `filterValues.configUrl`
  is present in the current worklist filter state, consistent with how existing
  mode-launch buttons construct their URLs.

**Back Navigation**

- **FR-008**: The `returnTo` value appended to the viewer URL MUST be `/workitems`.
  Active filter query parameters from the worklist SHOULD be preserved in the return
  URL so the user's filter context is restored on return.

### Key Entities

- **UPS Workitem row**: The data row produced by `workitemToStudyRow`; carries
  `studyInstanceUid` (tag `0020000D`) used as the study reference for viewer launch.

- **Basic Viewer mode**: The OHIF viewer mode with display name used for general
  radiology reading, identified by its `routeName` in `appConfig.loadedModes`.

- **Transaction UID**: A DICOM UID (VR: UI) required by UPS-RS for all state-change
  and update operations on a claimed workitem. **When `performerAeTitle` is
  configured, the Transaction UID is derived deterministically from
  `generateDicomUidFromInstanceAndStation(workitemUID, performerAeTitle)` — the same
  UID is reproduced on demand for `claim`, `complete`, `cancel`, and `updateWorkitem`
  without requiring any persistent storage.** `performerAeTitle` is required for all
  state-change operations; if absent, the action is blocked with a user-visible
  configuration error. The `ups_txuid_*` localStorage entries and `resolveTxUID`
  fallback are removed entirely. The `ups_startdt_*` localStorage entries are
  retained (they persist the claim start-datetime across page refreshes).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can Claim a workitem and have the associated study open in the
  Basic Viewer within 2 seconds of the claim response being received (network time
  excluded).

- **SC-002**: 100% of successful claim actions on workitems with a Study Instance UID
  result in viewer navigation; 0% of failed claims result in navigation.

- **SC-003**: 100% of successful claim actions on workitems without a Study Instance
  UID result in the user remaining on the worklist with a success notification;
  no navigation occurs.

- **SC-004**: Users can complete a full claim → read → return-to-worklist round trip
  without re-entering filter criteria.

## Assumptions

- The Basic Viewer is the intended viewer for all workitem study types; selecting
  which mode to use based on modality or station class is out of scope for this
  feature (a future enhancement could add mode-selection logic).
- The claim success callback is the correct integration point for triggering
  navigation; no additional state machine or event bus is required.
- The `studyInstanceUid` field on the workitem row (mapped from DICOM tag `0020000D`)
  is the authoritative Study Instance UID for navigation; no secondary lookup is needed.
- The `returnTo` parameter already works in the OHIF viewer for back navigation;
  this feature relies on that existing behaviour rather than implementing it.
- Filter query parameter preservation on `returnTo` follows the same pattern used
  by the existing mode-launch buttons (via `preserveQueryParameters` utility).
- `appConfig.loadedModes` is accessible in the `WorkItemsList` component and is the
  canonical list of available viewer modes.
- The `'viewer'` route name is a stable identifier for the Basic Viewer mode; if the
  project renames this route, the integration point must be updated accordingly.
