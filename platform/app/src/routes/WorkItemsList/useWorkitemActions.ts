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
  /** AE title of this performer station. Used for COMPLETED DICOM code sequences (FR-004). */
  performerAeTitle?: string;
  /**
   * Called after a successful claim with the workitem UID.
   * Use this to trigger viewer navigation from the component.
   * Optional — omitting it preserves existing behaviour.
   */
  onClaimSuccess?: (uid: string) => void;
}

interface UseWorkitemActionsReturn {
  claim: (uid: string) => Promise<void>;
  complete: (uid: string) => Promise<void>;
  cancel: (uid: string, reason?: string) => Promise<void>;
  reject: (uid: string) => Promise<void>;
  getActionState: (uid: string) => WorkitemActionState;
}

/** Format a Date as a DICOM DT string (YYYYMMDDHHmmss). */
function formatDicomDT(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Generates a deterministic DICOM UID from a workitem SOP Instance UID and
 * a station name, following the approach in specs/docs/dicomUid.ts.
 *
 * Uses SHA-256 via WebCrypto (browser-native). The first 16 bytes of the
 * digest are interpreted as an unsigned 128-bit integer and encoded using
 * the DICOM 2.25 OID arc: 2.25.<decimal>.
 *
 * Producing the same UID for the same (instanceUID, stationName) pair is
 * intentional — the Transaction UID is derived on demand for claim, complete,
 * cancel, and updateWorkitem without requiring any persistent storage.
 */
async function generateDicomUidFromInstanceAndStation(
  instanceUID: string,
  stationName: string
): Promise<string> {
  const input = `${instanceUID}|${stationName.trim()}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  // First 16 bytes → 128-bit unsigned integer → 2.25 arc (≤ 64 chars)
  const bytes = new Uint8Array(hashBuffer).slice(0, 16);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return `2.25.${n.toString(10)}`;
}

export function useWorkitemActions({
  dataSource,
  onRefresh,
  uiNotificationService,
  performerAeTitle,
  onClaimSuccess,
}: UseWorkitemActionsOptions): UseWorkitemActionsReturn {
  // Maps workitem UID → DICOM DT string recorded at claim time (00404050)
  const claimStartDTsRef = useRef<Map<string, string>>(new Map());

  /** localStorage key for the claim start datetime of a given workitem. */
  const startDtKey = (uid: string) => `ups_startdt_${uid}`;

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
   * Resolve the Performed Procedure Step Start DateTime recorded at claim time
   * (FR-002 / DICOM PS3.3 C.30.3, tag 00404050).
   *
   * DICOM PS3.18 §11.10.3: SQ attributes replace the entire sequence on each
   * updateWorkitem call.  Therefore complete() MUST re-send 00404050 alongside
   * 00404051 to avoid overwriting the start DT with an empty value.
   *
   * Falls back to completionDT if the stored value cannot be recovered
   * (storage cleared / different browser) — not ideal but still DICOM-conformant.
   */
  const resolveStartDT = useCallback((uid: string, fallback: string): string => {
    const cached = claimStartDTsRef.current.get(uid);
    if (cached) return cached;
    try {
      const stored = localStorage.getItem(startDtKey(uid));
      if (stored) {
        claimStartDTsRef.current.set(uid, stored);
        return stored;
      }
    } catch {
      /* localStorage may be unavailable (private browsing, storage quota) */
    }
    return fallback;
  }, []);

  const claim = useCallback(
    async (uid: string): Promise<void> => {
      if (!performerAeTitle) {
        uiNotificationService.show({
          title: 'Claim Failed',
          message: 'Station name not configured — cannot claim workitem.',
          type: 'error',
          duration: 6000,
        });
        return;
      }
      const txUID = await generateDicomUidFromInstanceAndStation(uid, performerAeTitle);
      setActionState(uid, 'claiming');
      try {
        await dataSource.store.changeState(uid, 'IN PROGRESS', txUID);
        // Record and persist the start datetime (DICOM PS3.3 C.30.3 — 00404050, FR-002)
        const claimDT = formatDicomDT(new Date());
        claimStartDTsRef.current.set(uid, claimDT);
        try {
          localStorage.setItem(startDtKey(uid), claimDT);
        } catch {
          /* quota/private */
        }
        // Set PerformedProcedureStepStartDateTime on the workitem (best-effort;
        // claim has already succeeded so a failure here is non-fatal)
        try {
          await dataSource.store.updateWorkitem(
            uid,
            {
              '00741216': {
                vr: 'SQ',
                Value: [{ '00404050': { vr: 'DT', Value: [claimDT] } }],
              },
            },
            txUID
          );
        } catch (updateErr) {
          console.warn('[useWorkitemActions] claim: failed to set start datetime:', updateErr);
        }
        uiNotificationService.show({
          title: 'Workitem Claimed',
          message: 'The workitem is now IN PROGRESS.',
          type: 'success',
          duration: 4000,
        });
        onRefresh();
        onClaimSuccess?.(uid);
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
    [dataSource, onRefresh, uiNotificationService, setActionState, onClaimSuccess]
  );

  const complete = useCallback(
    async (uid: string): Promise<void> => {
      if (!performerAeTitle) {
        uiNotificationService.show({
          title: 'Complete Failed',
          message: 'Station name not configured — cannot complete workitem.',
          type: 'error',
          duration: 6000,
        });
        setActionState(uid, 'idle');
        return;
      }
      setActionState(uid, 'completing');
      try {
        const txUID = await generateDicomUidFromInstanceAndStation(uid, performerAeTitle);
        // dcm4chee-arc meetFinalStateRequirementsOfCompleted checks the following
        // inside 00741216 (UPS Performed Procedure Sequence):
        //   00404050 PerformedProcedureStepStartDateTime — from claim time (FR-002)
        //   00404051 PerformedProcedureStepEndDateTime   — type 1 (set now)
        //   00404028 PerformedStationNameCodeSequence    — valid Code (FR-004)
        //   00404019 PerformedWorkitemCodeSequence       — valid Code (FR-004)
        const completionDT = formatDicomDT(new Date());
        // DICOM PS3.18 §11.10.3: SQ attributes REPLACE the entire sequence on each
        // updateWorkitem POST — a partial SQ would overwrite 00404050 with nothing.
        // Therefore all four required attributes must be included in this single call.
        const startDT = resolveStartDT(uid, completionDT);
        const stationCode = performerAeTitle;
        const performedCode = {
          '00080100': { vr: 'SH', Value: [stationCode] },
          '00080102': { vr: 'SH', Value: ['99OHIF'] },
          '00080104': { vr: 'LO', Value: ['Completed Workitem'] },
        };
        await dataSource.store.updateWorkitem(
          uid,
          {
            '00741216': {
              vr: 'SQ',
              Value: [
                {
                  '00404050': { vr: 'DT', Value: [startDT] },
                  '00404051': { vr: 'DT', Value: [completionDT] },
                  '00404028': { vr: 'SQ', Value: [performedCode] },
                  '00404019': { vr: 'SQ', Value: [performedCode] },
                },
              ],
            },
          },
          txUID
        );
        await dataSource.store.changeState(uid, 'COMPLETED', txUID);
        claimStartDTsRef.current.delete(uid);
        try {
          localStorage.removeItem(startDtKey(uid));
        } catch {
          /* quota/private */
        }
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
    [dataSource, onRefresh, uiNotificationService, setActionState, resolveStartDT, performerAeTitle]
  );

  const cancel = useCallback(
    async (uid: string, reason?: string): Promise<void> => {
      if (!performerAeTitle) {
        uiNotificationService.show({
          title: 'Cancel Failed',
          message: 'Station name not configured — cannot cancel workitem.',
          type: 'error',
          duration: 6000,
        });
        setActionState(uid, 'idle');
        return;
      }
      setActionState(uid, 'canceling');
      try {
        const txUID = await generateDicomUidFromInstanceAndStation(uid, performerAeTitle);
        const extraAttributes = reason
          ? { '00741238': { vr: 'LO', Value: [reason.substring(0, 256)] } }
          : undefined;
        await dataSource.store.changeState(uid, 'CANCELED', txUID, extraAttributes);
        claimStartDTsRef.current.delete(uid);
        try {
          localStorage.removeItem(startDtKey(uid));
        } catch {
          /* quota/private */
        }
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
    [dataSource, onRefresh, uiNotificationService, setActionState, performerAeTitle]
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
