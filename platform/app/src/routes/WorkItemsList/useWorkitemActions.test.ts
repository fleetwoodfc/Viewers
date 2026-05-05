/**
 * T028 — unit tests for the `resolveTxUID` helper inside `useWorkitemActions`.
 *
 * `resolveTxUID` is an internal callback and therefore tested indirectly
 * through `complete` and `cancel`, which both call it before every
 * state-change request.
 *
 * Coverage required by T028:
 *   (a) Cache hit  — UID is already in `claimedWorkitemsRef`; SCP GET is
 *                    never called.
 *   (b) Cache miss — `claimedWorkitemsRef` is empty (e.g. after page refresh);
 *                    the hook calls `dataSource.retrieve.workitem(uid)` and
 *                    reads tag 00081195.
 *   (c) 00081195 absent — SCP returns the workitem but the tag is missing;
 *                    the hook throws a descriptive error.
 */

import { renderHook, act } from '@testing-library/react';
import { useWorkitemActions } from './useWorkitemActions';

// ─── environment polyfill ────────────────────────────────────────────────────

// jsdom does not provide crypto.randomUUID — polyfill for test (a)
const MOCK_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
beforeAll(() => {
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => MOCK_UUID },
      writable: true,
      configurable: true,
    });
  } else {
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(MOCK_UUID as `${string}-${string}-${string}-${string}-${string}`);
  }
});

// ─── helpers ────────────────────────────────────────────────────────────────

const UID = 'workitem-uid-001';
const TX_UID = '2.25.12345678901234567890';

function makeDataSource(overrides: Record<string, unknown> = {}) {
  return {
    retrieve: {
      workitem: jest.fn().mockResolvedValue({
        '00081195': { Value: [TX_UID] },
      }),
    },
    store: {
      changeState: jest.fn().mockResolvedValue(undefined),
      updateWorkitem: jest.fn().mockResolvedValue(undefined),
      cancelWorkitem: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeNotificationService() {
  return { show: jest.fn() };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('useWorkitemActions — resolveTxUID (T028)', () => {
  /**
   * (a) Cache hit: after a successful `claim`, the Transaction UID is stored
   * in `claimedWorkitemsRef`. A subsequent `complete` MUST use that cached
   * value and MUST NOT issue a GET request.
   */
  it('(a) cache hit — uses claimedWorkitemsRef; does NOT call retrieve.workitem', async () => {
    const dataSource = makeDataSource();
    const onRefresh = jest.fn();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh, uiNotificationService })
    );

    // Claim populates the cache
    await act(async () => {
      await result.current.claim(UID);
    });

    // The claim called changeState once; retrieve.workitem not called
    expect(dataSource.store.changeState).toHaveBeenCalledTimes(1);
    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();

    // Complete should use the cached txUID — no GET needed
    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.retrieve.workitem).not.toHaveBeenCalled();
    // changeState called a second time (for COMPLETED)
    expect(dataSource.store.changeState).toHaveBeenCalledTimes(2);
  });

  /**
   * (b) Cache miss: the session cache is cold (no prior claim in this session,
   * e.g. after page refresh). `complete` must fall back to
   * `dataSource.retrieve.workitem(uid)` and read tag 00081195.
   */
  it('(b) cache miss — calls retrieve.workitem and reads tag 00081195', async () => {
    const dataSource = makeDataSource();
    const onRefresh = jest.fn();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh, uiNotificationService })
    );

    // Do NOT call claim — cache is cold
    await act(async () => {
      await result.current.complete(UID);
    });

    // Must have called retrieve.workitem to get the txUID
    expect(dataSource.retrieve.workitem).toHaveBeenCalledWith(UID);
    // And then proceeded to call updateWorkitem + changeState
    expect(dataSource.store.updateWorkitem).toHaveBeenCalled();
    expect(dataSource.store.changeState).toHaveBeenCalledWith(UID, 'COMPLETED', TX_UID);
  });

  /**
   * (b2) Cache miss via cancel: same fallback through a different caller.
   */
  it('(b2) cache miss via cancel — calls retrieve.workitem and reads tag 00081195', async () => {
    const dataSource = makeDataSource();
    const onRefresh = jest.fn();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh, uiNotificationService })
    );

    await act(async () => {
      await result.current.cancel(UID, 'test reason');
    });

    expect(dataSource.retrieve.workitem).toHaveBeenCalledWith(UID);
    expect(dataSource.store.changeState).toHaveBeenCalledWith(
      UID,
      'CANCELED',
      TX_UID,
      expect.objectContaining({ '00741238': expect.anything() })
    );
  });

  /**
   * (c) Tag 00081195 absent: SCP returns the workitem but the Transaction UID
   * tag is missing. `resolveTxUID` must throw a descriptive error; the hook
   * must surface it as an error notification and NOT call changeState.
   */
  it('(c) 00081195 absent — throws and shows error notification; does not call changeState', async () => {
    const dataSource = makeDataSource({
      retrieve: {
        workitem: jest.fn().mockResolvedValue({
          // 00081195 deliberately absent
          '00100020': { Value: ['PATIENT001'] },
        }),
      },
    });
    const onRefresh = jest.fn();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh, uiNotificationService })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    // changeState must NOT have been called — the action aborted
    expect(dataSource.store.changeState).not.toHaveBeenCalled();

    // An error notification must have been shown
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    const notification = uiNotificationService.show.mock.calls[0][0];
    expect(notification.message).toMatch(/Transaction UID.*00081195|00081195.*Transaction UID/i);
  });

  /**
   * (c2) SCP GET itself fails (network error): must show an error notification
   * and not call changeState.
   */
  it('(c2) retrieve.workitem throws — shows error notification; does not call changeState', async () => {
    const dataSource = makeDataSource({
      retrieve: {
        workitem: jest.fn().mockRejectedValue(new Error('Network timeout')),
      },
    });
    const onRefresh = jest.fn();
    const uiNotificationService = makeNotificationService();

    const { result } = renderHook(() =>
      useWorkitemActions({ dataSource, onRefresh, uiNotificationService })
    );

    await act(async () => {
      await result.current.complete(UID);
    });

    expect(dataSource.store.changeState).not.toHaveBeenCalled();
    expect(uiNotificationService.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});
