import { useRef, useState, useCallback } from 'react';

type WorkitemActionState = 'idle' | 'claiming' | 'completing' | 'canceling' | 'rejecting';

interface NotificationOptions {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface UseWorkitemActionsOptions {
  dataSource: any;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
}

interface UseWorkitemActionsReturn {
  claim: (uid: string) => Promise<void>;
  complete: (uid: string) => Promise<void>;
  cancel: (uid: string, reason?: string) => Promise<void>;
  reject: (uid: string) => Promise<void>;
  getActionState: (uid: string) => WorkitemActionState;
}

/**
 * Convert a RFC 4122 UUID to a valid DICOM UID using the 2.25 OID arc.
 * DICOM UID (VR: UI) may only contain digits 0-9 and dots.
 * Standard: 2.25.<decimal representation of the 128-bit UUID integer>
 */
function uuidToDicomUID(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const decimal = BigInt('0x' + hex).toString(10);
  return '2.25.' + decimal;
}

export function useWorkitemActions({
  dataSource,
  onRefresh,
  uiNotificationService,
}: UseWorkitemActionsOptions): UseWorkitemActionsReturn {
  // Maps workitem UID → Transaction UID for workitems claimed in this session.
  // Kept as a ref so async callbacks always read the latest value.
  // Also written to sessionStorage so the mapping survives a page refresh
  // within the same browser tab.  The SCU is the authoritative source of the
  // Transaction UID — the SCP does not reliably echo it back via GET.
  const claimedWorkitemsRef = useRef<Map<string, string>>(new Map());

  /** sessionStorage key for a given workitem UID. */
  const sessionKey = (uid: string) => `ups_txuid_${uid}`;
  const [actionStates, setActionStates] = useState<Map<string, WorkitemActionState>>(new Map());

  const setActionState = useCallback((uid: string, state: WorkitemActionState) => {
    setActionStates(prev => {
      const next = new Map(prev);
      if (state === 'idle') {
        next.delete(uid);
      } else {
        next.set(uid, state);
      }
      return next;
    });
  }, []);

  const getActionState = useCallback(
    (uid: string): WorkitemActionState => actionStates.get(uid) ?? 'idle',
    [actionStates]
  );

  /**
   * Resolve the Transaction UID for a workitem.
   *
   * The SCU is the authoritative source of the Transaction UID — the SCP
   * (e.g. dcm4chee-arc) treats it as an opaque lock token and does not
   * reliably return it in GET responses.  Resolution order:
   *   1. In-memory ref (hot path, same render cycle as claim)
   *   2. sessionStorage (survives page refresh within the same tab)
   *   3. Throw — the UID cannot be recovered; surface the error to the user.
   *
   * Throws if the UID cannot be determined so callers never proceed silently.
   */
  const resolveTxUID = useCallback(
    (uid: string): string => {
      const cached = claimedWorkitemsRef.current.get(uid);
      if (cached) return cached;

      // Try sessionStorage (cross-refresh within the same tab)
      try {
        const stored = sessionStorage.getItem(sessionKey(uid));
        if (stored) {
          // Re-hydrate the in-memory cache for subsequent calls
          claimedWorkitemsRef.current.set(uid, stored);
          return stored;
        }
      } catch {
        // sessionStorage may be unavailable (private browsing, storage quota)
      }

      throw new Error(
        `Transaction UID for workitem ${uid} is not available in this session. ` +
          'The workitem may have been claimed in a different browser tab or session.'
      );
    },
    []
  );

  const claim = useCallback(
    async (uid: string): Promise<void> => {
      const txUID = uuidToDicomUID(crypto.randomUUID());
      setActionState(uid, 'claiming');
      try {
        await dataSource.store.changeState(uid, 'IN PROGRESS', txUID);
        claimedWorkitemsRef.current.set(uid, txUID);
        // Persist so the mapping survives a page refresh in this tab
        try { sessionStorage.setItem(sessionKey(uid), txUID); } catch { /* quota/private */ }
        uiNotificationService.show({
          title: 'Workitem Claimed',
          message: 'The workitem is now IN PROGRESS.',
          type: 'success',
          duration: 4000,
        });
        onRefresh();
      } catch (err) {
        console.error('[useWorkitemActions] claim failed:', err);
        uiNotificationService.show({
          title: 'Claim Failed',
          message:
            (err as Error).message || 'Could not claim workitem. It may already be IN PROGRESS.',
          type: 'error',
          duration: 6000,
        });
      } finally {
        setActionState(uid, 'idle');
      }
    },
    [dataSource, onRefresh, uiNotificationService, setActionState]
  );

  const complete = useCallback(
    async (uid: string): Promise<void> => {
      setActionState(uid, 'completing');
      try {
        const txUID = resolveTxUID(uid);
        // DICOM PS3.3 C.30.3 — Procedure Step End DateTime (0040,4051) is a
        // nested attribute inside Unified Procedure Step Performed Procedure
        // Sequence (0074,1216). Must be set before the SCP will accept a
        // COMPLETED state transition (PS3.4 CC.2.5).
        const now = new Date();
        const pad = (n: number, len = 2) => String(n).padStart(len, '0');
        const completionDT =
          `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
          `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        await dataSource.store.updateWorkitem(
          uid,
          {
            '00741216': {
              vr: 'SQ',
              Value: [{ '00404051': { vr: 'DT', Value: [completionDT] } }],
            },
          },
          txUID
        );
        await dataSource.store.changeState(uid, 'COMPLETED', txUID);
        claimedWorkitemsRef.current.delete(uid);
        try { sessionStorage.removeItem(sessionKey(uid)); } catch { /* quota/private */ }
        uiNotificationService.show({
          title: 'Workitem Completed',
          message: 'The workitem has been marked COMPLETED.',
          type: 'success',
          duration: 4000,
        });
        onRefresh();
      } catch (err) {
        console.error('[useWorkitemActions] complete failed:', err);
        uiNotificationService.show({
          title: 'Complete Failed',
          message: (err as Error).message || 'Could not complete workitem.',
          type: 'error',
          duration: 6000,
        });
      } finally {
        setActionState(uid, 'idle');
      }
    },
    [dataSource, onRefresh, uiNotificationService, setActionState, resolveTxUID]
  );

  const cancel = useCallback(
    async (uid: string, reason?: string): Promise<void> => {
      setActionState(uid, 'canceling');
      try {
        const txUID = resolveTxUID(uid);
        const extraAttributes = reason
          ? { '00741238': { vr: 'LO', Value: [reason.substring(0, 256)] } }
          : undefined;
        await dataSource.store.changeState(uid, 'CANCELED', txUID, extraAttributes);
        claimedWorkitemsRef.current.delete(uid);
        try { sessionStorage.removeItem(sessionKey(uid)); } catch { /* quota/private */ }
        uiNotificationService.show({
          title: 'Workitem Canceled',
          message: 'The workitem has been marked CANCELED.',
          type: 'success',
          duration: 4000,
        });
        onRefresh();
      } catch (err) {
        console.error('[useWorkitemActions] cancel failed:', err);
        uiNotificationService.show({
          title: 'Cancel Failed',
          message: (err as Error).message || 'Could not cancel workitem.',
          type: 'error',
          duration: 6000,
        });
      } finally {
        setActionState(uid, 'idle');
      }
    },
    [dataSource, onRefresh, uiNotificationService, setActionState, resolveTxUID]
  );

  const reject = useCallback(
    async (uid: string): Promise<void> => {
      setActionState(uid, 'rejecting');
      try {
        await dataSource.store.cancelWorkitem(uid);
        uiNotificationService.show({
          title: 'Rejection Sent',
          message: 'A cancellation request has been sent to the Task Manager.',
          type: 'info',
          duration: 4000,
        });
      } catch (err) {
        console.error('[useWorkitemActions] reject failed:', err);
        uiNotificationService.show({
          title: 'Reject Failed',
          message: (err as Error).message || 'Could not send rejection request.',
          type: 'error',
          duration: 6000,
        });
      } finally {
        setActionState(uid, 'idle');
      }
    },
    [dataSource, uiNotificationService, setActionState]
  );

  return { claim, complete, cancel, reject, getActionState };
}

