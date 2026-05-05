import React, { useMemo, useState } from 'react';
import dcmjs from 'dcmjs';

const { DicomMetaDictionary } = dcmjs.data;
const { nameMap } = DicomMetaDictionary;

// Format a raw DICOM tag key (8 hex chars) to "(XXXX,XXXX)"
function formatTag(key: string): string {
  if (key.length === 8) {
    return `(${key.substring(0, 4)},${key.substring(4)})`;
  }
  return key;
}

// Resolve DICOM keyword from tag string using dcmjs nameMap
function getKeyword(tag: string): string {
  const normalised = tag.toUpperCase();
  for (const [keyword, entry] of Object.entries(nameMap)) {
    // nameMap entries have a "tag" property like "(0010,0010)"
    const entryTag = (entry as any).tag?.replace(/[(),]/g, '').toUpperCase();
    if (entryTag && entryTag === normalised) {
      return keyword;
    }
  }
  return '';
}

// Render the Value of a DICOM element as a readable string
function formatValue(vr: string, value: unknown[]): string {
  if (!value || value.length === 0) return '';

  if (vr === 'PN') {
    return value
      .map((v: any) => {
        if (typeof v === 'string') return v;
        const parts = [v?.Alphabetic, v?.Ideographic, v?.Phonetic].filter(Boolean);
        return parts.join(' / ') || '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (vr === 'SQ') {
    return `[Sequence: ${value.length} item${value.length !== 1 ? 's' : ''}]`;
  }

  return value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
}

type DicomElement = {
  vr: string;
  Value?: unknown[];
  BulkDataURI?: string;
  InlineBinary?: string;
};

type RawDicom = Record<string, DicomElement>;

interface FlatRow {
  tag: string;
  formatted: string;
  keyword: string;
  vr: string;
  value: string;
}

function flattenDicom(rawDicom: RawDicom): FlatRow[] {
  return Object.entries(rawDicom).map(([key, element]) => {
    const vr = element?.vr ?? '';
    const value = element?.BulkDataURI
      ? `[BulkData: ${element.BulkDataURI}]`
      : element?.InlineBinary
        ? '[InlineBinary]'
        : formatValue(vr, element?.Value ?? []);

    return {
      tag: key,
      formatted: formatTag(key),
      keyword: getKeyword(key),
      vr,
      value,
    };
  });
}

export default function WorkItemDetailsModal({ rawDicom }: { rawDicom: RawDicom }) {
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => flattenDicom(rawDicom), [rawDicom]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.formatted.toLowerCase().includes(q) ||
        r.keyword.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.vr.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  return (
    <div className="flex max-h-[70vh] min-w-[600px] flex-col gap-3 p-4">
      <input
        className="bg-secondary-dark placeholder-secondary-light focus:ring-primary-light w-full rounded border border-gray-600 px-3 py-1.5 text-sm text-white outline-none focus:ring-1"
        placeholder="Filter by tag, keyword or value…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div className="overflow-y-auto">
        <table className="w-full text-left text-xs text-white">
          <thead className="bg-secondary-dark sticky top-0">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-400">Tag</th>
              <th className="px-3 py-2 font-semibold text-gray-400">Keyword</th>
              <th className="px-3 py-2 font-semibold text-gray-400">VR</th>
              <th className="px-3 py-2 font-semibold text-gray-400">Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr
                key={row.tag}
                className="border-secondary-dark hover:bg-primary-dark border-b"
              >
                <td className="px-3 py-1.5 font-mono text-blue-300">{row.formatted}</td>
                <td className="text-secondary-light px-3 py-1.5">{row.keyword}</td>
                <td className="px-3 py-1.5 text-yellow-300">{row.vr}</td>
                <td className="max-w-xs break-all px-3 py-1.5">{row.value}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-secondary-light px-3 py-4 text-center"
                >
                  No attributes match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
