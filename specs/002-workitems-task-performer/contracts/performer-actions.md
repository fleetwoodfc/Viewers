# UI Contracts: Task Performer Actions

**Feature**: 002-workitems-task-performer
**Scope**: React hook and component interfaces exposed by `WorkItemsList`
**Format**: TypeScript interfaces and function signatures

---

## 1. `useWorkitemActions` Hook

**File**: `platform/app/src/routes/WorkItemsList/useWorkitemActions.ts`

```typescript
import type { DicomWebUpsDataSource } from '../../../types'; // or inferred from servicesManager

interface UseWorkitemActionsOptions {
  /** The UPS datasource (provides store.changeState, store.cancelWorkitem). */
  dataSource: ReturnType<typeof createDicomWebUpsApi>;
  /** Called after any successful state-changing action to reload the list. */
  onRefresh: () => void;
  /** OHIF notification service for user feedback. */
  uiNotificationService: { show: (opts: NotificationOptions) => void };
}

interface NotificationOptions {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface UseWorkitemActionsReturn {
  /**
   * Claim a SCHEDULED workitem → IN PROGRESS.
   * Generates a Transaction UID via crypto.randomUUID() and stores it.
   * @param uid  Workitem SOP Instance UID
   */
  claim: (uid: string) => Promise<void>;

  /**
   * Complete a claimed IN PROGRESS workitem → COMPLETED.
   * Requires the workitem to have been claimed in this session.
   * @param uid  Workitem SOP Instance UID
   */
  complete: (uid: string) => Promise<void>;

  /**
   * Cancel a claimed IN PROGRESS workitem → CANCELED.
   * Opens the CancelWorkitemModal for optional reason input.
   * The modal calls back with the confirmed reason.
   * @param uid     Workitem SOP Instance UID
   * @param reason  Optional free-text cancellation reason (max 256 chars)
   */
  cancel: (uid: string, reason?: string) => Promise<void>;

  /**
   * Reject an assigned SCHEDULED workitem (RAD-88 cancelrequest).
   * Does NOT claim the workitem first.
   * @param uid  Workitem SOP Instance UID
   */
  reject: (uid: string) => Promise<void>;

  /**
   * Returns true if the workitem with the given UID was claimed in this session.
   */
  isClaimedByMe: (uid: string) => boolean;

  /**
   * Returns the current action loading state for a given workitem UID.
   * 'idle' if no action is in progress.
   */
  getActionState: (uid: string) => WorkitemActionState;
}

type WorkitemActionState = 'idle' | 'claiming' | 'completing' | 'canceling' | 'rejecting';

declare function useWorkitemActions(opts: UseWorkitemActionsOptions): UseWorkitemActionsReturn;
```

---

## 2. `WorkItemActionsPanel` Component

**File**: `platform/app/src/routes/WorkItemsList/WorkItemActionsPanel.tsx`

```typescript
interface WorkItemActionsPanelProps {
  /** Workitem SOP Instance UID */
  uid: string;
  /** Current procedure step state */
  procedureStepState: 'SCHEDULED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELED';
  /**
   * Whether this SCHEDULED workitem is assigned to the current performer.
   * When true, both "Claim" and "Reject" are shown for SCHEDULED state.
   * When false, only "Claim" is shown.
   */
  isAssignedToMe: boolean;
  /** Whether the current session claimed this workitem (enables Complete/Cancel). */
  claimedByMe: boolean;
  /** Current loading state for this workitem (disables buttons during action). */
  actionState: WorkitemActionState;
  /** Called when user clicks "Claim" */
  onClaim: (uid: string) => void;
  /** Called when user clicks "Complete" */
  onComplete: (uid: string) => void;
  /**
   * Called when user clicks "Cancel".
   * The component opens CancelWorkitemModal before calling this.
   */
  onCancel: (uid: string) => void;
  /** Called when user clicks "Reject" */
  onReject: (uid: string) => void;
}

declare function WorkItemActionsPanel(props: WorkItemActionsPanelProps): JSX.Element;
```

---

## 3. `CancelWorkitemModal` Component

**File**: `platform/app/src/routes/WorkItemsList/CancelWorkitemModal.tsx`

Rendered via `useModal().show(CancelWorkitemModal, { onConfirm, onClose })`.

```typescript
interface CancelWorkitemModalProps {
  /** Called when the performer confirms cancellation, with optional reason. */
  onConfirm: (reason?: string) => void;
  /** Called when the performer dismisses the dialog (no state change). */
  onClose: () => void;
}

declare function CancelWorkitemModal(props: CancelWorkitemModalProps): JSX.Element;
```

**Behaviour**:
- Contains a textarea (optional) for the cancellation reason (max 256 characters).
- "Cancel Workitem" button calls `onConfirm(reason)`.
- "Dismiss" button and pressing Escape calls `onClose()`.

---

## 4. `useUpsNotifications` Hook (P3)

**File**: `platform/app/src/routes/WorkItemsList/useUpsNotifications.ts`

```typescript
interface UseUpsNotificationsOptions {
  /** UPS datasource (provides store.subscribe, retrieve.subscriptionChannel). */
  dataSource: ReturnType<typeof createDicomWebUpsApi>;
  /** AE title of the current performer. If absent, hook is a no-op. */
  performerAeTitle: string | undefined;
  /** Called when an assignment notification is received for this performer. */
  onAssigned: (workitemUID: string) => void;
  /** Called to refresh the workitems list after a notification. */
  onRefresh: () => void;
  /** OHIF notification service — used to show assignment toast (FR-009). */
  uiNotificationService: { show: (opts: NotificationOptions) => void };
}

declare function useUpsNotifications(opts: UseUpsNotificationsOptions): void;
```

**Lifecycle**:
- Mounts: subscribe to global UPS event channel, open WebSocket via `retrieve.subscriptionChannel`.
- Unmounts: close WebSocket connection, remove event listeners.

---

## 5. `UpsConfig` Extension

**File**: `extensions/default/src/DicomWebUpsDataSource/index.ts`

```typescript
export type UpsConfig = DicomWebConfig & {
  /** Base URL for UPS-RS endpoint, e.g. "/wado/rs". */
  upsRoot: string;
  /**
   * AE title of this performer station, used for:
   *  - Displaying the "Reject" button on assigned workitems (FR-006)
   *  - Subscribing to the UPS event channel (FR-011, P3)
   * Optional: if absent, Reject button is hidden and WebSocket is not opened.
   */
  performerAeTitle?: string;
};
```

---

## 6. Notification Calls (FR-009)

Standardised notification payloads for each action outcome:

```typescript
// Claim success
uiNotificationService.show({
  title: 'Workitem Claimed',
  message: 'The workitem is now IN PROGRESS.',
  type: 'success',
  duration: 4000,
});

// Claim failure
uiNotificationService.show({
  title: 'Claim Failed',
  message: error.message || 'Could not claim workitem. It may already be IN PROGRESS.',
  type: 'error',
  duration: 6000,
});

// Complete success
uiNotificationService.show({
  title: 'Workitem Completed',
  message: 'The workitem has been marked COMPLETED.',
  type: 'success',
  duration: 4000,
});

// Cancel success
uiNotificationService.show({
  title: 'Workitem Canceled',
  message: 'The workitem has been marked CANCELED.',
  type: 'success',
  duration: 4000,
});

// Reject success
uiNotificationService.show({
  title: 'Rejection Sent',
  message: 'A cancellation request has been sent to the Task Manager.',
  type: 'info',
  duration: 4000,
});
```
