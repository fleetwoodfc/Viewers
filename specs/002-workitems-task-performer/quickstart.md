# Quickstart: Task Performer Actions

**Feature**: 002-workitems-task-performer
**Audience**: Developer implementing or testing the feature

---

## Prerequisites

- Feature 001 (`001-ups-rs-full-api`) branch must be merged — it provides the UPS-RS datasource methods used by this feature.
- A running DICOM UPS-RS server (e.g., DCM4CHEE 5, orthanc-wado, or a test stub) reachable from the OHIF dev server.
- OHIF viewer running: `yarn dev` from the repo root.

---

## 1. Configure the UPS Datasource

In your `app-config.js` (or the config JSON used for your deployment), add `performerAeTitle` to the UPS datasource entry:

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomwebups',
  sourceName: 'dicomwebups',
  configuration: {
    friendlyName: 'Local UPS Server',
    name: 'dicomwebups',
    wadoUriRoot: '/dicomweb',
    qidoRoot: '/dicomweb',
    wadoRoot: '/dicomweb',
    upsRoot: '/dicomweb',           // Required for UPS-RS
    performerAeTitle: 'MY_STATION', // Optional: enables Reject + WebSocket
    // ... other standard dicomweb config
  },
}
```

> Without `performerAeTitle`: Claim and Complete/Cancel still work. The "Reject" button is hidden and WebSocket subscription is skipped.

---

## 2. Claim a Workitem

1. Navigate to the WorkItems List (`/workitems`).
2. Find a row with state **SCHEDULED**.
3. Click **Claim**.
4. The row transitions to **IN PROGRESS** within 2 seconds (FR-010).
5. A success toast appears: *"Workitem Claimed — The workitem is now IN PROGRESS."*
6. The "Claim" button is replaced by **Complete** and **Cancel** buttons on the now IN PROGRESS row (since the session holds the Transaction UID).

---

## 3. Complete a Claimed Workitem

1. Find a row with state **IN PROGRESS** that you claimed in this session (Complete/Cancel buttons visible).
2. Click **Complete**.
3. The row transitions to **COMPLETED**.
4. A success toast appears: *"Workitem Completed."*

---

## 4. Cancel a Claimed Workitem

1. Find a row with state **IN PROGRESS** that you claimed (Complete/Cancel buttons visible).
2. Click **Cancel**.
3. A confirmation modal appears with an optional reason textarea.
4. (Optional) Enter a cancellation reason.
5. Click **Cancel Workitem** in the modal.
6. The row transitions to **CANCELED**.
7. A success toast appears: *"Workitem Canceled."*

To dismiss without canceling: click **Dismiss** or press `Escape`.

---

## 5. Reject an Assigned Workitem

> Requires `performerAeTitle` configured and a workitem whose Scheduled Station Name Code Sequence matches.

1. Find a **SCHEDULED** row where both **Claim** and **Reject** are visible.
2. Click **Reject**.
3. A cancellation request is sent to the Task Manager (no state change on the workitem itself).
4. An info toast appears: *"Rejection Sent — A cancellation request has been sent."*

---

## 6. Real-time Notifications (P3 — Optional)

> Requires `performerAeTitle` and a UPS server supporting WebSocket event channels (RAD-87/RAD-109).

When configured, WorkItemsList automatically:
1. Subscribes to the global UPS event channel via `store.subscribe`.
2. Opens a WebSocket via `retrieve.subscriptionChannel(performerAeTitle)`.
3. Shows a toast and refreshes the list when an assignment notification arrives.

No user action needed — runs automatically while the WorkItems List page is open.

---

## 7. Adding a Test Workitem (Dev/Test)

Use the OHIF CLI or a CURL command to POST a workitem to your UPS-RS server:

```bash
curl -X POST http://localhost:8080/dicomweb/workitems \
  -H "Content-Type: application/dicom+json" \
  -d '[{
    "00741000": {"vr": "CS", "Value": ["SCHEDULED"]},
    "00400270": {"vr": "SQ", "Value": [
      {"00400009": {"vr": "SH", "Value": ["STEP-001"]}}
    ]},
    "00100010": {"vr": "PN", "Value": [{"Alphabetic": "Test^Patient"}]},
    "00100020": {"vr": "LO", "Value": ["TEST-001"]}
  }]'
```

---

## 8. Hook Usage Example

```tsx
// Inside a custom extension or test component:
import { useWorkitemActions } from './useWorkitemActions';

function MyCustomPanel({ dataSource, servicesManager, workitemUID, onRefresh }) {
  const { uiNotificationService } = servicesManager.services;
  const { claim, complete, cancel, reject, isClaimedByMe, getActionState } =
    useWorkitemActions({ dataSource, onRefresh, uiNotificationService });

  const actionState = getActionState(workitemUID);

  return (
    <div>
      <button
        disabled={actionState !== 'idle'}
        onClick={() => claim(workitemUID)}
      >
        {actionState === 'claiming' ? 'Claiming...' : 'Claim'}
      </button>
      {isClaimedByMe(workitemUID) && (
        <button
          disabled={actionState !== 'idle'}
          onClick={() => complete(workitemUID)}
        >
          Complete
        </button>
      )}
    </div>
  );
}
```
