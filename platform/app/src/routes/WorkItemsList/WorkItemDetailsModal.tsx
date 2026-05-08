import React, { useCallback, useEffect, useMemo, useState } from 'react';

// ─── Types (T004) ─────────────────────────────────────────────────────────────

export type DicomElement = {
  vr: string;
  Value?: unknown[];
  BulkDataURI?: string;
  InlineBinary?: string;
};

export type RawDicom = Record<string, DicomElement>;

export interface AttributeRow {
  tag: string;
  formatted: string;
  label: string;
  vr: string;
  value: string;
  rawValue: unknown[];
}

export interface AttributeDefinition {
  tag: string;
  label: string;
  editable?: boolean;
  editType?: 'text' | 'select' | 'codeTriple';
  selectOptions?: string[];
}

export interface SectionDefinition {
  title: string;
  attributes: AttributeDefinition[];
}

export interface EditState {
  '00741200'?: string;
  '00404005'?: string;
  '00404041'?: string;
  '00404018'?: { codeValue: string; codingSchemeDesignator: string; codeMeaning: string };
}

export type ViewerMode = 'read-only' | 'edit';

// ─── Section Definitions (T005) ───────────────────────────────────────────────

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    title: 'Patient',
    attributes: [
      { tag: '00100010', label: 'Patient Name' },
      { tag: '00100020', label: 'Patient ID' },
      { tag: '00100030', label: 'Date of Birth' },
      { tag: '00100040', label: 'Sex' },
    ],
  },
  {
    title: 'Study',
    attributes: [
      { tag: '00080050', label: 'Accession Number' },
      { tag: '0020000D', label: 'Study Instance UID' },
      { tag: '00081030', label: 'Study Description' },
      { tag: '00080060', label: 'Modality' },
    ],
  },
  {
    title: 'Scheduling',
    attributes: [
      { tag: '00741000', label: 'Procedure Step State' },
      {
        tag: '00741200',
        label: 'Priority',
        editable: true,
        editType: 'select',
        selectOptions: ['HIGH', 'MEDIUM', 'LOW'],
      },
      { tag: '00404005', label: 'Scheduled Start DateTime', editable: true, editType: 'text' },
      {
        tag: '00404041',
        label: 'Input Readiness State',
        editable: true,
        editType: 'select',
        selectOptions: ['INCOMPLETE', 'UNAVAILABLE', 'READY'],
      },
      { tag: '00404018', label: 'Scheduled Workitem Code', editable: true, editType: 'codeTriple' },
      { tag: '00404025', label: 'Scheduled Station Name Code' },
      { tag: '00404034', label: 'Scheduled Human Performer' },
    ],
  },
  {
    title: 'Requested Procedure',
    attributes: [
      { tag: '00401001', label: 'Requested Procedure ID' },
      { tag: '00321060', label: 'Requested Procedure Description' },
      { tag: '0040A370', label: 'Referenced Request' },
    ],
  },
  {
    title: 'Performed Step',
    attributes: [
      { tag: '00081195', label: 'Transaction UID' },
      { tag: '00404050', label: 'Performed Step Start DateTime' },
      { tag: '00404051', label: 'Performed Step End DateTime' },
      { tag: '00404028', label: 'Performed Station Name Code' },
      { tag: '00404019', label: 'Performed Workitem Code' },
      { tag: '00741238', label: 'Reason for Cancellation' },
    ],
  },
  {
    title: 'Output',
    attributes: [{ tag: '00404033', label: 'Output Information' }],
  },
];

// ─── Value Formatting (T006) ──────────────────────────────────────────────────

export function formatPN(value: unknown): string {
  if (typeof value === 'string') return value;
  const v = value as Record<string, string | undefined>;
  return v?.Alphabetic ?? v?.Ideographic ?? v?.Phonetic ?? '';
}

export function formatDA(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

export function formatTM(value: string): string {
  if (/^\d{6}/.test(value)) {
    return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
  }
  return value;
}

export function formatDT(value: string): string {
  if (/^\d{14}/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }
  if (/^\d{8}$/.test(value)) {
    return formatDA(value);
  }
  return value;
}

export function formatSQ(items: unknown[]): string {
  return `[${items.length} item${items.length !== 1 ? 's' : ''}]`;
}

export function formatValue(vr: string, rawValue: unknown[]): string {
  if (!rawValue || rawValue.length === 0) return '—';
  switch (vr) {
    case 'PN': {
      const parts = rawValue.map(v => formatPN(v)).filter(Boolean);
      return parts.length ? parts.join(', ') : '—';
    }
    case 'DA':
      return rawValue.map(v => formatDA(String(v))).join(', ');
    case 'TM':
      return rawValue.map(v => formatTM(String(v))).join(', ');
    case 'DT':
      return rawValue.map(v => formatDT(String(v))).join(', ');
    case 'SQ':
      return formatSQ(rawValue);
    default:
      return rawValue
        .map(v => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)))
        .join(', ');
  }
}

// ─── resolveRows (T007) ───────────────────────────────────────────────────────

export function resolveRows(rawDicom: RawDicom, sectionDef: SectionDefinition): AttributeRow[] {
  return sectionDef.attributes.map(attr => {
    const element = rawDicom[attr.tag];
    const vr = element?.vr ?? '';
    const rawValue = element?.Value ?? [];
    const value = element ? formatValue(vr, rawValue) : '—';
    return {
      tag: attr.tag,
      formatted: `(${attr.tag.slice(0, 4)},${attr.tag.slice(4)})`,
      label: attr.label,
      vr,
      value,
      rawValue,
    };
  });
}

// ─── computeViewerMode (T008) ─────────────────────────────────────────────────

export function computeViewerMode(rawDicom: RawDicom, uid: string): ViewerMode {
  const state = rawDicom['00741000']?.Value?.[0];
  const txuid = localStorage.getItem(`ups_txuid_${uid}`);
  return state === 'IN PROGRESS' && txuid !== null ? 'edit' : 'read-only';
}

// ─── buildPatch (T009) ────────────────────────────────────────────────────────

export function buildPatch(
  editState: EditState,
  rawDicom: RawDicom
): Record<string, DicomElement> {
  const patch: Record<string, DicomElement> = {};

  if (editState['00741200'] !== undefined) {
    const current = (rawDicom['00741200']?.Value?.[0] as string) ?? '';
    if (editState['00741200'] !== current) {
      patch['00741200'] = { vr: 'CS', Value: [editState['00741200']] };
    }
  }

  if (editState['00404005'] !== undefined) {
    const current = (rawDicom['00404005']?.Value?.[0] as string) ?? '';
    if (editState['00404005'] !== current) {
      patch['00404005'] = { vr: 'DT', Value: [editState['00404005']] };
    }
  }

  if (editState['00404041'] !== undefined) {
    const current = (rawDicom['00404041']?.Value?.[0] as string) ?? '';
    if (editState['00404041'] !== current) {
      patch['00404041'] = { vr: 'CS', Value: [editState['00404041']] };
    }
  }

  if (editState['00404018'] !== undefined) {
    const currentItem = (rawDicom['00404018']?.Value?.[0] as Record<string, DicomElement>) ?? {};
    const currentCode = (currentItem['00080100']?.Value?.[0] as string) ?? '';
    const currentScheme = (currentItem['00080102']?.Value?.[0] as string) ?? '';
    const currentMeaning = (currentItem['00080104']?.Value?.[0] as string) ?? '';
    const { codeValue, codingSchemeDesignator, codeMeaning } = editState['00404018'];
    if (
      codeValue !== currentCode ||
      codingSchemeDesignator !== currentScheme ||
      codeMeaning !== currentMeaning
    ) {
      patch['00404018'] = {
        vr: 'SQ',
        Value: [
          {
            '00080100': { vr: 'SH', Value: [codeValue] },
            '00080102': { vr: 'SH', Value: [codingSchemeDesignator] },
            '00080104': { vr: 'LO', Value: [codeMeaning] },
          },
        ],
      };
    }
  }

  return patch;
}

// ─── filterRows (T025) ────────────────────────────────────────────────────────

export function filterRows(rows: AttributeRow[], query: string): AttributeRow[] {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter(
    r =>
      r.formatted.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q) ||
      r.value.toLowerCase().includes(q)
  );
}

// ─── Props interface ──────────────────────────────────────────────────────────

interface WorkItemDetailsModalProps {
  workitemUID: string;
  dataSource: {
    retrieve: {
      workitem: (uid: string) => Promise<RawDicom>;
    };
    store: {
      updateWorkitem: (uid: string, dataset: unknown, txUID?: string) => Promise<Response>;
    };
  };
  uiNotificationService: {
    show: (opts: { title: string; message: string; type: 'success' | 'error' | 'info' }) => void;
  };
}

// ─── useFetchWorkitem (T010) ──────────────────────────────────────────────────

function useFetchWorkitem(
  workitemUID: string,
  dataSource: WorkItemDetailsModalProps['dataSource']
) {
  const [rawDicom, setRawDicom] = useState<RawDicom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dataSource.retrieve.workitem(workitemUID);
      setRawDicom(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch workitem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [workitemUID, dataSource]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { rawDicom, loading, error, refetch: doFetch };
}

// ─── useEditState (T018) ──────────────────────────────────────────────────────

function buildInitialEditState(rawDicom: RawDicom): EditState {
  const codeItem = (rawDicom['00404018']?.Value?.[0] as Record<string, DicomElement>) ?? {};
  return {
    '00741200': (rawDicom['00741200']?.Value?.[0] as string) ?? '',
    '00404005': (rawDicom['00404005']?.Value?.[0] as string) ?? '',
    '00404041': (rawDicom['00404041']?.Value?.[0] as string) ?? '',
    '00404018': {
      codeValue: (codeItem['00080100']?.Value?.[0] as string) ?? '',
      codingSchemeDesignator: (codeItem['00080102']?.Value?.[0] as string) ?? '',
      codeMeaning: (codeItem['00080104']?.Value?.[0] as string) ?? '',
    },
  };
}

function useEditState(rawDicom: RawDicom | null) {
  const [editState, setEditState] = useState<EditState>({});

  useEffect(() => {
    if (!rawDicom) return;
    setEditState(buildInitialEditState(rawDicom));
  }, [rawDicom]);

  const setField = useCallback(
    (field: keyof EditState, value: EditState[keyof EditState]) => {
      setEditState(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const resetState = useCallback(() => {
    if (!rawDicom) return;
    setEditState(buildInitialEditState(rawDicom));
  }, [rawDicom]);

  return { editState, setField, resetState };
}

// ─── EditField (T016) ─────────────────────────────────────────────────────────

interface EditFieldProps {
  attrDef: AttributeDefinition;
  editState: EditState;
  onSetField: (field: keyof EditState, value: EditState[keyof EditState]) => void;
}

function EditField({ attrDef, editState, onSetField }: EditFieldProps) {
  const tag = attrDef.tag as keyof EditState;

  if (attrDef.editType === 'select') {
    const val = (editState[tag] as string) ?? '';
    return (
      <select
        aria-label={attrDef.label}
        className="bg-secondary-dark border-secondary-light rounded border px-2 py-0.5 text-xs text-white"
        value={val}
        onChange={e => onSetField(tag, e.target.value)}
      >
        {!val && <option value="">—</option>}
        {attrDef.selectOptions?.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (attrDef.editType === 'codeTriple') {
    const triple = editState['00404018'] ?? {
      codeValue: '',
      codingSchemeDesignator: '',
      codeMeaning: '',
    };
    return (
      <div className="flex flex-col gap-1">
        <input
          aria-label="Code Value"
          className="bg-secondary-dark border-secondary-light rounded border px-2 py-0.5 text-xs text-white"
          placeholder="Code Value"
          value={triple.codeValue}
          onChange={e => onSetField('00404018', { ...triple, codeValue: e.target.value })}
        />
        <input
          aria-label="Coding Scheme"
          className="bg-secondary-dark border-secondary-light rounded border px-2 py-0.5 text-xs text-white"
          placeholder="Coding Scheme"
          value={triple.codingSchemeDesignator}
          onChange={e =>
            onSetField('00404018', { ...triple, codingSchemeDesignator: e.target.value })
          }
        />
        <input
          aria-label="Code Meaning"
          className="bg-secondary-dark border-secondary-light rounded border px-2 py-0.5 text-xs text-white"
          placeholder="Code Meaning"
          value={triple.codeMeaning}
          onChange={e => onSetField('00404018', { ...triple, codeMeaning: e.target.value })}
        />
      </div>
    );
  }

  // text (DT field)
  const val = (editState[tag] as string) ?? '';
  return (
    <input
      aria-label={attrDef.label}
      className="bg-secondary-dark border-secondary-light rounded border px-2 py-0.5 text-xs text-white"
      placeholder="YYYYMMDDHHmmss"
      value={val}
      onChange={e => onSetField(tag, e.target.value)}
    />
  );
}

// ─── SqItemRows ───────────────────────────────────────────────────────────────

function SqItemRows({
  item,
  depth = 1,
}: {
  item: Record<string, DicomElement>;
  depth?: number;
}) {
  if (depth > 3) return null;
  const paddingLeft = depth * 16 + 12;

  // Code triplet shortcut
  if ('00080100' in item || '00080102' in item || '00080104' in item) {
    const codeVal = (item['00080100']?.Value?.[0] as string) ?? '';
    const scheme = (item['00080102']?.Value?.[0] as string) ?? '';
    const meaning = (item['00080104']?.Value?.[0] as string) ?? '';
    return (
      <tr>
        <td
          colSpan={4}
          className="py-1 text-xs"
          style={{ paddingLeft }}
        >
          <span className="text-blue-200">{codeVal}</span>
          {scheme && <span className="text-gray-400"> / {scheme}</span>}
          {meaning && <span className="text-gray-300"> / {meaning}</span>}
        </td>
      </tr>
    );
  }

  return (
    <>
      {Object.entries(item).map(([key, el]) => {
        const tagFormatted = `(${key.slice(0, 4)},${key.slice(4)})`;
        const vr = el?.vr ?? '';
        const rawVal = el?.Value ?? [];
        if (vr === 'SQ') {
          return (
            <React.Fragment key={key}>
              <tr>
                <td
                  className="py-0.5 font-mono text-xs text-blue-300"
                  style={{ paddingLeft }}
                >
                  {tagFormatted}
                </td>
                <td
                  className="text-secondary-light py-0.5 text-xs"
                  colSpan={2}
                >
                  [SQ]
                </td>
                <td className="py-0.5 text-xs text-gray-400">[{rawVal.length} items]</td>
              </tr>
              {rawVal.map((sqItem, i) => (
                <SqItemRows
                  key={i}
                  item={sqItem as Record<string, DicomElement>}
                  depth={depth + 1}
                />
              ))}
            </React.Fragment>
          );
        }
        return (
          <tr
            key={key}
            className="border-secondary-dark border-b border-opacity-30"
          >
            <td
              className="py-0.5 font-mono text-xs text-blue-300"
              style={{ paddingLeft }}
            >
              {tagFormatted}
            </td>
            <td
              className="text-secondary-light py-0.5 text-xs"
              colSpan={2}
            />
            <td className="break-all py-0.5 text-xs text-gray-300">{formatValue(vr, rawVal)}</td>
          </tr>
        );
      })}
    </>
  );
}

// ─── SectionTable (T011) ──────────────────────────────────────────────────────

interface SectionTableProps {
  sectionDef: SectionDefinition;
  rows: AttributeRow[];
  viewerMode: ViewerMode;
  editState: EditState;
  onSetField: (field: keyof EditState, value: EditState[keyof EditState]) => void;
}

function SectionTable({ sectionDef, rows, viewerMode, editState, onSetField }: SectionTableProps) {
  const sectionId = `section-${sectionDef.title.replace(/\s+/g, '-')}`;
  return (
    <div
      role="region"
      aria-labelledby={sectionId}
    >
      <h3
        id={sectionId}
        className="bg-secondary-dark sticky top-0 z-10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-300"
      >
        {sectionDef.title}
      </h3>
      <table className="w-full text-left text-xs text-white">
        <tbody>
          {rows.map(row => {
            const attrDef = sectionDef.attributes.find(a => a.tag === row.tag);
            const isEditable = viewerMode === 'edit' && !!attrDef?.editable;
            const isSQ = row.vr === 'SQ';
            return (
              <React.Fragment key={row.tag}>
                <tr className="border-secondary-dark hover:bg-primary-dark border-b">
                  <td className="w-28 px-3 py-1.5 font-mono text-blue-300">{row.formatted}</td>
                  <td className="text-secondary-light w-52 px-3 py-1.5">{row.label}</td>
                  <td className="w-10 px-3 py-1.5 text-yellow-300">{row.vr}</td>
                  <td className="max-w-xs break-all px-3 py-1.5">
                    {isEditable && attrDef ? (
                      <EditField
                        attrDef={attrDef}
                        editState={editState}
                        onSetField={onSetField}
                      />
                    ) : isSQ && row.rawValue.length > 0 ? (
                      <span className="text-gray-400">
                        [{row.rawValue.length} item{row.rawValue.length !== 1 ? 's' : ''}]
                      </span>
                    ) : (
                      <span className={row.value === '—' ? 'text-gray-500' : ''}>{row.value}</span>
                    )}
                  </td>
                </tr>
                {isSQ &&
                  row.rawValue.length > 0 &&
                  row.rawValue.map((sqItem, i) => (
                    <SqItemRows
                      key={i}
                      item={sqItem as Record<string, DicomElement>}
                      depth={1}
                    />
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── hasChanges helper ────────────────────────────────────────────────────────

function hasChanges(editState: EditState, rawDicom: RawDicom): boolean {
  return Object.keys(buildPatch(editState, rawDicom)).length > 0;
}

// ─── WorkItemDetailsModal (T012 / T017 / T019 / T020 / T024 / T026) ──────────

export default function WorkItemDetailsModal({
  workitemUID,
  dataSource,
  uiNotificationService,
}: WorkItemDetailsModalProps) {
  const { rawDicom, loading, error, refetch } = useFetchWorkitem(workitemUID, dataSource);
  const { editState, setField, resetState } = useEditState(rawDicom);
  const [filterQuery, setFilterQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const viewerMode = useMemo<ViewerMode>(
    () => (rawDicom ? computeViewerMode(rawDicom, workitemUID) : 'read-only'),
    [rawDicom, workitemUID]
  );

  const isDirty = useMemo(
    () => (rawDicom ? hasChanges(editState, rawDicom) : false),
    [editState, rawDicom]
  );

  const handleSave = useCallback(async () => {
    if (!rawDicom) return;
    const txuid = localStorage.getItem(`ups_txuid_${workitemUID}`);
    const patch = buildPatch(editState, rawDicom);
    setSaving(true);
    try {
      await dataSource.store.updateWorkitem(workitemUID, patch, txuid ?? undefined);
      uiNotificationService.show({
        title: 'Saved',
        message: 'Workitem attributes updated successfully.',
        type: 'success',
      });
      await refetch();
    } catch (_e) {
      uiNotificationService.show({
        title: 'Save Failed',
        message: 'Could not update workitem attributes. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [rawDicom, editState, workitemUID, dataSource, uiNotificationService, refetch]);

  const handleDiscard = useCallback(() => {
    resetState();
  }, [resetState]);

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[200px] min-w-[600px] items-center justify-center p-6 text-sm text-gray-400"
      >
        Loading workitem attributes…
      </div>
    );
  }

  if (error || !rawDicom) {
    return (
      <div
        role="alert"
        className="flex min-h-[200px] min-w-[600px] items-center justify-center p-6 text-sm text-red-400"
      >
        {error ?? 'No data available.'}
      </div>
    );
  }

  return (
    <div className="flex max-h-[75vh] min-w-[600px] flex-col">
      {/* Filter input (T024 / T029) */}
      <div className="border-secondary-dark border-b px-4 py-2">
        <input
          aria-label="Filter attributes by tag, label or value"
          className="bg-secondary-dark placeholder-secondary-light focus:ring-primary-light w-full rounded border border-gray-600 px-3 py-1.5 text-sm text-white outline-none focus:ring-1"
          placeholder="Filter by tag, label or value…"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
        />
      </div>

      {/* Sections (T012 / T026) */}
      <div className="flex-1 overflow-y-auto">
        {SECTION_DEFINITIONS.map(sectionDef => {
          const allRows = resolveRows(rawDicom, sectionDef);
          const rows = filterQuery ? filterRows(allRows, filterQuery) : allRows;
          if (filterQuery && rows.length === 0) return null;
          return (
            <SectionTable
              key={sectionDef.title}
              sectionDef={sectionDef}
              rows={rows}
              viewerMode={viewerMode}
              editState={editState}
              onSetField={setField}
            />
          );
        })}
      </div>

      {/* Edit mode footer (T019) */}
      {viewerMode === 'edit' && (
        <div className="border-secondary-dark flex justify-end gap-2 border-t px-4 py-2">
          <button
            className="hover:bg-secondary-dark rounded px-3 py-1 text-sm text-gray-300"
            onClick={handleDiscard}
            disabled={saving}
          >
            Discard
          </button>
          <button
            className="bg-primary-active rounded px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
