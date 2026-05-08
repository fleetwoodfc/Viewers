# Data Model: UPS Workitem Attribute Viewer/Editor

## Core Domain Objects

### 1. `RawDicom`

The raw DICOM JSON object returned by `dataSource.retrieve.workitem(uid)` — a
`Record<string, DicomElement>` where keys are 8-hex-char tag strings.

```typescript
type DicomElement = {
  vr: string;
  Value?: unknown[];          // present for most VRs
  BulkDataURI?: string;       // present for binary VRs
  InlineBinary?: string;      // present for inline binary
};

type RawDicom = Record<string, DicomElement>;
```

---

### 2. `AttributeRow`

A single resolved, display-ready row derived from a `RawDicom` entry. Used by both
the read-only section table and the edit-mode form.

```typescript
interface AttributeRow {
  tag: string;           // raw 8-char key, e.g. "00100010"
  formatted: string;     // "(0010,0010)"
  keyword: string;       // dcmjs keyword, e.g. "PatientName"
  label: string;         // human-readable label, e.g. "Patient Name"
  vr: string;            // "PN", "SQ", "DT", etc.
  value: string;         // formatted display string
  rawValue: unknown[];   // original Value array (needed for edit pre-fill)
}
```

---

### 3. `SectionDefinition`

Declares what the structured viewer renders for each of the six sections.

```typescript
interface SectionDefinition {
  title: string;                      // e.g. "Patient"
  attributes: AttributeDefinition[];  // ordered list
}

interface AttributeDefinition {
  tag: string;         // 8-char hex, e.g. "00100010"
  label: string;       // human-readable label
  editable?: boolean;  // defaults to false
  editType?: 'text' | 'select' | 'codeTriple';
  selectOptions?: string[];  // for editType = 'select'
}
```

---

### 4. `EditState`

Tracks in-progress edits for the four editable attributes.

```typescript
interface EditState {
  '00741200'?: string;  // Scheduled Procedure Step Priority (select)
  '00404005'?: string;  // Scheduled Procedure Step Start DateTime (text)
  '00404041'?: string;  // Input Readiness State (select)
  '00404018'?: {        // Scheduled Workitem Code Sequence (code triplet)
    codeValue: string;
    codingSchemeDesignator: string;
    codeMeaning: string;
  };
}
```

---

### 5. `ViewerMode`

```typescript
type ViewerMode = 'read-only' | 'edit';
```

**Rule**: `ViewerMode` is computed (not stored) from:
- `rawDicom['00741000'].Value[0] === 'IN PROGRESS'`  
- `localStorage.getItem('ups_txuid_' + uid) !== null`

Both conditions must be true to enter `'edit'` mode.

---

## Section-to-Tag Mapping

```text
PATIENT_SECTION   = ['00100010', '00100020', '00100030', '00100040']
STUDY_SECTION     = ['00080050', '0020000D', '00081030', '00080060']
SCHEDULING_SECTION = ['00741000', '00741200', '00404005', '00404041',
                      '00404018', '00404025', '00404034']
REQUESTED_SECTION  = ['00401001', '00321060', '0040A370']
PERFORMED_SECTION  = ['00081195', '00404050', '00404051',
                      '00404028', '00404019', '00741238']
OUTPUT_SECTION     = ['00404033']
```

---

## State Transitions

```
Panel opens
     │
     ▼
retrieve.workitem(uid)
     │
     ├─ error ──► show error notification; panel stays empty
     │
     └─ success
           │
           ├─ state ≠ IN PROGRESS OR no txuid in localStorage
           │       ──► ViewerMode = 'read-only'
           │
           └─ state = IN PROGRESS AND txuid exists
                   ──► ViewerMode = 'edit'
                         │
                         ├─ user edits field ──► EditState updated (local)
                         │
                         ├─ Save
                         │    ├─ updateWorkitem(changed attrs + txuid)
                         │    ├─ success ──► reload rawDicom; reset EditState
                         │    └─ failure ──► error notification; EditState retained
                         │
                         └─ Cancel / Close ──► EditState discarded; rawDicom unchanged
```

---

## Value Formatting Rules

| VR | Format |
|----|--------|
| PN | `Alphabetic` component; fallback to raw string |
| DA | `YYYYMMDD` → `YYYY-MM-DD` |
| TM | `HHMMSS[.ffffff]` → `HH:mm:ss` |
| DT | `YYYYMMDDHHmmss[.ffffff][+ZZ:ZZ]` → `YYYY-MM-DD HH:mm:ss` |
| SQ | Expand inline: each child item rendered as indented sub-rows |
| Code SQ | First item shown as `{CodeValue} / {CodingScheme} / {CodeMeaning}` |
| Other | `value.join(', ')` |
| Missing | `—` (em dash) |
