/**
 * T028 — unit tests for the `resolveTxUID` helper inside `useWorkitemActions`.
 *
 * `resolveTxUID` is an internal function and is tested indirectly through
 * `complete` and `cancel`, which both call it before every state-change request.
 *
 * The SCU is the authoritative source of the Transaction UID.  The SCP does
 * NOT reliably echo it back (dcm4chee-arc does not return tag 00081195 in GET
 * responses).  Resolution order:
 *
 *   (a) In-memory ref  — UID is in `claimedWorkitemsRef` from this render cycle
 *   (b) sessionStorage — UID was persisted during a prior claim in this tab;
 *                        survives a page refresh
 *   (c) Neither found  — throw a descriptive error; surface as an error toast
 */

import { renderHook, act } from '@testing-library/react';
import { useWorkitemActions } from './useWorkitemActions';

// ─── environment polyfills ───────────────────────────────────────────────────

// jsdom does not provide crypto.randomUUID — polyfill
const MOCK_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
// Deterministic DICOM UID produced by uuidToDicomUID(MOCK_UUID)
const MOCK_DICOM_UID = '2.25.' + BigInt('0x' + MOCK_UUID.replace(/-/g, '')).toString(10);

beforeAll(() => {
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => MOCK_UUID },
      writable: true,
      configurable: true,
    });
  } else {
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(
      MOCK_UUID as `${string}-${string}-${string}-${string}-${string}`
    );
  }
});

// Clear sessionStorage between tests to avoid cross-test leakage
beforeEach(() => sessionStorage.clear());

// ─── helpers ────────────────────────────────────────────────────────────────

const UID = 'workitem-uid-001';
const SESSION_KEY = `ups_txuid_${UID}`;
const PERSISTED_TX_UID = '2.25.99999999999999999999';

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

describe('useWorkitemActions — resolveTxUID (T028)', () => {
  /**
   * (a) Cache hit: after a successful `claim`, the Transaction UID is stored
   * in `claimedWorkitemsRef`.  A subsequent `complete` MUST use that in-memory
   * value without touching sessionStorage or retrieve.workitem.
   */
  it('(a) cache hit — uses in-memory ref; does not call retrieve.workitem', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService: makeNotificationService() })
    );

    // Claim populates the in-memory cache
    await act(async () => { await result.current.claim(UID); });

    expect(dataSource.store.changeState).toHaveBeenCalledTimes(1);
    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();

    // Complete uses the cached txUID — no SCP GET needed
    await act(async () => { await result.current.complete(UID); });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    // Second changeState call is for COMPLETED
    expect(dataSource.store.changeState).toHaveBeenCalledTimes(2);
    expect(dataSource.store.changeState).toHaveBeenLastCalledWith(UID, 'COMPLETED', MOCK_DICOM_UID);
  });

  /**
   * (b) sessionStorage hit: the in-memory ref is cold (simulated page refresh)
   * but a prior claim wrote the txUID to sessionStorage.  `complete` MUST
   * read it from sessionStorage and proceed without SCP GET.
   */
  it('(b) sessionStorage hit — reads from sessionStorage; does not call retrieve.workitem', async () => {
    sessionStorage.setItem(SESSION_KEY, PERSISTED_TX_UID);

    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService: makeNotificationService() })
    );

    // Do NOT call claim — memory cache is cold
    await act(async () => { await result.current.complete(UID); });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    expect(dataSource.store.updateWorkitem).toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledWith(UID, 'COMPLETED', PERSISTED_TX_UID);
  });

  /**
   * (b2) sessionStorage hit via cancel: same fallback path, different caller.
   */
  it('(b2) sessionStorage hit via cancel — reads from sessionStorage; proceeds to changeState', async () => {
    sessionStorage.setItem(SESSION_KEY, PERSISTED_TX_UID);

    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService: makeNotificationService() })
    );

    await act(async () => { await result.current.cancel(UID, 'test reason'); });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledWith(
      UID,
      'CANCELED',
      PERSISTED_TX_UID,
      expect.objectContaining({ '00741238': expect.anything() })
    );
  });

  /**
   * (b3) Claim → sessionStorage cleanup: completing a workitem MUST remove
   * its entry from sessionStorage so stale txUIDs cannot be reused.
   */
  it('(b3) complete removes the txUID from sessionStorage', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService: makeNotificationService() })
    );

    await act(async () => { await result.current.claim(UID); });
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    await act(async () => { await result.current.complete(UID); });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  /**
   * (b4) Cancel also removes the txUID from sessionStorage.
   */
  it('(b4) cancel removes the txUID from sessionStorage', async () => {
    const dataSource = makeDataSource();
    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService: makeNotificationService() })
    );

    await act(async () => { await result.current.claim(UID); });
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    await act(async () => { await result.current.cancel(UID); });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  /**
   * (c) Neither memory nor sessionStorage has the txUID (e.g. workitem was
   * claimed in a different tab, or sessionStorage was cleared).
   * `resolveTxUID` MUST throw and the hook MUST surface an error notification
   * without calling changeState.
   */
  it('(c) no txUID available — shows error notification; does not call changeState', async () => {
    // sessionStorage is empty (cleared in beforeEach); no prior claim
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService })
    );

    await act(async () => { await result.current.complete(UID); });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    const { message } = uiNotificationService.show.mock.calls[0][0];
    expect(message).toMatch(/Transaction UID/i);
  });

  /**
   * (c2) Same guard for cancel when txUID is missing.
   */
  it('(c2) cancel with no txUID — shows error notification; does not call changeState', async () => {
    const dataSource = makeDataSource();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh: jest.fn(), uiNotificationService })
    );

    await act(async () => { await result.current.cancel(UID, 'reason'); });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});

