/**
 * Tests for WorkItemDetailsModal
 *
 * Covers:
 *  T013 — formatPN, formatDA, formatTM, formatDT, formatValue
 *  T014 — resolveRows (present, absent, SQ)
 *  T015 — RTL render: six section headers
 *  T021 — computeViewerMode (all state branches)
 *  T022 — buildPatch (only changed attrs, SQ serialisation, empty patch)
 *  T023 — RTL edit/read-only render; save round-trip; save failure
 *  T027 — filterRows (tag/label/value match, case-insensitive, empty, no-match)
 *  T028 — RTL filter: matching rows only; clear restores all sections
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WorkItemDetailsModal, {
  formatPN,
  formatDA,
  formatTM,
  formatDT,
  formatSQ,
  formatValue,
  resolveRows,
  computeViewerMode,
  buildPatch,
  filterRows,
  SECTION_DEFINITIONS,
  RawDicom,
  EditState,
} from './WorkItemDetailsModal';

// ─── environment polyfills ────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

const UID = 'workitem-001';
const TX_KEY = `ups_txuid_${UID}`;

function makeDataSource(overrides: {
  workitemResult?: RawDicom;
  updateWorkitemFn?: jest.Mock;
} = {}) {
  const workitem = jest.fn().mockResolvedValue(overrides.workitemResult ?? buildMinimalRawDicom());
  const updateWorkitem = overrides.updateWorkitemFn ?? jest.fn().mockResolvedValue(undefined);
  return {
    retrieve: { workitem },
    store: { updateWorkitem },
  };
}

function makeNotificationService() {
  return { show: jest.fn() };
}

function buildMinimalRawDicom(overrides: Partial<RawDicom> = {}): RawDicom {
  return {
    '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Smith^John' }] },
    '00100020': { vr: 'LO', Value: ['P12345'] },
    '00741000': { vr: 'CS', Value: ['SCHEDULED'] },
    '00741200': { vr: 'CS', Value: ['MEDIUM'] },
    '00404041': { vr: 'CS', Value: ['READY'] },
    ...overrides,
  };
}

function buildInProgressRawDicom(overrides: Partial<RawDicom> = {}): RawDicom {
  return buildMinimalRawDicom({
    '00741000': { vr: 'CS', Value: ['IN PROGRESS'] },
    ...overrides,
  });
}

async function renderModal(props: {
  workitemUID?: string;
  rawDicom?: RawDicom;
  updateWorkitemFn?: jest.Mock;
}) {
  const uid = props.workitemUID ?? UID;
  const ds = makeDataSource({
    workitemResult: props.rawDicom,
    updateWorkitemFn: props.updateWorkitemFn,
  });
  const ns = makeNotificationService();

  render(
    <WorkItemDetailsModal
      workitemUID={uid}
      dataSource={ds}
      uiNotificationService={ns}
    />
  );

  // wait for fetch to complete AND useEditState to initialize
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  // If in edit mode, wait for Priority select to show 'MEDIUM' (useEditState effect ran)
  const priorityEl = screen.queryByDisplayValue('MEDIUM');
  if (priorityEl) {
    // already done
  } else if (screen.queryByRole('button', { name: /^save$/i })) {
    // In edit mode: wait for Priority select to appear with MEDIUM
    await waitFor(() => {
      expect(screen.getByDisplayValue('MEDIUM')).toBeTruthy();
    });
  }
  return { ds, ns };
}

// ─── T013: formatPN ──────────────────────────────────────────────────────────

describe('formatPN', () => {
  it('returns string value as-is', () => {
    expect(formatPN('Doe^Jane')).toBe('Doe^Jane');
  });

  it('returns Alphabetic component when present', () => {
    expect(formatPN({ Alphabetic: 'Smith^John' })).toBe('Smith^John');
  });

  it('falls back to Ideographic when no Alphabetic', () => {
    expect(formatPN({ Ideographic: '山田^太郎' })).toBe('山田^太郎');
  });

  it('falls back to Phonetic when no Alphabetic or Ideographic', () => {
    expect(formatPN({ Phonetic: 'Yamada^Taro' })).toBe('Yamada^Taro');
  });

  it('returns empty string for empty object', () => {
    expect(formatPN({})).toBe('');
  });
});

// ─── T013: formatDA ──────────────────────────────────────────────────────────

describe('formatDA', () => {
  it('converts 8-digit YYYYMMDD to YYYY-MM-DD', () => {
    expect(formatDA('19900115')).toBe('1990-01-15');
  });

  it('returns non-8-digit strings unchanged', () => {
    expect(formatDA('1990-01-15')).toBe('1990-01-15');
    expect(formatDA('')).toBe('');
  });
});

// ─── T013: formatTM ──────────────────────────────────────────────────────────

describe('formatTM', () => {
  it('converts HHMMSS to HH:mm:ss', () => {
    expect(formatTM('143022')).toBe('14:30:22');
  });

  it('handles HHMMSS.ffffff', () => {
    expect(formatTM('143022.123456')).toBe('14:30:22');
  });

  it('returns short strings unchanged', () => {
    expect(formatTM('1430')).toBe('1430');
  });
});

// ─── T013: formatDT ──────────────────────────────────────────────────────────

describe('formatDT', () => {
  it('converts 14-digit DT to YYYY-MM-DD HH:mm:ss', () => {
    expect(formatDT('20230601143022')).toBe('2023-06-01 14:30:22');
  });

  it('converts 8-digit DT (date only) to YYYY-MM-DD', () => {
    expect(formatDT('20230601')).toBe('2023-06-01');
  });

  it('returns other strings unchanged', () => {
    expect(formatDT('2023-06-01')).toBe('2023-06-01');
  });
});

// ─── T013: formatValue ────────────────────────────────────────────────────────

describe('formatValue', () => {
  it('returns — for empty array', () => {
    expect(formatValue('LO', [])).toBe('—');
  });

  it('returns — for null/undefined rawValue', () => {
    expect(formatValue('LO', null as unknown as unknown[])).toBe('—');
    expect(formatValue('LO', undefined as unknown as unknown[])).toBe('—');
  });

  it('formats PN values via formatPN', () => {
    expect(formatValue('PN', [{ Alphabetic: 'Doe^Jane' }])).toBe('Doe^Jane');
  });

  it('formats DA values', () => {
    expect(formatValue('DA', ['19900115'])).toBe('1990-01-15');
  });

  it('formats TM values', () => {
    expect(formatValue('TM', ['143022'])).toBe('14:30:22');
  });

  it('formats DT values', () => {
    expect(formatValue('DT', ['20230601143022'])).toBe('2023-06-01 14:30:22');
  });

  it('formats SQ via formatSQ', () => {
    expect(formatValue('SQ', [{}])).toBe('[1 item]');
    expect(formatValue('SQ', [{}, {}])).toBe('[2 items]');
  });

  it('stringifies other values', () => {
    expect(formatValue('CS', ['SCHEDULED'])).toBe('SCHEDULED');
    expect(formatValue('LO', ['foo', 'bar'])).toBe('foo, bar');
  });

  it('JSON.stringifies objects for unknown VRs', () => {
    const result = formatValue('UN', [{ key: 'val' }]);
    expect(result).toBe('{"key":"val"}');
  });
});

// ─── T013: formatSQ ──────────────────────────────────────────────────────────

describe('formatSQ', () => {
  it('returns singular form for 1 item', () => {
    expect(formatSQ([{}])).toBe('[1 item]');
  });

  it('returns plural form for multiple items', () => {
    expect(formatSQ([{}, {}])).toBe('[2 items]');
  });
});

// ─── T014: resolveRows ────────────────────────────────────────────────────────

describe('resolveRows', () => {
  const patientSection = SECTION_DEFINITIONS[0]; // Patient

  it('returns a row for each attribute definition', () => {
    const rows = resolveRows({}, patientSection);
    expect(rows).toHaveLength(patientSection.attributes.length);
  });

  it('returns "—" value when attribute is absent', () => {
    const rows = resolveRows({}, patientSection);
    expect(rows[0].value).toBe('—');
  });

  it('formats value when attribute is present', () => {
    const raw: RawDicom = {
      '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Smith^John' }] },
    };
    const rows = resolveRows(raw, patientSection);
    const nameRow = rows.find(r => r.tag === '00100010');
    expect(nameRow?.value).toBe('Smith^John');
  });

  it('includes correct formatted tag string', () => {
    const rows = resolveRows({}, patientSection);
    expect(rows[0].formatted).toBe('(0010,0010)');
  });

  it('includes correct label from section definition', () => {
    const rows = resolveRows({}, patientSection);
    expect(rows[0].label).toBe('Patient Name');
  });

  it('sets vr and rawValue from rawDicom element', () => {
    const raw: RawDicom = {
      '00100020': { vr: 'LO', Value: ['P999'] },
    };
    const rows = resolveRows(raw, patientSection);
    const pidRow = rows.find(r => r.tag === '00100020');
    expect(pidRow?.vr).toBe('LO');
    expect(pidRow?.rawValue).toEqual(['P999']);
  });

  it('handles SQ attributes — vr is SQ and rawValue contains items', () => {
    const schedSection = SECTION_DEFINITIONS[2]; // Scheduling
    const raw: RawDicom = {
      '00404018': {
        vr: 'SQ',
        Value: [
          {
            '00080100': { vr: 'SH', Value: ['113013'] },
            '00080102': { vr: 'SH', Value: ['DCM'] },
            '00080104': { vr: 'LO', Value: ['Cardiac MR'] },
          },
        ],
      },
    };
    const rows = resolveRows(raw, schedSection);
    const sqRow = rows.find(r => r.tag === '00404018');
    expect(sqRow?.vr).toBe('SQ');
    expect(sqRow?.rawValue).toHaveLength(1);
  });

  it('D1 — resolveRows covers all defined IHE RRR-WF attributes', () => {
    const allTags = SECTION_DEFINITIONS.flatMap(s => s.attributes.map(a => a.tag));
    // data-model.md defines 25 tags across 6 sections
    expect(allTags.length).toBeGreaterThanOrEqual(24);
    // All tags are unique
    expect(new Set(allTags).size).toBe(allTags.length);
  });

  it('D3 — SQ items with nested SQ are preserved in rawValue', () => {
    const schedSection = SECTION_DEFINITIONS[2];
    const raw: RawDicom = {
      '00404034': {
        vr: 'SQ',
        Value: [
          {
            '00404009': {
              vr: 'SQ',
              Value: [
                {
                  '00080100': { vr: 'SH', Value: ['STATION1'] },
                  '00080102': { vr: 'SH', Value: ['DCM'] },
                  '00080104': { vr: 'LO', Value: ['Station Name'] },
                },
              ],
            },
          },
        ],
      },
    };
    const rows = resolveRows(raw, schedSection);
    const performerRow = rows.find(r => r.tag === '00404034');
    expect(performerRow?.vr).toBe('SQ');
    const nestedItem = (performerRow?.rawValue[0] as Record<string, unknown>)?.['00404009'] as {
      Value: unknown[];
    };
    expect(nestedItem?.Value).toHaveLength(1);
  });
});

// ─── T021: computeViewerMode ──────────────────────────────────────────────────

describe('computeViewerMode', () => {
  it('returns edit when IN PROGRESS + txuid in localStorage', () => {
    localStorage.setItem(TX_KEY, '2.25.12345');
    const raw: RawDicom = { '00741000': { vr: 'CS', Value: ['IN PROGRESS'] } };
    expect(computeViewerMode(raw, UID)).toBe('edit');
  });

  it('returns read-only when IN PROGRESS but no txuid', () => {
    const raw: RawDicom = { '00741000': { vr: 'CS', Value: ['IN PROGRESS'] } };
    expect(computeViewerMode(raw, UID)).toBe('read-only');
  });

  it('returns read-only when SCHEDULED regardless of localStorage', () => {
    localStorage.setItem(TX_KEY, '2.25.12345');
    const raw: RawDicom = { '00741000': { vr: 'CS', Value: ['SCHEDULED'] } };
    expect(computeViewerMode(raw, UID)).toBe('read-only');
  });

  it('returns read-only when COMPLETED', () => {
    localStorage.setItem(TX_KEY, '2.25.12345');
    const raw: RawDicom = { '00741000': { vr: 'CS', Value: ['COMPLETED'] } };
    expect(computeViewerMode(raw, UID)).toBe('read-only');
  });

  it('returns read-only when state attribute is missing', () => {
    localStorage.setItem(TX_KEY, '2.25.12345');
    expect(computeViewerMode({}, UID)).toBe('read-only');
  });
});

// ─── T022: buildPatch ─────────────────────────────────────────────────────────

describe('buildPatch', () => {
  it('returns empty object when nothing changed', () => {
    const raw: RawDicom = {
      '00741200': { vr: 'CS', Value: ['MEDIUM'] },
      '00404041': { vr: 'CS', Value: ['READY'] },
      '00404005': { vr: 'DT', Value: ['20230601143022'] },
      '00404018': {
        vr: 'SQ',
        Value: [
          {
            '00080100': { vr: 'SH', Value: ['113013'] },
            '00080102': { vr: 'SH', Value: ['DCM'] },
            '00080104': { vr: 'LO', Value: ['Cardiac MR'] },
          },
        ],
      },
    };
    const editState: EditState = {
      '00741200': 'MEDIUM',
      '00404041': 'READY',
      '00404005': '20230601143022',
      '00404018': { codeValue: '113013', codingSchemeDesignator: 'DCM', codeMeaning: 'Cardiac MR' },
    };
    expect(buildPatch(editState, raw)).toEqual({});
  });

  it('includes only changed attributes', () => {
    const raw: RawDicom = {
      '00741200': { vr: 'CS', Value: ['MEDIUM'] },
      '00404041': { vr: 'CS', Value: ['READY'] },
    };
    const editState: EditState = {
      '00741200': 'HIGH',
      '00404041': 'READY',
    };
    const patch = buildPatch(editState, raw);
    expect(patch).toHaveProperty('00741200');
    expect(patch).not.toHaveProperty('00404041');
    expect((patch['00741200'] as { Value: string[] }).Value[0]).toBe('HIGH');
  });

  it('serialises SQ code triple correctly', () => {
    const raw: RawDicom = {};
    const editState: EditState = {
      '00404018': { codeValue: '113013', codingSchemeDesignator: 'DCM', codeMeaning: 'Cardiac MR' },
    };
    const patch = buildPatch(editState, raw);
    expect(patch).toHaveProperty('00404018');
    const sqEl = patch['00404018'] as { vr: string; Value: Record<string, unknown>[] };
    expect(sqEl.vr).toBe('SQ');
    expect(sqEl.Value[0]['00080100']).toEqual({ vr: 'SH', Value: ['113013'] });
    expect(sqEl.Value[0]['00080102']).toEqual({ vr: 'SH', Value: ['DCM'] });
    expect(sqEl.Value[0]['00080104']).toEqual({ vr: 'LO', Value: ['Cardiac MR'] });
  });

  it('handles undefined editState fields gracefully', () => {
    const raw: RawDicom = {};
    expect(() => buildPatch({}, raw)).not.toThrow();
    expect(buildPatch({}, raw)).toEqual({});
  });
});

// ─── T027: filterRows ────────────────────────────────────────────────────────

describe('filterRows', () => {
  const rows = [
    {
      tag: '00100010',
      formatted: '(0010,0010)',
      label: 'Patient Name',
      vr: 'PN',
      value: 'Smith^John',
      rawValue: [],
    },
    {
      tag: '00741000',
      formatted: '(0074,1000)',
      label: 'Procedure Step State',
      vr: 'CS',
      value: 'SCHEDULED',
      rawValue: [],
    },
    {
      tag: '00100030',
      formatted: '(0010,0030)',
      label: 'Date of Birth',
      vr: 'DA',
      value: '1990-01-15',
      rawValue: [],
    },
  ];

  it('returns all rows when query is empty', () => {
    expect(filterRows(rows, '')).toHaveLength(3);
  });

  it('matches by tag/formatted', () => {
    const result = filterRows(rows, '0010,0010');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('00100010');
  });

  it('matches by label', () => {
    const result = filterRows(rows, 'patient name');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('00100010');
  });

  it('matches by value', () => {
    const result = filterRows(rows, 'SCHEDULED');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('00741000');
  });

  it('is case-insensitive', () => {
    expect(filterRows(rows, 'smith')).toHaveLength(1);
    expect(filterRows(rows, 'SMITH')).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    expect(filterRows(rows, 'zzznomatch')).toHaveLength(0);
  });

  it('matches multiple rows when query is broad', () => {
    // "0010" appears in both (0010,0010) and (0010,0030)
    const result = filterRows(rows, '0010');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── T015 / T023 / T028: RTL render tests ────────────────────────────────────

describe('WorkItemDetailsModal RTL', () => {
  // T015 — six section headers visible
  it('renders six section headers for a SCHEDULED workitem', async () => {
    await renderModal({});
    expect(screen.getByText('Patient')).toBeTruthy();
    expect(screen.getByText('Study')).toBeTruthy();
    expect(screen.getByText('Scheduling')).toBeTruthy();
    expect(screen.getByText('Requested Procedure')).toBeTruthy();
    expect(screen.getByText('Performed Step')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
  });

  // T015 — shows loading state initially
  it('shows loading text before fetch resolves', () => {
    const workitem = jest.fn(() => new Promise(() => {})); // never resolves
    const ds = { retrieve: { workitem }, store: { updateWorkitem: jest.fn() } };
    render(
      <WorkItemDetailsModal
        workitemUID={UID}
        dataSource={ds}
        uiNotificationService={makeNotificationService()}
      />
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  // T015 — shows error when fetch rejects
  it('shows error message when fetch fails', async () => {
    const workitem = jest.fn().mockRejectedValue(new Error('Network error'));
    const ds = { retrieve: { workitem }, store: { updateWorkitem: jest.fn() } };
    render(
      <WorkItemDetailsModal
        workitemUID={UID}
        dataSource={ds}
        uiNotificationService={makeNotificationService()}
      />
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  // T023a — edit mode shows Save/Discard buttons
  it('renders Save and Discard buttons in edit mode', async () => {
    localStorage.setItem(TX_KEY, '2.25.999');
    await renderModal({ rawDicom: buildInProgressRawDicom() });
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
  });

  // T023b — read-only mode has no Save button
  it('does not render Save button for SCHEDULED workitem', async () => {
    await renderModal({});
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  // T023b — Save is disabled when nothing changed
  it('Save button is disabled when editState matches loaded values', async () => {
    localStorage.setItem(TX_KEY, '2.25.999');
    await renderModal({ rawDicom: buildInProgressRawDicom() });
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toHaveProperty('disabled', true);
  });

  // T023c — Save calls updateWorkitem with correct patch
  it('calls updateWorkitem with patch when a field changes and Save is clicked', async () => {
    localStorage.setItem(TX_KEY, '2.25.999');
    const updateWorkitemFn = jest.fn().mockResolvedValue(undefined);
    const workitem = jest.fn().mockResolvedValue(buildInProgressRawDicom());
    const ds = { retrieve: { workitem }, store: { updateWorkitem: updateWorkitemFn } };
    const ns = makeNotificationService();

    render(
      <WorkItemDetailsModal
        workitemUID={UID}
        dataSource={ds}
        uiNotificationService={ns}
      />
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    // Wait for useEditState effect to initialize — Priority select shows 'MEDIUM'
    await waitFor(() => {
      expect(screen.getByDisplayValue('MEDIUM')).toBeTruthy();
    });

    // Change Scheduled Start DateTime (text input)
    const dtInput = screen.getByPlaceholderText('YYYYMMDDHHmmss') as HTMLInputElement;
    fireEvent.input(dtInput, { target: { value: '20230601143022' } });

    // Wait for the DOM to reflect the new value (confirms state updated)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('YYYYMMDDHHmmss').value).toBe('20230601143022');
    });

    // Click Save (state has been updated so isDirty should be true)
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateWorkitemFn).toHaveBeenCalledWith(
        UID,
        expect.objectContaining({
          '00404005': expect.objectContaining({ Value: ['20230601143022'] }),
        }),
        '2.25.999'
      );
    });
    expect(ns.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  // T023d — save failure retains unsaved edits
  it('shows error notification and retains edits when updateWorkitem throws', async () => {
    localStorage.setItem(TX_KEY, '2.25.999');
    const updateWorkitemFn = jest.fn().mockRejectedValue(new Error('Server error'));
    const workitem = jest.fn().mockResolvedValue(buildInProgressRawDicom());
    const ds = { retrieve: { workitem }, store: { updateWorkitem: updateWorkitemFn } };
    const ns = makeNotificationService();
    render(
      <WorkItemDetailsModal
        workitemUID={UID}
        dataSource={ds}
        uiNotificationService={ns}
      />
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    // Wait for useEditState effect to initialize — Priority select shows 'MEDIUM'
    await waitFor(() => {
      expect(screen.getByDisplayValue('MEDIUM')).toBeTruthy();
    });

    const dtInput = screen.getByPlaceholderText('YYYYMMDDHHmmss') as HTMLInputElement;
    fireEvent.input(dtInput, { target: { value: '20230601143022' } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('YYYYMMDDHHmmss').value).toBe('20230601143022');
    });

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(ns.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });
    // Scheduled DT field still shows the changed value
    expect(screen.getByPlaceholderText('YYYYMMDDHHmmss').value).toBe('20230601143022');
  });

  // Discard resets edits
  it('Discard button resets edits to loaded values', async () => {
    localStorage.setItem(TX_KEY, '2.25.999');
    await renderModal({ rawDicom: buildInProgressRawDicom() });

    const dtInput = screen.getByPlaceholderText('YYYYMMDDHHmmss') as HTMLInputElement;
    fireEvent.input(dtInput, { target: { value: '20230601143022' } });
    await waitFor(() => {
      expect(dtInput.value).toBe('20230601143022');
    });

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    await waitFor(() => {
      expect(dtInput.value).toBe('');
    });
  });

  // T028 — filter narrows displayed rows
  it('hides non-matching sections when filter is applied', async () => {
    await renderModal({});

    const filterInput = screen.getByRole('textbox', {
      name: /filter attributes/i,
    });
    fireEvent.change(filterInput, { target: { value: '0010' } });

    // Patient section rows contain (0010,*) tags → Patient section should remain
    expect(screen.getByText('Patient')).toBeTruthy();
    // Scheduling section has no (0010,*) tags → should be hidden
    expect(screen.queryByText('Scheduling')).toBeNull();
  });

  // T028 — clearing filter restores all sections
  it('restores all sections when filter is cleared', async () => {
    await renderModal({});

    const filterInput = screen.getByRole('textbox', { name: /filter attributes/i });
    fireEvent.change(filterInput, { target: { value: '0010' } });
    fireEvent.change(filterInput, { target: { value: '' } });

    expect(screen.getByText('Scheduling')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
  });
});
