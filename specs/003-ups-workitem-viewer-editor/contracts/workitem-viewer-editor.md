# UI Contract: WorkItemDetailsModal (Structured Viewer/Editor)

**Component**: `WorkItemDetailsModal`  
**File**: `platform/app/src/routes/WorkItemsList/WorkItemDetailsModal.tsx`  
**Opened via**: `useModal().show(...)` in `WorkItemsList.tsx`

---

## Props Contract

```typescript
interface WorkItemDetailsModalProps {
  /** The workitem UID — used to fetch fresh data and to resolve edit mode */
  workitemUID: string;

  /** The data source — must expose dataSource.retrieve.workitem and dataSource.store.updateWorkitem */
  dataSource: {
    retrieve: {
      workitem: (uid: string) => Promise<Record<string, DicomElement>>;
    };
    store: {
      updateWorkitem: (uid: string, dataset: unknown, txUID?: string) => Promise<Response>;
    };
  };

  /** OHIF notification service — used to show success/error toasts */
  uiNotificationService: {
    show: (opts: { title: string; message: string; type: 'success' | 'error' | 'info' }) => void;
  };
}
```

**Breaking changes from v1 (existing component)**:  
- Previously accepted `rawDicom: RawDicom` directly.  
- Now accepts `workitemUID` + `dataSource` and fetches internally.  
- The caller (`WorkItemsList.tsx`) must be updated to pass the new props.

---

## Rendered Output Contract

### Read-Only Mode

```
┌─────────────────────────────────────────────────────┐
│ Work Item Attributes — [Patient Name]          [✕]  │
├─────────────────────────────────────────────────────┤
│ [Filter input: "Filter by tag, label or value…"]    │
├─────────────────────────────────────────────────────┤
│ ▼ Patient                                           │
│   (0010,0010) Patient Name      PN  Smith^John      │
│   (0010,0020) Patient ID        LO  PAT-001         │
│   (0010,0030) Date of Birth     DA  1980-03-15      │
│   (0010,0040) Sex               CS  M               │
├─────────────────────────────────────────────────────┤
│ ▼ Study                                             │
│   …                                                 │
├─────────────────────────────────────────────────────┤
│ ▼ Scheduling                                        │
│   …                                                 │
├─────────────────────────────────────────────────────┤
│ ▼ Requested Procedure                               │
│   …                                                 │
├─────────────────────────────────────────────────────┤
│ ▼ Performed Step                                    │
│   …                                                 │
├─────────────────────────────────────────────────────┤
│ ▼ Output                                            │
│   …                                                 │
└─────────────────────────────────────────────────────┘
```

### Edit Mode (additional elements)

```
├─────────────────────────────────────────────────────┤
│ ▼ Scheduling            ← editable fields shown     │
│   (0074,1000) Step State            CS  IN PROGRESS  │
│   (0074,1200) Priority              CS  [HIGH  ▼]    │
│   (0040,4005) Scheduled Start DT    DT  [____________]│
│   (0040,4041) Input Readiness       CS  [READY ▼]    │
│   (0040,4018) Scheduled Workitem Code SQ             │
│               Code Value:    [__________]            │
│               Scheme:        [__________]            │
│               Meaning:       [__________]            │
│   (0040,4025) Sched. Station Name Code SQ …         │
│   (0040,4034) Sched. Human Performer   SQ …         │
├─────────────────────────────────────────────────────┤
│                              [Discard]  [Save]      │
└─────────────────────────────────────────────────────┘
```

---

## Behaviour Contract

| Scenario | Expected Behaviour |
|----------|--------------------|
| Panel opens | Calls `retrieve.workitem(uid)`; shows loading indicator until response |
| Fetch error | Shows error notification; panel body empty |
| State = SCHEDULED/COMPLETED/CANCELED | Read-only mode; no Save/Discard buttons |
| State = IN PROGRESS, no txuid in localStorage | Read-only mode |
| State = IN PROGRESS, txuid exists | Edit mode; four fields editable |
| User edits, Save | Calls `updateWorkitem(uid, changedAttrs, txuid)`; on success reloads data + success toast |
| Save fails | Error toast; unsaved edits retained |
| User clicks Discard / closes modal | Edits discarded; no network call |
| Filter typed | Rows across all sections filtered (case-insensitive tag/label/value match); sections with 0 matches hidden |
| Filter cleared | Full view restored |
| SQ attribute | Each child item rendered as indented sub-rows; nested SQs recurse ≥ 2 levels |
| Missing attribute | Row shown with label and "—" as value |

---

## updateWorkitem Payload Shape

Only **changed** attributes are sent. Example: user changes Priority only.

```json
{
  "00741200": { "vr": "CS", "Value": ["HIGH"] }
}
```

Example: user changes Priority + Scheduled Workitem Code Sequence:

```json
{
  "00741200": { "vr": "CS", "Value": ["HIGH"] },
  "00404018": {
    "vr": "SQ",
    "Value": [{
      "00080100": { "vr": "SH", "Value": ["111059"] },
      "00080102": { "vr": "SH", "Value": ["DCM"] },
      "00080104": { "vr": "LO", "Value": ["CT Scan of Thorax"] }
    }]
  }
}
```

Note: `store.updateWorkitem` automatically appends `00081195` (Transaction UID) to
the body; the component passes the raw attribute patch only.

---

## Caller Integration in WorkItemsList.tsx

The existing Details button click handler changes from:

```tsx
// OLD
show({
  content: WorkItemDetailsModal,
  contentProps: { rawDicom: _rawDicom },
  title: `Work Item Attributes…`,
  containerClassName: 'max-w-3xl',
});
```

To:

```tsx
// NEW
show({
  content: WorkItemDetailsModal,
  contentProps: {
    workitemUID: workItemUID,
    dataSource,
    uiNotificationService,
  },
  title: `Work Item Attributes…`,
  containerClassName: 'max-w-3xl',
});
```
