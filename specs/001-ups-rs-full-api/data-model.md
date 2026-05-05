# Data Model: Full UPS-RS API — DicomWebUPS Data Source

**Feature**: `001-ups-rs-full-api`
**Date**: 2026-05-04

---

## Entities

### WorkitemRow

The mapped display object returned by `query.workitems.search`. Used by the WorkItemsList UI component.

```typescript
interface WorkitemRow {
  studyInstanceUid: string;      // (0020,000D) Study Instance UID
  date: string;                  // Extracted date portion of (0040,4005) Scheduled start datetime
  time: string;                  // Extracted time portion of (0040,4005) Scheduled start datetime
  accession: string;             // (0008,0050) Accession Number
  mrn: string;                   // (0010,0020) Patient ID
  patientName: string;           // (0010,0010) Patient Name (formatted PN)
  patientBirthdate: string;      // (0010,0030) Patient Birth Date
  sex: string;                   // (0010,0040) Patient Sex
  description: string;           // (0074,1204) Scheduled Procedure Step Description
  modalities: string;            // Derived from (0008,0060) / (0040,4018) / (0040,4021)
  instances: string;             // (0020,1208) Number of Study Related Instances (string)
  NumInstances: number;          // (0020,1208) as number
  procedureStepState: string;    // (0074,1000) Procedure Step State
  priority: string;              // (0074,1200) Scheduled Procedure Step Priority
  institutionName: string;       // (0008,0080) Institution Name
  stationClass: string;          // Derived from (0040,4026) Scheduled Station Class Code Seq
  _rawDicom: RawDicom;           // Full raw DICOM JSON (for detail modal)
}
```

### RawDicom

The raw DICOM JSON object as returned by DICOMweb `application/dicom+json` responses.

```typescript
type RawDicom = Record<string, DicomElement>;

interface DicomElement {
  vr: string;                  // DICOM Value Representation (e.g. "CS", "LO", "SQ")
  Value?: unknown[];           // Array of values
  BulkDataURI?: string;        // URI for bulk data
  InlineBinary?: string;       // Base64-encoded inline binary
}
```

### UPS State Machine

```
         ┌─────────────┐
         │  SCHEDULED  │
         └──────┬──────┘
                │ changeState(IN PROGRESS, transactionUID)
         ┌──────▼──────┐
         │ IN PROGRESS │
         └──┬──────┬───┘
            │      │
  COMPLETED │      │ CANCELED
    ┌───────▼─┐ ┌──▼───────┐
    │COMPLETED│ │ CANCELED  │
    └─────────┘ └───────────┘

SCHEDULED → CANCELED: via cancelrequest or direct state change
```

**Valid transitions:**
| From | To | Method |
|------|----|--------|
| SCHEDULED | IN PROGRESS | `changeState` (requires transactionUID) |
| SCHEDULED | CANCELED | `cancelWorkitem` or `changeState` |
| IN PROGRESS | COMPLETED | `changeState` (requires same transactionUID) |
| IN PROGRESS | CANCELED | `changeState` or `cancelWorkitem` |

---

## Data Source API Shape

The `implementation` object passed to `IWebApiDataSource.create()` will have this structure after the feature is complete:

```typescript
{
  initialize({ params, query }): void

  query: {
    studies: <from dicomWebImpl>
    workitems: {
      mapParams(origParams): Record<string, string>
      search(origParams): Promise<WorkitemRow[]>
      processResults(workitems): WorkitemRow[]
    }
    series: <from dicomWebImpl>
    instances: <from dicomWebImpl>
  }

  retrieve: {
    // Inherited from dicomWebImpl...
    workitem(uid: string): Promise<RawDicom>
    subscriptionChannel(aeTitle: string): Promise<Response>  // streaming
  }

  store: {
    // Inherited from dicomWebImpl...
    workitem(dataset: RawDicom, uid?: string): Promise<Response>          // CREATE (POST /workitems)
    updateWorkitem(uid: string, dataset: RawDicom, transactionUID?: string): Promise<Response>  // UPDATE
    changeState(uid: string, state: string, transactionUID?: string): Promise<Response>
    cancelWorkitem(uid: string): Promise<Response>
    subscribe(uid: string, aeTitle: string, deletionLock?: boolean): Promise<Response>
    suspendSubscription(aeTitle: string): Promise<Response>
    deleteSubscription(uid: string, aeTitle: string): Promise<Response>
  }

  getConfig(): DicomWebConfig & { upsRoot: string }
}
```

---

## Configuration Schema

The `UpsConfig` type (no changes required):

```typescript
type UpsConfig = DicomWebConfig & {
  upsRoot: string;                          // Required: base URL for UPS-RS (e.g. "/wado/rs")
  supportsFuzzyMatching?: boolean;          // Optional query optimisation
  supportsWildcard?: boolean;               // Optional query optimisation
}
```

Sample configuration in `default.js`:
```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomwebups',
  sourceName: 'ups',
  configuration: {
    name: 'UPS',
    upsRoot: '/wado/rs',
    qidoRoot: '/wado/rs',    // optional — for study/series queries
    wadoRoot: '/wado/rs',    // optional — for image retrieval
  }
}
```

---

## Key DICOM Tags

| Tag | Keyword | Used For |
|-----|---------|----------|
| (0008,0050) | AccessionNumber | Query / display |
| (0008,0060) | Modality | Query / display |
| (0008,0080) | InstitutionName | Display |
| (0010,0010) | PatientName | Query / display |
| (0010,0020) | PatientID | Query / display |
| (0010,0030) | PatientBirthDate | Display |
| (0010,0040) | PatientSex | Display |
| (0020,000D) | StudyInstanceUID | Link to study / image retrieval |
| (0040,4005) | ScheduledProcedureStepStartDateTime | Query / display |
| (0074,1000) | ProcedureStepState | Query / display / state management |
| (0074,1200) | ScheduledProcedureStepPriority | Query / display |
| (0074,1204) | ScheduledProcedureStepDescription | Display |
| (0008,1195) | TransactionUID | Required for IN PROGRESS / COMPLETED transitions |
