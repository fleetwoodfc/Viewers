# Research: Full UPS-RS API Support — DicomWebUPS Data Source

**Feature**: `001-ups-rs-full-api`
**Date**: 2026-05-04

---

## 1. UPS-RS Endpoint Reference (DICOM PS3.18-2023)

| Method | URL Pattern | Operation | HTTP Success |
|--------|-------------|-----------|-------------|
| `POST` | `{s}/workitems{?AffectedSOPInstanceUID}` | Create work item | 201 Created |
| `POST` | `{s}/workitems/{instance}{?transaction}` | Update work item | 200 OK |
| `GET` | `{s}/workitems{?query*}` | Search work items | 200 OK / 204 No Content |
| `GET` | `{s}/workitems/{instance}` | Retrieve work item | 200 OK |
| `PUT` | `{s}/workitems/{instance}/state` | Change state | 200 OK |
| `POST` | `{s}/workitems/{instance}/cancelrequest` | Request cancellation | 202 Accepted |
| `POST` | `{s}/workitems/{instance}/subscribers/{AETitle}{?deletionlock}` | Create subscription | 201 Created |
| `POST` | `{s}/workitems/1.2.840.10008.5.1.4.34.5/subscribers/{AETitle}` | Suspend global subscription | 200 OK |
| `DELETE` | `{s}/workitems/{instance}/subscribers/{AETitle}` | Delete subscription | 200 OK |
| `GET` | `{s}/subscribers/{AETitle}` | Open subscription channel | 200 OK (streaming) |

**Decision**: Implement all 10 endpoints as methods on the `implementation` object inside `createDicomWebUpsApi`. Three already partially exist (`store.workitem`, `store.changeState`, `store.subscribe`) — these will be refactored and completed.

---

## 2. Existing Implementation Audit

### Already Implemented (partial/complete)

| Endpoint | Current location | Gap |
|----------|-----------------|-----|
| Search (`GET /workitems`) | `query.workitems.search` | ✅ Complete — filtered query params including priority & step state |
| Create (`POST /workitems`) | `store.workitem` | ⚠️ Uses POST to `{upsRoot}/workitems/{uid}` — URL pattern is wrong. Create is always `POST /workitems`, never `POST /workitems/{uid}`. Update is `POST /workitems/{uid}`. Fix needed. |
| Change state (`PUT /workitems/{uid}/state`) | `store.changeState` | ✅ Complete — sends correct DICOM payload with state + transactionUID |
| Create subscription (`POST /workitems/{uid}/subscribers/{AET}`) | `store.subscribe` | ⚠️ Missing `deletionlock` query param support |

### Not Yet Implemented

| Endpoint | New method name |
|----------|----------------|
| Retrieve single (`GET /workitems/{uid}`) | `retrieve.workitem(uid)` |
| Update (`POST /workitems/{uid}{?transaction}`) | `store.updateWorkitem(uid, dataset, transactionUID?)` |
| Cancel request (`POST /workitems/{uid}/cancelrequest`) | `store.cancelWorkitem(uid)` |
| Suspend subscription (`POST /workitems/1.2.840.10008.5.1.4.34.5/subscribers/{AET}`) | `store.suspendSubscription(aeTitle)` |
| Delete subscription (`DELETE /workitems/{uid}/subscribers/{AET}`) | `store.deleteSubscription(uid, aeTitle)` |
| Open subscription channel (`GET /subscribers/{AET}`) | `retrieve.subscriptionChannel(aeTitle)` |

---

## 3. OHIF IWebApiDataSource Interface

**Decision**: The `IWebApiDataSource.create()` factory accepts a free-form `store` object — there is no fixed schema enforced beyond `dicom`. All new methods can be added directly to `store.*` and `retrieve.*` without modifying the interface.

The `defaultStore` in `IWebApiDataSource.js` only defines `dicom`; the UPS datasource already overrides it. We follow the same pattern: spread `dicomWebImpl.store` then add UPS-specific methods.

**Rationale**: Consistent with how `changeState` and `subscribe` are already added. No new interface abstraction needed.

---

## 4. HTTP Helper Strategy

**Decision**: Factor out a generic `upsRequest` helper alongside the existing `upsGet`, supporting all HTTP methods, accepting `Content-Type`, query params, and body. This avoids repetition across the 6+ `fetch` calls and centralises auth header injection and error handling.

```
upsGet(path, queryParams) → GET with Accept: application/dicom+json
upsRequest(method, path, { body?, queryParams?, contentType? }) → generic
```

**Rationale**: DRY. The existing `upsGet` only covers GET. A unified helper reduces copy-paste of auth header, error check, and URL construction.

---

## 5. Error Handling Pattern

**Decision**: All operations throw a typed `Error` with the HTTP status code embedded in the message, matching the existing pattern (`UPS-RS [${status}]: ${url}`). No silent failures (FR-012).

For `cancelrequest` which returns `202 Accepted` (not 200), the success check is `response.status === 202 || response.ok`.

---

## 6. Subscription Channel (`GET /subscribers/{AETitle}`)

**Decision**: Return the raw `Response` object from `retrieve.subscriptionChannel(aeTitle)` so callers can read the streaming body at will. Parsing the event stream is out of scope (per spec assumption).

**Rationale**: Returning `Response` is the most flexible primitive — callers can check `response.body`, attach a `ReadableStream` reader, or pass it to an `EventSource`-compatible parser.

---

## 7. TypeScript Types

**Decision**: Introduce a minimal `UpsWorkitem` type for the raw DICOM JSON structure, and a `WorkitemRow` type for the mapped display row. Existing functions use `any` — annotate new functions to avoid further type debt without refactoring existing code.

---

## 8. Test Strategy

**Decision**: Jest unit tests in `extensions/default/src/DicomWebUpsDataSource/index.test.ts` (new file). Mock `fetch` globally. One describe block per operation. Test: success path (correct URL, method, headers, body), and error path (non-OK response → thrown Error).

**Pattern**: Mirrors `MergeDataSource/index.test.ts` — `jest.fn()` mocks, `beforeEach` reset, `expect(fetch).toHaveBeenCalledWith(...)`.

---

## 9. All NEEDS CLARIFICATION Resolved

No unresolved items. All design decisions above are grounded in the existing codebase patterns.
