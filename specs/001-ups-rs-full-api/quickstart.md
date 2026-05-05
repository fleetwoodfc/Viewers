# Quickstart: Using the Full UPS-RS API

**Feature**: `001-ups-rs-full-api`
**Module**: `extensions/default` → `DicomWebUpsDataSource`

---

## Setup

Configure the `dicomwebups` datasource in your OHIF config file:

```javascript
// platform/app/public/config/default.js
window.config = {
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomwebups',
      sourceName: 'ups',
      configuration: {
        name: 'UPS',
        upsRoot: '/wado/rs',    // UPS-RS base URL
        qidoRoot: '/wado/rs',   // QIDO for study queries (optional)
        wadoRoot: '/wado/rs',   // WADO for image retrieval (optional)
      },
    },
  ],
  defaultDataSourceName: 'ups',
  showWorkItemsList: true,       // Enables the /workitems route
};
```

---

## Obtaining the Datasource

```typescript
// Inside a React component or service
const dataSource = extensionManager.getDataSources('ups')[0];
```

---

## Search Work Items

```typescript
const workitems = await dataSource.query.workitems.search({
  patientName: 'Doe^John',
  procedureStepState: ['SCHEDULED', 'IN PROGRESS'],
  priority: ['STAT', 'HIGH'],
  startDate: '20240101',
  endDate: '20241231',
  resultsPerPage: 50,
});
// Returns WorkitemRow[]
```

---

## Retrieve a Single Work Item

```typescript
const rawDicom = await dataSource.retrieve.workitem('1.2.840.10008.5.1.4.34.1.1234');
// Returns RawDicom — full DICOM JSON object
console.log(rawDicom['00741000']?.Value?.[0]); // e.g. "SCHEDULED"
```

---

## Create a Work Item

```typescript
const dataset = {
  '00741000': { vr: 'CS', Value: ['SCHEDULED'] },
  '00741200': { vr: 'CS', Value: ['HIGH'] },
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Doe^John' }] },
  // ... other attributes
};

const response = await dataSource.store.workitem(dataset);
// 201 Created — response.headers.get('Location') has the work item URL
```

---

## Update a Work Item

```typescript
const delta = {
  '00741204': { vr: 'LO', Value: ['Updated description'] },
};

await dataSource.store.updateWorkitem(
  '1.2.840.10008.5.1.4.34.1.1234',
  delta,
  transactionUID // required if IN PROGRESS
);
```

---

## Claim a Work Item (SCHEDULED → IN PROGRESS)

```typescript
import { utils } from '@ohif/core';

const transactionUID = utils.uuidv4(); // generate a fresh UID
await dataSource.store.changeState(
  '1.2.840.10008.5.1.4.34.1.1234',
  'IN PROGRESS',
  transactionUID
);
// Store transactionUID — required for subsequent COMPLETED/CANCELED transition
```

---

## Complete a Work Item

```typescript
await dataSource.store.changeState(
  '1.2.840.10008.5.1.4.34.1.1234',
  'COMPLETED',
  transactionUID  // same UID used when claiming
);
```

---

## Request Cancellation

```typescript
await dataSource.store.cancelWorkitem('1.2.840.10008.5.1.4.34.1.1234');
// Server responds 202 Accepted
```

---

## Subscriptions

### Create a Subscription

```typescript
await dataSource.store.subscribe(
  '1.2.840.10008.5.1.4.34.1.1234', // work item UID
  'MY_AE_TITLE',
  true  // deletionLock — prevent work item deletion while subscribed
);
```

### Create a Global Subscription

```typescript
const GLOBAL_UID = '1.2.840.10008.5.1.4.34.5';
await dataSource.store.subscribe(GLOBAL_UID, 'MY_AE_TITLE');
```

### Suspend Global Subscription

```typescript
await dataSource.store.suspendSubscription('MY_AE_TITLE');
```

### Open Subscription Channel (Event Stream)

```typescript
const response = await dataSource.retrieve.subscriptionChannel('MY_AE_TITLE');
// response.body is a ReadableStream of server-sent events
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Parse UPS events from value (Uint8Array)
}
```

### Delete a Subscription

```typescript
await dataSource.store.deleteSubscription(
  '1.2.840.10008.5.1.4.34.1.1234',
  'MY_AE_TITLE'
);
```

---

## Error Handling

```typescript
try {
  await dataSource.store.changeState(uid, 'IN PROGRESS', transactionUID);
} catch (error) {
  // error.message = "UPS-RS changeState PUT [409]: http://..."
  uiNotificationService.show({
    title: 'State change failed',
    message: error.message,
    type: 'error',
  });
}
```

---

## Running Unit Tests

```bash
# Run DicomWebUPS datasource tests only
cd /workspaces/Viewers
yarn jest extensions/default/src/DicomWebUpsDataSource/index.test.ts --watch
```
