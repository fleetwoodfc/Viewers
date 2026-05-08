# Data Model: WorkItems List — Task Performer Actions

**Feature**: 002-workitems-task-performer
**Phase**: 1 — Design
**Reference**: research.md §3, §7

---

## 1. Extended WorkItem Row Type

The existing `WorkItemsList.tsx` builds row objects from queried DICOM workitems. The following extensions are needed to support Task Performer actions:

```typescript
/** Row data as rendered in the WorkItemsList table. */
interface WorkitemRow {
  // --- Existing fields (unchanged) ---
  uid: string;                    // SOP Instance UID
  patientName: string;
  patientId: string;
  procedureStepState: 'SCHEDULED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELED';
  scheduledDateTime: string;
  priority: string;
  modality: string;
  description: string;

  // --- New fields required for Performer actions ---
  /** AE title of the Scheduled Performer (from tag 0040,4025), if present. */
  scheduledPerformerAe: string | null;

  /** Raw DICOM dataset retained for attribute extraction. */
  _rawDicom: Record<string, unknown>;
}
```

**DICOM tag for `scheduledPerformerAe`**: `00404025` (Scheduled Station Name Code Sequence)
Path: `workitem['00404025']?.Value?.[0]?.['00080100']?.Value?.[0]` (Code Value string)

---

## 2. SCU-Owned Claim Data (localStorage + in-memory)

Two refs held inside `useWorkitemActions`, each mirrored to `localStorage`.

```typescript
/**
 * Maps workitem SOP Instance UID → Transaction UID.
 * Populated on successful Claim; cleared on Complete/Cancel.
 * localStorage key: ups_txuid_{uid}
 */
type ClaimedWorkitemsMap = Map<string, string>;

/**
 * Maps workitem SOP Instance UID → DICOM DT string (YYYYMMDDHHmmss)
 * recorded at the moment of claiming (used as 00404050 at completion time).
 * localStorage key: ups_startdt_{uid}
 */
type ClaimStartDTsMap = Map<string, string>;

interface ClaimedWorkitem {
  uid: string;            // workitem SOP Instance UID
  transactionUID: string; // 2.25.{decimal} generated via crypto.randomUUID()
  startDT: string;        // DICOM DT recorded when claim succeeded
}
```

Both entries are removed from the in-memory refs and `localStorage` on
successful Complete or Cancel.

---

## 3. Action States

Controls button loading spinners and disabling during in-flight requests.

```typescript
/** Per-workitem action loading state. */
type WorkitemActionState =
  | 'idle'
  | 'claiming'
  | 'completing'
  | 'canceling'
  | 'rejecting';

/**
 * Map of workitem UID → current action state.
 * Held in useState inside useWorkitemActions.
 */
type ActionStateMap = Map<string, WorkitemActionState>;
```

---

## 4. Cancel Reason (Optional, FR-005)

Passed from `CancelWorkitemModal` to the `cancelWorkitem` handler.

```typescript
/** Input from the performer when canceling a workitem. */
interface CancelInput {
  uid: string;
  reason?: string;  // Optional free-text reason; max 256 characters
}
```

The `reason` is embedded in the DICOM change-state body as:
```
"00741238": { "vr": "LO", "Value": ["<reason>"] }  // Procedure Step Cancellation Reason
```

> **Note**: The `store.changeState` method in feature 001 currently accepts only `(uid, state, txUID?)`. Cancellation with a reason requires either extending that method signature or using `store.updateWorkitem` before the state change. The recommended approach is to add an optional 4th parameter `payload?: Record<string, unknown>` to `changeState`, or send a separate `store.updateWorkitem` call to set the reason attribute prior to the state PUT. This will be resolved in the task implementation step.

---

## 5. WebSocket Event (P3 — US-5)

```typescript
/** Subset of a UPS event notification received over the WebSocket channel. */
interface UpsEventNotification {
  eventType: 'UPS State Report' | 'UPS Cancel Requested' | 'UPS Progress Report' | 'SCP Status Change';
  affectedWorkitemUID: string;
  procedureStepState?: 'SCHEDULED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELED';
  assignedPerformerAe?: string;  // from Scheduled Station Name Code Sequence in event body
}
```

---

## 6. Entity Relationships

```
WorkItemsList (component)
  │
  ├── uses → useWorkitemActions (hook)
                ├── claimedWorkitemsRef: ClaimedWorkitemsMap (+ localStorage ups_txuid_{uid})
                ├── claimStartDTsRef: ClaimStartDTsMap (+ localStorage ups_startdt_{uid})
                ├── actionStates: ActionStateMap (useState)
                ├── claim(uid)         → changeState(IN PROGRESS) + updateWorkitem(00404050) + persist both
                ├── complete(uid)      → updateWorkitem(00741216 all 4) + changeState(COMPLETED) + cleanup
                ├── cancel(uid, reason)→ changeState(CANCELED) + cleanup
                └── reject(uid)        → cancelWorkitem(uid)
  │
  ├── uses → useUpsNotifications (hook, P3, optional)
  │             ├── store.subscribe(globalUID, aeTitle)
  │             ├── retrieve.subscriptionChannel(aeTitle) → WebSocket
  │             └── onNotification → triggers onRefresh + toast
  │
  └── renders → WorkItemActionsPanel (per row)
                  ├── props: uid, state, isAssignedToMe, claimedByMe, actionState
                  └── shows context-sensitive buttons:
                        SCHEDULED + isAssignedToMe → [Claim] [Reject]
                        SCHEDULED + !isAssignedToMe → [Claim]
                        IN PROGRESS + claimedByMe → [Complete] [Cancel]
                        IN PROGRESS + !claimedByMe → (none)
                        COMPLETED / CANCELED → (none)
```

---

## 7. State Transitions (Per IHE RAD §40.4.2)

```
SCHEDULED ──[Claim / RAD-82]──────────→ IN PROGRESS
SCHEDULED ──[Reject / RAD-88]─────────→ (state unchanged; cancel request sent)
IN PROGRESS ──[Complete / RAD-85]─────→ COMPLETED
IN PROGRESS ──[Cancel / RAD-85+reason]→ CANCELED
```

Terminal states: COMPLETED, CANCELED — no further actions.
