/**
 * Unit tests for `useWorkitemActions` — Transaction UID derivation and action guards.
 *
 * The Transaction UID (txUID) is derived deterministically on demand from
 * (workitemInstanceUID, performerAeTitle) using SHA-256 — no localStorage or
 * in-memory cache is required.  When performerAeTitle is absent, all
 * state-change operations (claim/complete/cancel) are blocked with an error
 * notification.
 */

import { renderHook, act } from '@testing-library/react';
import { useWorkitemActions } from './useWorkitemActions';

// ─── environment polyfills ───────────────────────────────────────────────────

beforeAll(() => {
  // jsdom does not expose TextEncoder / crypto.subtle from Node.js globals — polyfill both.
  if (typeof (globalThis as any).TextEncoder === 'undefined') {
    (globalThis as any).TextEncoder = require('util').TextEncoder;
  }
  if (typeof (globalThis as any).crypto?.subtle === 'undefined') {
    const nodeCrypto = require('crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: nodeCrypto.subtle ?? nodeCrypto.webcrypto?.subtle,
      },
      writable: true,
      configurable: true,
    });
  }
});

// Clear localStorage between tests to avoid cross-test leakage
beforeEach(() => localStorage.clear());

// ─── helpers ────────────────────────────────────────────────────────────────

const UID = 'workitem-uid-001';
// Pre-computed: SHA-256('workitem-uid-001|WORKLIST_SCU'), first 16 bytes → 2.25.<decimal>
const STATION = 'WORKLIST_SCU';
const DETERMINISTIC_UID = '2.25.261487955094107788825981291489004302396';

function makeDataSource() {
  return {
    retrieve: {
      workitem: jest.fn().mockResolvedValue({ '00081195': { Value: ['should-not-be-called'] } }),
    },
    store: {
      changeState: jest.fn().mockResolvedValue(undefined),
      updateWorkitem: jest.fn().mockResolvedValue(undefined),
      cancelWorkitem: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeNotificationService() {
  return { show: jest.fn() };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('useWorkitemActions — deterministic txUID derivation (T028)', () => {
  /**
   * (a) complete() after a successful claim uses the same deterministic UID
   * that was used during claim — derived on demand, no localStorage read needed.
   */
  it('(a) complete uses deterministic UID — same as claim; no retrieve needed', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(dataSource.store.changeState).toHaveBeenCalledTimes(1);
    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledTimes(2);
    expect(dataSource.store.changeState).toHaveBeenLastCalledWith(
      UID,
      'COMPLETED',
      DETERMINISTIC_UID
    );
  });

  /**
   * (b) complete() without a prior claim (cold start) derives the UID on demand
   * — no localStorage or cache required.
   */
  it('(b) complete without prior claim derives UID on demand', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    // No prior claim — cold start
    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledWith(UID, 'COMPLETED', DETERMINISTIC_UID);
  });

  /**
   * (b2) cancel() without prior claim also derives the UID on demand.
   */
  it('(b2) cancel without prior claim derives UID on demand', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.cancel(UID, 'test reason');
    });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledWith(
      UID,
      'CANCELED',
      DETERMINISTIC_UID,
      expect.objectContaining({ '00741238': expect.anything() })
    );
  });

  /**
   * (c) When performerAeTitle is absent, complete() MUST show an error
   * notification and NOT call changeState.
   */
  it('(c) no performerAeTitle — complete shows error; does not call changeState', async () => {
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    const { message } = uiNotificationService.show.mock.calls[0][0];
    expect(message).toMatch(/Station name not configured/i);
  });

  /**
   * (c2) Same guard for cancel when performerAeTitle is absent.
   */
  it('(c2) no performerAeTitle — cancel shows error; does not call changeState', async () => {
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService })
    );

    await act(async () => {
      await result.current.cancel(UID, 'reason');
    });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});

// ─── FR-002 / FR-004 amendment tests (T034) ─────────────────────────────────

const START_DT_KEY = `ups_startdt_${UID}`;

/** Regex matching DICOM DT format YYYYMMDDHHmmss (14 digits) */
const DICOM_DT_RE = /^\d{14}$/;

describe('useWorkitemActions — FR-002: startDT recorded at claim (T034)', () => {
  /**
   * (d) claim() calls updateWorkitem with 00404050 inside 00741216.
   */
  it('(d) claim calls updateWorkitem with 00404050 DT inside 00741216', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    // updateWorkitem should have been called with the 00741216 SQ containing 00404050
    const updateCalls = dataSource.store.updateWorkitem.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const [calledUid, dataset] = updateCalls[0];
    expect(calledUid).toBe(UID);
    const sq = dataset?.['00741216']?.Value?.[0];
    expect(sq).toBeDefined();
    const startDT = sq?.['00404050']?.Value?.[0];
    expect(typeof startDT).toBe('string');
    expect(startDT).toMatch(DICOM_DT_RE);
  });

  /**
   * (e) claim() persists the start DT to localStorage key ups_startdt_{uid}.
   */
  it('(e) claim persists startDT to localStorage key ups_startdt_{uid}', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    const stored = localStorage.getItem(START_DT_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toMatch(DICOM_DT_RE);
  });

  /**
   * (f) complete() MUST re-include 00404050 in the completion updateWorkitem call.
   *
   * DICOM PS3.18 §11.10.3: SQ attributes replace the entire sequence — a partial
   * SQ would silently overwrite 00404050 (set at claim time) with nothing.
   * The value sent must be the claim-time DT stored in localStorage, not the
   * completion timestamp.
   */
  it('(f) complete re-sends 00404050 using the stored claim DT (DICOM SQ-replace semantics)', async () => {
    // Pre-seed a start DT clearly in the past to distinguish it from completionDT
    const PAST_START_DT = '20260101120000';
    localStorage.setItem(START_DT_KEY, PAST_START_DT);

    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    // Find the completion updateWorkitem call (contains 00404051)
    const completionCall = dataSource.store.updateWorkitem.mock.calls.find(
      ([, ds]: [string, Record<string, unknown>]) =>
        (ds as any)?.['00741216']?.Value?.[0]?.['00404051'] !== undefined
    );
    expect(completionCall).toBeDefined();
    const sq = (completionCall![1] as any)['00741216'].Value[0];
    // Start DT must be the claim-time value, not overwritten
    expect(sq['00404050'].Value[0]).toBe(PAST_START_DT);
    // End DT must be a valid DT string and differ from the seeded start
    expect(sq['00404051'].Value[0]).toMatch(DICOM_DT_RE);
    expect(sq['00404051'].Value[0]).not.toBe(PAST_START_DT);
  });

  /**
   * (g) complete() uses performerAeTitle as the code value for
   * 00404028 and 00404019 inside the 00741216 SQ.
   */
  it('(g) complete sets performerAeTitle as code value in 00404028 and 00404019', async () => {
    const dataSource = makeDataSource();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: 'MY_STATION',
      })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    const completionCall = dataSource.store.updateWorkitem.mock.calls.find(
      ([, ds]: [string, Record<string, unknown>]) =>
        (ds as any)?.['00741216']?.Value?.[0]?.['00404051'] !== undefined
    );
    expect(completionCall).toBeDefined();
    const sq = (completionCall![1] as any)['00741216'].Value[0];

    const stationCode = sq['00404028'].Value[0]['00080100'].Value[0];
    const workitemCode = sq['00404019'].Value[0]['00080100'].Value[0];
    expect(stationCode).toBe('MY_STATION');
    expect(workitemCode).toBe('MY_STATION');
  });

  /**
   * (g2) When performerAeTitle is absent, complete() is blocked with an error
   * notification — updateWorkitem must NOT be called.
   */
  it('(g2) complete blocked with error when performerAeTitle is absent', async () => {
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService,
        // no performerAeTitle
      })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.store.updateWorkitem).not.toHaveBeenCalled();
    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  /**
   * (h) complete() and cancel() both remove ups_startdt_{uid} from localStorage.
   */
  it('(h1) complete removes ups_startdt_{uid} from localStorage', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });
    expect(localStorage.getItem(START_DT_KEY)).not.toBeNull();

    await act(async () => {
      await result.current.complete(UID);
    });
    expect(localStorage.getItem(START_DT_KEY)).toBeNull();
  });

  it('(h2) cancel removes ups_startdt_{uid} from localStorage', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });
    expect(localStorage.getItem(START_DT_KEY)).not.toBeNull();

    await act(async () => {
      await result.current.cancel(UID);
    });
    expect(localStorage.getItem(START_DT_KEY)).toBeNull();
  });
});

describe('useWorkitemActions — onClaimSuccess callback', () => {
  /**
   * T-CS-01: onClaimSuccess is called with the workitem UID after a
   * successful claim.
   */
  it('T-CS-01: calls onClaimSuccess with the workitem UID on success', async () => {
    const dataSource = makeDataSource();
    const onClaimSuccess = jest.fn();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
        onClaimSuccess,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(onClaimSuccess).toHaveBeenCalledTimes(1);
    expect(onClaimSuccess).toHaveBeenCalledWith(UID);
  });

  /**
   * T-CS-02: onClaimSuccess is NOT called when changeState rejects
   * (i.e. the claim fails).
   */
  it('T-CS-02: does NOT call onClaimSuccess when claim fails', async () => {
    const dataSource = makeDataSource();
    dataSource.store.changeState = jest.fn().mockRejectedValue(new Error('SCP rejected'));
    const onClaimSuccess = jest.fn();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
        onClaimSuccess,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(onClaimSuccess).not.toHaveBeenCalled();
  });

  /**
   * T-CS-03: omitting onClaimSuccess does not throw when claim succeeds.
   */
  it('T-CS-03: omitting onClaimSuccess is safe — does not throw on success', async () => {
    const dataSource = makeDataSource();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
        // onClaimSuccess intentionally omitted
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });
    // If we reach here, no error was thrown — verify the claim actually completed
    expect(dataSource.store.changeState).toHaveBeenCalledWith(
      UID,
      'IN PROGRESS',
      DETERMINISTIC_UID
    );
  });
});

// ─── Deterministic txUID via performerAeTitle (specs/docs/dicomUid.ts) ──────

describe('useWorkitemActions — deterministic txUID (performerAeTitle)', () => {
  /**
   * When performerAeTitle is configured, claim() MUST use a deterministic
   * UID derived from (workitem UID, station name) — not a random UUID.
   */
  it('uses deterministic UID derived from workitem UID + performerAeTitle', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(dataSource.store.changeState).toHaveBeenCalledWith(
      UID,
      'IN PROGRESS',
      DETERMINISTIC_UID
    );
  });

  /**
   * claim() must NOT persist the txUID to ups_txuid_* in localStorage —
   * the UID is always re-derived on demand.
   */
  it('does NOT persist txUID to ups_txuid_* in localStorage', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService: makeNotificationService(),
        performerAeTitle: STATION,
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(localStorage.getItem(`ups_txuid_${UID}`)).toBeNull();
  });

  /**
   * When performerAeTitle is absent, claim() MUST block with an error
   * notification and NOT call changeState (T022).
   */
  it('shows error and does not call changeState when performerAeTitle is absent', async () => {
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({
        dataSource,
        onRefresh: jest.fn(),
        uiNotificationService,
        // performerAeTitle intentionally omitted
      })
    );

    await act(async () => {
      await result.current.claim(UID);
    });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    const { message } = uiNotificationService.show.mock.calls[0][0];
    expect(message).toMatch(/Station name not configured/i);
  });
});
