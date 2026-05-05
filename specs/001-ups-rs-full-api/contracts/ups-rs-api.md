# Contract: DicomWebUPS Data Source API

**Feature**: `001-ups-rs-full-api`
**Module**: `@ohif/extension-default` → `createDicomWebUpsApi`
**Interface version**: 2.0 (extends existing partial implementation)

---

## Overview

`createDicomWebUpsApi(upsConfig, servicesManager)` returns an `IWebApiDataSource`-compatible object that implements all 10 UPS-RS operations defined in DICOM PS3.18.

Consumers obtain the datasource through OHIF's `DataSourceManager` — they never call `createDicomWebUpsApi` directly.

---

## query.workitems

### `search(params): Promise<WorkitemRow[]>`

Searches for work items matching the given filter criteria.

| Parameter | Type | Description |
|-----------|------|-------------|
| `patientName` | `string \| undefined` | Patient name (fuzzy matched if `supportsFuzzyMatching`) |
| `patientId` | `string \| undefined` | Patient ID / MRN |
| `accessionNumber` | `string \| undefined` | Accession number |
| `description` | `string \| undefined` | Procedure step description |
| `startDate` | `string \| undefined` | Scheduled start date range begin (YYYYMMDD) |
| `endDate` | `string \| undefined` | Scheduled start date range end (YYYYMMDD) |
| `modalities` | `string[] \| undefined` | Modalities filter |
| `procedureStepState` | `string[] \| undefined` | Work item state filter |
| `priority` | `string[] \| undefined` | Priority filter (client-side) |
| `resultsPerPage` | `number \| undefined` | `limit` query parameter |
| `pageNumber` | `number \| undefined` | Used to compute `offset` |

**Returns**: Mapped `WorkitemRow[]` (see data-model.md).

**HTTP**: `GET {upsRoot}/workitems?{query}` with `Accept: application/dicom+json`.

---

## retrieve.workitem

### `retrieve.workitem(uid: string): Promise<RawDicom>`

Retrieves the full DICOM dataset for a single work item.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | SOP Instance UID of the work item |

**Returns**: Raw DICOM JSON object (`Record<string, DicomElement>`).

**HTTP**: `GET {upsRoot}/workitems/{uid}` with `Accept: application/dicom+json`.

**Errors**: Throws `Error('UPS-RS retrieve [404]: ...')` if not found.

---

## retrieve.subscriptionChannel

### `retrieve.subscriptionChannel(aeTitle: string): Promise<Response>`

Opens the UPS subscription event channel. The caller is responsible for reading the streaming response body.

| Parameter | Type | Description |
|-----------|------|-------------|
| `aeTitle` | `string` | Application Entity title of the subscriber |

**Returns**: Raw `fetch` `Response` object with a readable stream body.

**HTTP**: `GET {upsRoot}/subscribers/{aeTitle}` (no `Accept` restriction — server streams events).

**Notes**: Does not parse the event stream. Callers should attach a `ReadableStreamDefaultReader` or pipe to an EventSource parser.

---

## store.workitem (CREATE)

### `store.workitem(dataset: RawDicom, uid?: string): Promise<Response>`

Creates a new work item. If `uid` is provided it is sent as `AffectedSOPInstanceUID`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `dataset` | `RawDicom` | DICOM JSON dataset for the new work item |
| `uid` | `string \| undefined` | Desired SOP Instance UID (optional) |

**HTTP**: `POST {upsRoot}/workitems{?AffectedSOPInstanceUID}` with `Content-Type: application/dicom+json`.

**Success**: Response with status `201 Created`. `Location` header contains the created work item URL.

**Errors**: Throws `Error('UPS-RS workitem POST [409]: ...')` on conflict, etc.

---

## store.updateWorkitem

### `store.updateWorkitem(uid: string, dataset: RawDicom, transactionUID?: string): Promise<Response>`

Updates an existing work item (delta update — only changed attributes need be sent).

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | SOP Instance UID of the work item to update |
| `dataset` | `RawDicom` | Partial DICOM JSON with attributes to update |
| `transactionUID` | `string \| undefined` | Required when work item is IN PROGRESS |

**HTTP**: `POST {upsRoot}/workitems/{uid}{?transaction}` with `Content-Type: application/dicom+json`.

**Success**: `200 OK`.

---

## store.changeState

### `store.changeState(uid: string, state: string, transactionUID?: string): Promise<Response>`

Transitions the work item state per the UPS state machine.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | SOP Instance UID |
| `state` | `'IN PROGRESS' \| 'COMPLETED' \| 'CANCELED'` | Target state |
| `transactionUID` | `string \| undefined` | Required for IN PROGRESS / COMPLETED transitions |

**HTTP**: `PUT {upsRoot}/workitems/{uid}/state` with DICOM JSON body `{ '00741000': state, '00081195': transactionUID }`.

**Success**: `200 OK`.

---

## store.cancelWorkitem

### `store.cancelWorkitem(uid: string): Promise<Response>`

Sends a cancellation request for a scheduled or in-progress work item.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | SOP Instance UID |

**HTTP**: `POST {upsRoot}/workitems/{uid}/cancelrequest` with `Content-Type: application/dicom+json`.

**Success**: `202 Accepted`.

**Note**: Server may respond `409 Conflict` if the work item is already in a terminal state.

---

## store.subscribe

### `store.subscribe(uid: string, aeTitle: string, deletionLock?: boolean): Promise<Response>`

Creates a UPS subscription for a specific work item (or the global well-known UID).

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | Work item SOP Instance UID, or `'1.2.840.10008.5.1.4.34.5'` for global |
| `aeTitle` | `string` | Subscriber AE Title |
| `deletionLock` | `boolean \| undefined` | If `true`, appends `?deletionlock=1` |

**HTTP**: `POST {upsRoot}/workitems/{uid}/subscribers/{aeTitle}{?deletionlock}`.

**Success**: `201 Created`.

---

## store.suspendSubscription

### `store.suspendSubscription(aeTitle: string): Promise<Response>`

Suspends the global UPS subscription for an AE title (uses the well-known global UID).

| Parameter | Type | Description |
|-----------|------|-------------|
| `aeTitle` | `string` | Subscriber AE Title |

**HTTP**: `POST {upsRoot}/workitems/1.2.840.10008.5.1.4.34.5/subscribers/{aeTitle}`.

**Success**: `200 OK`.

---

## store.deleteSubscription

### `store.deleteSubscription(uid: string, aeTitle: string): Promise<Response>`

Deletes a subscription for a specific work item.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `string` | Work item SOP Instance UID |
| `aeTitle` | `string` | Subscriber AE Title |

**HTTP**: `DELETE {upsRoot}/workitems/{uid}/subscribers/{aeTitle}`.

**Success**: `200 OK`.

---

## Error Contract

All methods throw a `Error` on any non-success HTTP status. The error message format is:

```
UPS-RS {operation} [{statusCode}]: {url}
```

Examples:
- `UPS-RS retrieve [404]: http://host/wado/rs/workitems/1.2.3`
- `UPS-RS changeState PUT [409]: http://host/wado/rs/workitems/1.2.3/state`

Callers should `try/catch` around datasource calls and surface errors via OHIF's notification service.

---

## Authentication

All requests include the `Authorization` header when `userAuthenticationService.getAuthorizationHeader()` returns a non-null value. This is transparent to callers.
