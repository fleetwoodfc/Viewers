# Research: WorkItems List — Task Performer Actions

**Feature**: 002-workitems-task-performer
**Phase**: 0 — Codebase audit and design decisions
**Date**: 2026-05-04

---

## 1. Existing WorkItemsList Component

**File**: `platform/app/src/routes/WorkItemsList/WorkItemsList.tsx`

The component already:
- Renders a table of UPS workitems sourced from `dataSource.query.workitems.search()`
- Displays `procedureStepState` (SCHEDULED / IN PROGRESS / COMPLETED / CANCELED) per row
- Exposes `servicesManager` as a prop (giving access to `uiNotificationService`, `customizationService`)
- Uses `useModal().show()` (from `@ohif/ui-next`) for the existing DICOM tag browser modal
- Calls `onRefresh` to reload data

**Missing**: No action buttons (Claim / Complete / Cancel / Reject) are implemented.

---

## 2. DicomWebUPS Data Source — Available Methods

**File**: `extensions/default/src/DicomWebUpsDataSource/index.ts` (feature 001)

All required UPS-RS operations are already implemented:

| Method | HTTP | Purpose |
|--------|------|---------|
| `store.changeState(uid, 'IN PROGRESS', txUID)` | PUT `/workitems/{uid}/state` | Claim |
| `store.changeState(uid, 'COMPLETED', txUID)` | PUT `/workitems/{uid}/state` | Complete |
| `store.changeState(uid, 'CANCELED', txUID)` | PUT `/workitems/{uid}/state` | Cancel (performer) |
| `store.cancelWorkitem(uid)` | POST `/workitems/{uid}/cancelrequest` | Reject (send cancel request without claiming) |
| `retrieve.subscriptionChannel(aeTitle)` | GET `/subscribers/{aeTitle}` | Open WebSocket event channel |
| `store.subscribe(uid, aeTitle, deletionLock)` | POST `/workitems/{uid}/subscribers/{aeTitle}` | Subscribe to workitem |

**Decision**: No new datasource methods are needed for P1/P2 actions.

---

## 3. Transaction UID Generation

**Question**: How should the performer generate a Transaction UID (Locking UID) when claiming?

**Research**:
- DICOM PS 3.4 Annex CC requires the Performer to generate a UID that it retains for future updates.
- The browser `crypto.randomUUID()` API (Web Crypto) is supported in all modern browsers (Node ≥ 15, Chrome 92+, Firefox 95+, Safari 15.4+). Returns a RFC-4122 v4 UUID string.
- DICOM UIDs use a `.`-delimited format; however, the UPS-RS API accepts the Transaction UID in the JSON body (`"00081195": { "vr": "UI", "Value": ["..."] }`) and the value simply needs to be unique per claim. Using a UUID as the UID value is a valid deployment choice (encoding as `2.25.<decimal-uuid>` is formal, but plain UUID strings work with most conformant servers).

**Decision**:
- Use `crypto.randomUUID()` to generate the Transaction UID at claim time.
- Convert to a valid DICOM UID using the `2.25.{decimal}` OID arc (`uuidToDicomUID`).
- Store the Transaction UID in `claimedWorkitemsRef` (in-memory) AND `localStorage` key `ups_txuid_{uid}` so it survives page refreshes, new tabs, and new browser windows on the same origin.
- Also record `PerformedProcedureStepStartDateTime` (`00404050`) at claim time via a best-effort `updateWorkitem` call, and persist it to `localStorage` key `ups_startdt_{uid}` for recovery at completion time.
- At `complete()`: read the stored start DT (falls back to completion time if lost); set `00404051` to the current time.
- At `complete()` / `cancel()`: remove both localStorage entries.
- The SCU is the authoritative source of both the Transaction UID and the start DT.

---

## 4. Notification Pattern

**Question**: How do workitems list components show success/error feedback?

**Research**:
- `uiNotificationService` is the standard OHIF notification mechanism, available via `servicesManager.services.uiNotificationService`.
- API: `uiNotificationService.show({ title, message, type: 'success'|'error'|'warning'|'info', duration })`.
- The `useNotification` hook from `@ohif/ui-next` is the React-layer wrapper (uses Sonner toasts).
- WorkItemsList already receives `servicesManager` as a prop, so `uiNotificationService` is directly accessible.
- `useNotification` is also exported from `@ohif/ui-next` and available in the WorkItemsList context.

**Decision**: Use `useNotification()` hook (imported from `@ohif/ui-next`) for inline access, consistent with how other components in the app (e.g., `ErrorBoundary`) show notifications. This avoids prop-drilling `servicesManager` into sub-components.

---

## 5. Modal Pattern (Cancel Confirmation Dialog)

**Question**: Should Cancel use a native `confirm()`, an inline dialog, or the OHIF modal system?

**Research**:
- `useModal().show()` (from `@ohif/ui-next`) is already imported in WorkItemsList and used for the DICOM tag browser.
- It accepts a `content` React component and a `title` string.
- A dedicated `CancelWorkitemModal.tsx` component can accept a callback prop (`onConfirm`) and render a textarea for the optional reason.

**Decision**: Use the existing `useModal().show()` pattern. Create `CancelWorkitemModal.tsx` consistent with `WorkItemDetailsModal.tsx` style.

---

## 6. Action Button Placement

**Question**: Where should Claim/Complete/Cancel/Reject buttons appear?

**Options evaluated**:
1. **Inline in each row** — compact, always visible, requires narrow column.
2. **In the expanded row section** — already used for study launch buttons; low discoverability for primary actions.
3. **A dedicated "Actions" column** — clear, scannable; fits the existing `gridCol` pattern.

**Decision**: Add an "Actions" column (the last column) using the existing row `gridCol` layout. Action buttons are rendered contextually based on `procedureStepState`. The column width is `gridCol: 4`.

---

## 7. Assigned Workitem Detection (Reject Button)

**Question**: How to detect if a workitem is assigned to the current performer?

**Research**:
- The UPS workitem DICOM attribute Scheduled Station Name Code Sequence (`0040,4025`) holds the AE title of the intended performer.
- The existing `WorkItemsList` receives `dataSource` as a prop; the datasource config is accessible via `dataSource.getConfig()`.
- A new optional `performerAeTitle` field in the UPS datasource config would make this configurable per deployment.
- The `_rawDicom` field on each workitem row contains the full DICOM dataset, from which `0040,4025.Value[0].00080100.Value[0]` (Code Value) gives the AE title.

**Decision**:
- Add `performerAeTitle?: string` to `UpsConfig` (no behaviour change if absent).
- In the row render, compare `scheduledPerformerAe` (extracted from `_rawDicom['00404025']`) with `dataSource.getConfig().performerAeTitle`.
- Show "Reject" only when they match and state is SCHEDULED; otherwise show only "Claim" on SCHEDULED rows.

---

## 8. P3 WebSocket Notification Channel

**Question**: How to implement real-time assignment notifications?

**Research**:
- `retrieve.subscriptionChannel(aeTitle)` returns a raw `Response` with an `EventStream` body (UPS-RS uses Server-Sent Events or WebSocket — DICOM PS3.18 §6.9.4 uses WebSocket).
- The OHIF `retrieve.subscriptionChannel` implementation does a plain GET to `/subscribers/{aeTitle}` — this opens the WebSocket upgrade.
- For a robust P3 implementation, a `useUpsNotifications` hook should:
  1. Subscribe to global workitems (`store.subscribe('1.2.840.10008.5.1.4.34.5', aeTitle)`).
  2. Open the event channel via `retrieve.subscriptionChannel(aeTitle)`.
  3. Parse incoming DICOM JSON notification events.
  4. Call `onRefresh` + show a toast when an assignment arrives.

**Decision**: Implement `useUpsNotifications` as a separate hook. Mount it in `WorkItemsList` only when `performerAeTitle` is configured. This keeps it isolated from P1/P2 work and is opt-in at the component level.

---

## 9. File Layout Decision

```text
platform/app/src/routes/WorkItemsList/
  WorkItemsList.tsx           — existing, modified: add action column + hook wiring
  WorkItemDetailsModal.tsx    — existing, unchanged
  WorkItemActionsPanel.tsx    — NEW: renders contextual action buttons per row
  CancelWorkitemModal.tsx     — NEW: confirmation modal with optional reason textarea
  useWorkitemActions.ts       — NEW: React hook for claim/complete/cancel/reject
  useUpsNotifications.ts      — NEW (P3): WebSocket subscription hook
  filtersMeta.js              — existing, unchanged
  index.js                    — existing, unchanged
```

**Rationale**: Keeping all files co-located with the route maintains the OHIF convention (see how `WorkItemDetailsModal` lives next to `WorkItemsList`). No new packages or extensions are needed.

---

## 10. Alternatives Rejected

| Alternative | Reason Rejected |
|-------------|----------------|
| Redux/Zustand for claimed workitems map | Overkill for session-scoped, single-component state |
| Polling via `setInterval` for P3 | WebSocket already available via feature 001; polling is less timely |
| Custom `useModal` re-implementation for cancel dialog | `useModal` from `@ohif/ui-next` already in scope and tested |
| `sessionStorage` for Transaction UID | Cross-window scenario fails; `localStorage` (origin-scoped) is required |
| Placeholder `NO_OP` codes in COMPLETED payload | Not clinically identifiable; `performerAeTitle` is available and more meaningful |
