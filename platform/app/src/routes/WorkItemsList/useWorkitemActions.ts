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
  const claimedWorkitemsRef = useRef<Map<string, string>>(new Map());
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
   * Resolve the Transaction UID for a workitem.  Uses the in-session cache
   * first; falls back to a single-item GET from the SCP (e.g. after refresh).
   * Throws if the UID cannot be determined so callers surface the error.
   */
  const resolveTxUID = useCallback(
    async (uid: string): Promise<string> => {
      const cached = claimedWorkitemsRef.current.get(uid);
      if (cached) return cached;
      let item: Record<string, any>;
      try {
        item = (await dataSource.retrieve.workitem(uid)) as Record<string, any>;
      } catch (err) {
        throw new Error(`Could not retrieve workitem ${uid}: ${(err as Error).message}`);
      }
      const txUID = item?.['00081195']?.Value?.[0] as string | undefined;
      if (!txUID) {
        throw new Error(
          'Transaction UID (00081195) not found on workitem. ' +
            'The item may have been claimed by a different performer, or the server did not return it.'
        );
      }
      // Cache it for subsequent actions in this session
      claimedWorkitemsRef.current.set(uid, txUID);
      return txUID;
    },
    [dataSource]
  );

  const claim = useCallback(
    async (uid: string): Promise<void> => {
      const txUID = uuidToDicomUID(crypto.randomUUID());
      setActionState(uid, 'claiming');
      try {
        await dataSource.store.changeState(uid, 'IN PROGRESS', txUID);
        claimedWorkitemsRef.current.set(uid, txUID);
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
        const txUID = await resolveTxUID(uid);
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
        const txUID = await resolveTxUID(uid);
        const extraAttributes = reason
          ? { '00741238': { vr: 'LO', Value: [reason.substring(0, 256)] } }
          : undefined;
        await dataSource.store.changeState(uid, 'CANCELED', txUID, extraAttributes);
        claimedWorkitemsRef.current.delete(uid);
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

