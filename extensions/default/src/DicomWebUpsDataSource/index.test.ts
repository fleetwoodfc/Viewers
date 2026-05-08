// Mock the upstream DicomWeb datasource to avoid resolving its deep dependency
// chain (qido.js → @ohif/core/src/utils/sortStudy) through the jest mapper.
jest.mock('../DicomWebDataSource/index', () => ({
  createDicomWebApi: jest.fn().mockReturnValue({
    initialize: jest.fn(),
    query: {
      studies: { mapParams: jest.fn(), search: jest.fn(), processResults: jest.fn() },
      series: {},
      instances: {},
    },
    retrieve: {},
    store: { dicom: jest.fn() },
    getConfig: jest.fn().mockReturnValue({}),
  }),
}));

jest.mock('@ohif/core', () => ({
  IWebApiDataSource: {
    create: jest.fn((impl: unknown) => impl),
  },
  DICOMWeb: {
    getString: jest.fn((el: { Value?: unknown[] } | undefined) => el?.Value?.[0] ?? ''),
    getName: jest.fn((el: { Value?: unknown[] } | undefined) => el?.Value?.[0] ?? ''),
  },
  utils: {
    formatPN: jest.fn((s: unknown) => s ?? ''),
  },
}));

import { createDicomWebUpsApi } from './index';

// ---------------------------------------------------------------------------
// Helpers / scaffold (T002)
// ---------------------------------------------------------------------------

const UPS_ROOT = '/wado/rs';
const BASE = 'http://localhost';

const mockGetAuthorizationHeader = jest
  .fn()
  .mockReturnValue({ Authorization: 'Bearer test-token' });

const mockServicesManager = {
  services: {
    userAuthenticationService: {
      getAuthorizationHeader: mockGetAuthorizationHeader,
    },
  },
};

const upsConfig = {
  name: 'test-ups',
  upsRoot: UPS_ROOT,
};

/** Build a minimal mock Response */
function mockResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

/** Assert fetch was called with the Authorization header */
function expectAuthHeader() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
}

let ds: ReturnType<typeof createDicomWebUpsApi>;

beforeAll(() => {
  // createDicomWebApi requires a minimal dicomweb-client-compatible config;
  // the UPS datasource only uses upsRoot for the operations under test.
  Object.defineProperty(window, 'location', {
    value: { origin: BASE },
    writable: true,
  });

  ds = createDicomWebUpsApi(upsConfig as any, mockServicesManager as any);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthorizationHeader.mockReturnValue({ Authorization: 'Bearer test-token' });
});

// ---------------------------------------------------------------------------
// T006 — query.workitems.search
// ---------------------------------------------------------------------------

describe('query.workitems.search', () => {
  it('calls GET /workitems with mapped params', async () => {
    const workitem = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, [workitem]));

    await ds.query.workitems.search({ patientId: 'P001' });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems`);
    expect(url).toContain('00100020=P001');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, []));
    await ds.query.workitems.search({});
    expectAuthHeader();
  });

  it('returns empty array on 204 No Content', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(204));

    const result = await ds.query.workitems.search({});
    expect(result).toEqual([]);
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(500));
    await expect(ds.query.workitems.search({})).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T007 — retrieve.workitem
// ---------------------------------------------------------------------------

describe('retrieve.workitem', () => {
  const UID = '1.2.3.4.5';

  it('calls GET /workitems/{uid}', async () => {
    const item = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, [item]));

    await ds.retrieve.workitem(UID);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}`);
  });

  it('includes Authorization header', async () => {
    const item = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, [item]));
    await ds.retrieve.workitem(UID);
    expectAuthHeader();
  });

  it('returns the first element of the JSON array', async () => {
    const item = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, [item, {}]));

    const result = await ds.retrieve.workitem(UID);
    expect(result).toEqual(item);
  });

  it('throws on 404', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(404));
    await expect(ds.retrieve.workitem(UID)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T008 — store.workitem (create)
// ---------------------------------------------------------------------------

describe('store.workitem', () => {
  const dataset = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };

  it('calls POST /workitems without uid', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));

    await ds.store.workitem(dataset);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(new RegExp(`${UPS_ROOT}/workitems(\\?|$)`));
    expect(url).not.toContain('AffectedSOPInstanceUID');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(dataset));
  });

  it('calls POST /workitems?AffectedSOPInstanceUID=uid when uid provided', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));

    await ds.store.workitem(dataset, '9.9.9');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('AffectedSOPInstanceUID=9.9.9');
    expect(url).not.toMatch(/\/workitems\/9\.9\.9/);
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));
    await ds.store.workitem(dataset);
    expectAuthHeader();
  });

  it('body is JSON-serialised dataset', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));
    await ds.store.workitem(dataset);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(dataset);
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(409));
    await expect(ds.store.workitem(dataset)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T010 — store.updateWorkitem
// ---------------------------------------------------------------------------

describe('store.updateWorkitem', () => {
  const UID = '1.2.3';
  const delta = { '00741204': { vr: 'LO', Value: ['Updated'] } };

  it('calls POST /workitems/{uid}', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));

    await ds.store.updateWorkitem(UID, delta);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}`);
    expect(init.method).toBe('POST');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.updateWorkitem(UID, delta);
    expectAuthHeader();
  });

  it('body is JSON-serialised dataset (no txUID)', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.updateWorkitem(UID, delta);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(delta);
  });

  it('merges transactionUID into body as tag 00081195', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));

    await ds.store.updateWorkitem(UID, delta, 'tx-001');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    // dcm4chee-arc requires txUID in the body, not as a query parameter
    expect(url).not.toContain('transaction');
    const body = JSON.parse(init.body);
    expect(body['00081195']).toEqual({ vr: 'UI', Value: ['tx-001'] });
    expect(body['00741204']).toEqual(delta['00741204']);
  });

  it('does not add 00081195 when transactionUID omitted', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.updateWorkitem(UID, delta);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)['00081195']).toBeUndefined();
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(400));
    await expect(ds.store.updateWorkitem(UID, delta)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T011 — store.changeState
// ---------------------------------------------------------------------------

describe('store.changeState', () => {
  const UID = '1.2.3';

  it('calls PUT /workitems/{uid}/state', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));

    await ds.store.changeState(UID, 'IN PROGRESS', 'tx-001');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/state`);
    expect(init.method).toBe('PUT');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.changeState(UID, 'IN PROGRESS', 'tx-001');
    expectAuthHeader();
  });

  it('DICOM body contains state tag', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.changeState(UID, 'COMPLETED', 'tx-001');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body['00741000'].Value[0]).toBe('COMPLETED');
  });

  it('DICOM body contains transactionUID tag when provided', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.changeState(UID, 'IN PROGRESS', 'tx-abc');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body['00081195'].Value[0]).toBe('tx-abc');
  });

  it('omits transactionUID tag when not provided', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.changeState(UID, 'CANCELED');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body['00081195']).toBeUndefined();
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(409));
    await expect(ds.store.changeState(UID, 'IN PROGRESS', 'tx')).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// store.changeState — dcm4chee-arc AET suffix (T005a / dcm4chee compatibility)
// ---------------------------------------------------------------------------

describe('store.changeState with performerAeTitle', () => {
  const UID = '1.2.3';
  const AET = 'WORKLIST_SCU';
  let dsWithAet: ReturnType<typeof createDicomWebUpsApi>;

  beforeAll(() => {
    dsWithAet = createDicomWebUpsApi(
      { ...upsConfig, performerAeTitle: AET } as any,
      mockServicesManager as any
    );
  });

  it('appends AE title to URL: PUT /workitems/{uid}/state/{aet}', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await dsWithAet.store.changeState(UID, 'IN PROGRESS', 'tx-001');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/state/${AET}`);
  });

  it('omits AE title suffix when performerAeTitle is absent', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.changeState(UID, 'IN PROGRESS', 'tx-001');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/state`);
    expect(url).not.toMatch(/\/state\/[^/]+$/);
  });
});

// ---------------------------------------------------------------------------
// T013 — store.cancelWorkitem
// ---------------------------------------------------------------------------

describe('store.cancelWorkitem', () => {
  const UID = '1.2.3';

  it('calls POST /workitems/{uid}/cancelrequest', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(202));

    await ds.store.cancelWorkitem(UID);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/cancelrequest`);
    expect(init.method).toBe('POST');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(202));
    await ds.store.cancelWorkitem(UID);
    expectAuthHeader();
  });

  it('treats 202 Accepted as success (no throw)', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(202));
    await expect(ds.store.cancelWorkitem(UID)).resolves.not.toThrow();
  });

  it('throws on non-2xx response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(409));
    await expect(ds.store.cancelWorkitem(UID)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T017 — store.subscribe (fixed)
// ---------------------------------------------------------------------------

describe('store.subscribe', () => {
  const UID = '1.2.3';
  const AE = 'MY_AE';

  it('calls POST /workitems/{uid}/subscribers/{aeTitle}', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));

    await ds.store.subscribe(UID, AE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/subscribers/${AE}`);
    expect(init.method).toBe('POST');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));
    await ds.store.subscribe(UID, AE);
    expectAuthHeader();
  });

  it('appends ?deletionlock=1 when deletionLock is true', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));

    await ds.store.subscribe(UID, AE, true);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('deletionlock=1');
  });

  it('does not append deletionlock when deletionLock is false/omitted', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(201));
    await ds.store.subscribe(UID, AE);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).not.toContain('deletionlock');
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(409));
    await expect(ds.store.subscribe(UID, AE)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T018 — store.suspendSubscription
// ---------------------------------------------------------------------------

describe('store.suspendSubscription', () => {
  const AE = 'MY_AE';
  const GLOBAL_UID = '1.2.840.10008.5.1.4.34.5';

  it('calls POST /workitems/{globalUID}/subscribers/{aeTitle}', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));

    await ds.store.suspendSubscription(AE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${GLOBAL_UID}/subscribers/${AE}`);
    expect(init.method).toBe('POST');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.suspendSubscription(AE);
    expectAuthHeader();
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(500));
    await expect(ds.store.suspendSubscription(AE)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T019 — store.deleteSubscription
// ---------------------------------------------------------------------------

describe('store.deleteSubscription', () => {
  const UID = '1.2.3';
  const AE = 'MY_AE';

  it('calls DELETE /workitems/{uid}/subscribers/{aeTitle}', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));

    await ds.store.deleteSubscription(UID, AE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/workitems/${UID}/subscribers/${AE}`);
    expect(init.method).toBe('DELETE');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.store.deleteSubscription(UID, AE);
    expectAuthHeader();
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(404));
    await expect(ds.store.deleteSubscription(UID, AE)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T020 — retrieve.subscriptionChannel
// ---------------------------------------------------------------------------

describe('retrieve.subscriptionChannel', () => {
  const AE = 'MY_AE';

  it('calls GET /subscribers/{aeTitle}', async () => {
    const resp = mockResponse(200);
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(resp);

    await ds.retrieve.subscriptionChannel(AE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(`${UPS_ROOT}/subscribers/${AE}`);
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('includes Authorization header', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200));
    await ds.retrieve.subscriptionChannel(AE);
    expectAuthHeader();
  });

  it('returns the raw Response object', async () => {
    const resp = mockResponse(200);
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(resp);
    const result = await ds.retrieve.subscriptionChannel(AE);
    expect(result).toBe(resp);
  });

  it('throws on non-OK response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(404));
    await expect(ds.retrieve.subscriptionChannel(AE)).rejects.toThrow('UPS-RS');
  });
});

// ---------------------------------------------------------------------------
// T024 — Authorization header present on every operation
// ---------------------------------------------------------------------------

describe('FR-011 / SC-002 — Authorization header on all operations', () => {
  const UID = '1.2.3';
  const AE = 'MY_AE';
  const dataset = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };

  const operations: Array<[string, () => Promise<unknown>]> = [
    ['query.workitems.search', () => ds.query.workitems.search({})],
    ['retrieve.workitem', () => ds.retrieve.workitem(UID)],
    ['store.workitem (create)', () => ds.store.workitem(dataset)],
    ['store.updateWorkitem', () => ds.store.updateWorkitem(UID, dataset)],
    ['store.changeState', () => ds.store.changeState(UID, 'CANCELED')],
    ['store.cancelWorkitem', () => ds.store.cancelWorkitem(UID)],
    ['store.subscribe', () => ds.store.subscribe(UID, AE)],
    ['store.suspendSubscription', () => ds.store.suspendSubscription(AE)],
    ['store.deleteSubscription', () => ds.store.deleteSubscription(UID, AE)],
    ['retrieve.subscriptionChannel', () => ds.retrieve.subscriptionChannel(AE)],
  ];

  test.each(operations)('%s sends Authorization header', async (_name, op) => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue(mockResponse(200, []));
    await op().catch(() => {
      /* some ops may throw on empty response — headers already sent */
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init?.headers ?? (global.fetch as jest.Mock).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    });
  });
});

// ---------------------------------------------------------------------------
// T025 — SC-004 end-to-end chain test
// ---------------------------------------------------------------------------

describe('SC-004 — end-to-end work item lifecycle', () => {
  it('create → retrieve → update → changeState(IN PROGRESS) → changeState(COMPLETED)', async () => {
    const UID = '1.2.840.99999.1';
    const TX_UID = 'tx-e2e-001';
    const dataset = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    const delta = { '00741204': { vr: 'LO', Value: ['Updated desc'] } };

    const calls: string[] = [];

    (global.fetch as jest.Mock) = jest
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);

        if (
          method === 'POST' &&
          url.includes('/workitems') &&
          !url.includes('/state') &&
          !url.match(/\/workitems\/[^/]+\/sub|cancelrequest/)
        ) {
          // create or update
          if (url.includes('AffectedSOPInstanceUID') || !url.match(/workitems\/[^?]+$/)) {
            return Promise.resolve(
              mockResponse(201, null, { Location: `/wado/rs/workitems/${UID}` })
            );
          }
          return Promise.resolve(mockResponse(200));
        }
        if (method === 'GET') {
          return Promise.resolve(
            mockResponse(200, [{ ...dataset, '00080018': { vr: 'UI', Value: [UID] } }])
          );
        }
        if (method === 'PUT') {
          return Promise.resolve(mockResponse(200));
        }
        return Promise.resolve(mockResponse(200));
      });

    // Step 1: Create
    const createResp = await ds.store.workitem(dataset, UID);
    expect(createResp.status).toBe(201);

    // Step 2: Retrieve
    const retrieved = await ds.retrieve.workitem(UID);
    expect(retrieved).toBeDefined();

    // Step 3: Update
    await ds.store.updateWorkitem(UID, delta, TX_UID);

    // Step 4: Change state → IN PROGRESS
    await ds.store.changeState(UID, 'IN PROGRESS', TX_UID);

    // Step 5: Change state → COMPLETED
    await ds.store.changeState(UID, 'COMPLETED', TX_UID);

    // Assert correct HTTP methods were used in order
    expect(calls[0]).toContain('POST'); // create
    expect(calls[1]).toContain('GET'); // retrieve
    expect(calls[2]).toContain('POST'); // update
    expect(calls[3]).toContain('PUT'); // changeState IN PROGRESS
    expect(calls[4]).toContain('PUT'); // changeState COMPLETED
    expect(calls).toHaveLength(5);
  });
});
