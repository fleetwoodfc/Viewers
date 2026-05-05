# Feature Specification: Full UPS-RS API Support in DicomWebUPS Data Source

**Feature Branch**: `001-ups-rs-full-api`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "Extend the DicomWebUPS data source to support the full UPS-RS
i.e.
- POST {s}/workitems{?AffectedSOPInstanceUID} Create a work item
- POST {s}/workitems/{instance}{?transaction} Update a work item
- GET {s}/workitems{?query*} Search for work items
- GET {s}/workitems/{instance} Retrieve a work item
- PUT {s}/workitems/{instance}/state Change work item state
- POST {s}/workitems/{instance}/cancelrequest Cancel work item
- POST {s}/workitems/{instance}/subscribers/{AETitle}{?deletionlock} Create subscription
- POST {s}/workitems/1.2.840.10008.5.1.4.34.5/ Suspend subscription
- DELETE {s}/workitems/{instance}/subscribers/{AETitle} Delete subscription
- GET {s}/subscribers/{AETitle} Open subscription channel"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Search and Retrieve Work Items (Priority: P1)

A radiology coordinator opens the Work Items List view in the OHIF Viewer. The viewer fetches all available work items from the UPS-RS server and presents them in a filterable, sortable list. The coordinator selects a specific work item to view its complete DICOM attribute set.

**Why this priority**: Core read operations are the foundation everything else builds on. The Work Items List already partially supports this; this story formalises the full retrieve-single-item capability so all DICOM attributes are available in the UI.

**Independent Test**: Can be fully tested by opening the Work Items List, confirming items appear, clicking a row's details icon, and verifying all DICOM tags (including non-mapped ones) are shown — delivering a complete read-only worklist experience.

**Acceptance Scenarios**:

1. **Given** a configured UPS-RS data source, **When** the Work Items List loads, **Then** the viewer fetches work items via `GET {s}/workitems{?query*}` and displays them without error.
2. **Given** a work item row is expanded or its details icon clicked, **When** the viewer fetches the individual item, **Then** `GET {s}/workitems/{instance}` is called and all DICOM attributes are presented.
3. **Given** search filters are applied (patient name, scheduled date, priority, step state), **When** the query is triggered, **Then** the correct DICOM tag parameters are sent to the server and results are filtered accordingly.

---

### User Story 2 — Create a New Work Item (Priority: P2)

A clinical application (or an OHIF extension) programmatically creates a new Unified Procedure Step on the server. The data source exposes a `create` operation that accepts a DICOM dataset and posts it to the UPS-RS endpoint, optionally specifying an `AffectedSOPInstanceUID`.

**Why this priority**: Creating work items is the primary write operation enabling workflow automation and worklist population directly from the viewer or its extensions.

**Independent Test**: Can be tested by invoking the create API method with a minimal valid UPS dataset and confirming the server returns a `201 Created` response with the assigned workitem UID.

**Acceptance Scenarios**:

1. **Given** a valid UPS DICOM dataset, **When** `dataSource.store.workitem(dataset)` is called without a UID, **Then** a `POST {s}/workitems` request is sent and a `201 Created` response is returned; the assigned SOP Instance UID is available in the `Location` response header.
2. **Given** a valid UPS DICOM dataset and a desired UID, **When** `dataSource.store.workitem(dataset, uid)` is called, **Then** a `POST {s}/workitems?AffectedSOPInstanceUID={uid}` request is sent.
3. **Given** the server returns an error (e.g. 400, 409 Conflict), **When** the create call is made, **Then** the error is propagated to the caller with a descriptive message.

---

### User Story 3 — Update a Work Item (Priority: P2)

A clinical system updates attributes of an existing work item (e.g. reschedules the date, changes the assigned station). The data source exposes an update operation that sends a partial or full DICOM dataset to the server, optionally associating the change with a transaction UID.

**Why this priority**: Equals create in importance for end-to-end workflow management; required to support in-progress state changes and rescheduling.

**Independent Test**: Can be tested by updating a known attribute (e.g. scheduled date) on an existing work item UID and confirming the server accepts the `POST {s}/workitems/{instance}` call and returns `200 OK`.

**Acceptance Scenarios**:

1. **Given** an existing work item UID and a partial DICOM dataset, **When** `dataSource.store.updateWorkitem(uid, dataset)` is called, **Then** a `POST {s}/workitems/{instance}` request is sent with the dataset as the body.
2. **Given** a transaction UID is supplied, **When** the update is called with `transactionUID`, **Then** the URL includes `?transaction={transactionUID}`.
3. **Given** the server rejects the update (e.g. 400 or 409), **When** the call is made, **Then** the error is propagated with status code and message.

---

### User Story 4 — Change Work Item State (Priority: P2)

A workflow engine changes the state of a work item between `SCHEDULED`, `IN PROGRESS`, `COMPLETED`, and `CANCELED`. The data source exposes a state-change operation that sends the new state to the server via `PUT {s}/workitems/{instance}/state`, including a transaction UID where required.

**Why this priority**: State transitions are the core of UPS workflow management and are required for any meaningful worklist-driven imaging workflow.

**Independent Test**: Can be tested by claiming a work item (SCHEDULED → IN PROGRESS) and confirming the server returns `200 OK` with the updated state.

**Acceptance Scenarios**:

1. **Given** a work item in `SCHEDULED` state and a transaction UID, **When** `changeState(uid, 'IN PROGRESS', transactionUID)` is called, **Then** a `PUT {s}/workitems/{instance}/state` request is sent with the correct DICOM payload.
2. **Given** a completed work item, **When** `changeState(uid, 'COMPLETED', transactionUID)` is called, **Then** the server acknowledges and the local state is updated.
3. **Given** an invalid state transition (e.g. COMPLETED → SCHEDULED), **When** the call is made, **Then** the server error (409 Conflict) is propagated to the caller.

---

### User Story 5 — Cancel a Work Item (Priority: P3)

A user or automated system cancels a scheduled or in-progress work item. The data source exposes a cancel operation that sends a cancel request to the server without requiring the full state-machine `PUT` flow.

**Why this priority**: Cancellation is a distinct UPS-RS endpoint and a common clinical workflow operation, but is lower priority than core state management.

**Independent Test**: Can be tested by cancelling a work item in `SCHEDULED` state and confirming a `202 Accepted` response.

**Acceptance Scenarios**:

1. **Given** a work item in `SCHEDULED` or `IN PROGRESS` state, **When** `cancelWorkitem(uid)` is called, **Then** a `POST {s}/workitems/{instance}/cancelrequest` request is sent.
2. **Given** the server processes the cancel asynchronously, **When** the response is `202 Accepted`, **Then** the operation is considered successful.
3. **Given** the work item is already completed, **When** cancel is attempted, **Then** the server error is reported to the caller.

---

### User Story 6 — Manage UPS Subscriptions (Priority: P3)

A client application subscribes to UPS event notifications for one or more work items (or globally). The data source exposes operations to create, suspend, and delete subscriptions, and to open the WebSocket/streaming subscription channel.

**Why this priority**: Subscriptions enable real-time worklist updates and are important for production deployments, but the worklist is usable without them via polling.

**Independent Test**: Can be tested by creating a subscription for a work item AE title, confirming `201 Created`, then deleting it and confirming `200 OK`.

**Acceptance Scenarios**:

1. **Given** an AE title, **When** `store.subscribe(uid, aeTitle)` is called, **Then** a `POST {s}/workitems/{instance}/subscribers/{AETitle}` request is sent.
2. **Given** a `deletionlock` flag, **When** `store.subscribe(uid, aeTitle, true)` is called with `deletionLock: true`, **Then** `?deletionlock=1` is appended to the URL.
3. **Given** a global subscription, **When** `store.suspendSubscription(aeTitle)` is called, **Then** a `POST {s}/workitems/1.2.840.10008.5.1.4.34.5/subscribers/{AETitle}` request is sent.
4. **Given** a subscription exists, **When** `store.deleteSubscription(uid, aeTitle)` is called, **Then** a `DELETE {s}/workitems/{instance}/subscribers/{AETitle}` request is sent.
5. **Given** a subscription is active, **When** `retrieve.subscriptionChannel(aeTitle)` is called, **Then** a `GET {s}/subscribers/{AETitle}` request is initiated and the raw streaming `Response` is returned to the caller.

---

### Edge Cases

- What happens when the UPS-RS server returns a non-success status for any operation? — The data source throws a typed `Error` with the HTTP status code and URL (FR-012). Distinguishing 501 Not Implemented from other errors is **out of scope** for this feature (the server is assumed PS3.18-compliant per Assumptions).
- Network timeouts during a long-running `GET {s}/subscribers/{AETitle}` streaming connection are the caller's responsibility — parsing and managing the event stream is **out of scope** for this feature.
- What happens when `AffectedSOPInstanceUID` conflicts with an existing work item UID on the server (409 Conflict)? — The 409 error is propagated to the caller via FR-012 error handling.
- Concurrent state-change requests for the same work item without a transaction UID: the server will reject the second request with a 409; the error is propagated to the caller.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The DicomWebUPS data source MUST support retrieving a single work item via `GET {s}/workitems/{instance}`, returning the full DICOM dataset.
- **FR-002**: The DicomWebUPS data source MUST support creating a work item via `POST {s}/workitems` with an optional `AffectedSOPInstanceUID` query parameter.
- **FR-003**: The DicomWebUPS data source MUST support updating a work item via `POST {s}/workitems/{instance}` with an optional `transaction` query parameter.
- **FR-004**: The DicomWebUPS data source MUST support searching for work items via `GET {s}/workitems` with all standard UPS query parameters (patient, date, priority, step state, etc.).
- **FR-005**: The DicomWebUPS data source MUST support changing work item state via `PUT {s}/workitems/{instance}/state` with a DICOM payload containing the new state and transaction UID.
- **FR-006**: The DicomWebUPS data source MUST support requesting cancellation of a work item via `POST {s}/workitems/{instance}/cancelrequest`.
- **FR-007**: The DicomWebUPS data source MUST support creating a UPS subscription via `POST {s}/workitems/{instance}/subscribers/{AETitle}` with an optional `deletionlock` query parameter.
- **FR-008**: The DicomWebUPS data source MUST support suspending a global UPS subscription via `POST {s}/workitems/1.2.840.10008.5.1.4.34.5/subscribers/{AETitle}`.
- **FR-009**: The DicomWebUPS data source MUST support deleting a UPS subscription via `DELETE {s}/workitems/{instance}/subscribers/{AETitle}`.
- **FR-010**: The DicomWebUPS data source MUST support opening a UPS subscription event channel via `GET {s}/subscribers/{AETitle}`.
- **FR-011**: All operations MUST include the configured authorization header (Bearer token or equivalent) when present.
- **FR-012**: All operations MUST propagate server error responses (status code and message) to the caller without swallowing them.
- **FR-013**: The data source API MUST be consistent with the existing `IWebApiDataSource` interface so consumers do not need to know the underlying protocol.

### Key Entities

- **Work Item**: A DICOM Unified Procedure Step instance identified by a SOP Instance UID. Attributes include patient identity, scheduled procedure step details, state, priority, and modality.
- **Transaction UID**: A unique identifier required when claiming a work item (transitioning to IN PROGRESS) to prevent concurrent modification.
- **Subscription**: A registration by an Application Entity (identified by AE Title) to receive UPS event notifications for one or more work items or globally.
- **Subscription Channel**: A persistent server-sent event or WebSocket connection over which the server pushes UPS event notifications to a subscriber.
- **Work Item State**: One of `SCHEDULED`, `IN PROGRESS`, `COMPLETED`, or `CANCELED` — drives the allowed state transitions per the DICOM UPS state machine.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 10 UPS-RS operations listed in the feature description can be invoked through the data source API without errors against a compliant UPS-RS server.
- **SC-002**: Every operation correctly includes authentication headers when the viewer is configured with an identity provider.
- **SC-003**: Server error responses (4xx, 5xx) from any operation are surfaced to the calling code with status code and message — no silent failures.
- **SC-004**: A work item can be created, retrieved, updated, have its state changed to IN PROGRESS, and then COMPLETED in a single end-to-end test scenario.
- **SC-005**: Subscription create, open-channel, and delete operations complete without error against a UPS-RS server that supports subscriptions.
- **SC-006**: The data source passes all existing unit tests without regression, and new unit tests cover each of the 10 new/updated operations.

---

## Assumptions

- The UPS-RS server is fully DICOM PS3.18-2023 compliant; the data source does not need to work around non-standard server behaviour.
- Authorization is handled via the existing `userAuthenticationService.getAuthorizationHeader()` mechanism already present in the data source — no new auth scheme is needed.
- The subscription event channel (`GET {s}/subscribers/{AETitle}`) returns a server-sent events or multipart stream; parsing and reacting to the event stream is out of scope for this feature (only opening the channel is required).
- Mobile / offline support is out of scope.
- The `upsRoot` configuration property is already available on the `UpsConfig` type and will always be set when the DicomWebUPS data source is used.
- Partial DICOM datasets (delta updates) are acceptable for the update operation; the caller is responsible for constructing the payload.
- The existing `workitems.search` and `store.workitem` (create) operations already partially implement some of these endpoints; this feature formalises, completes, and organises them under a consistent API surface.
