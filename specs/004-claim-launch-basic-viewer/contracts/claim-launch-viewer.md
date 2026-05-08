# Contract: Claim Launches Basic Viewer + Deterministic TxUID

**Feature**: `004-claim-launch-basic-viewer`
**Date**: 2026-05-07 (updated; originally 2026-05-06)

---

## 1. Hook Option Contract (`useWorkitemActions`)

### Before (existing interface)

```ts
interface UseWorkitemActionsOptions {
  dataSource: any;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
  performerAeTitle?: string;
}
```

### After (this feature adds `onClaimSuccess`; `performerAeTitle` becomes effectively required)

```ts
interface UseWorkitemActionsOptions {
  dataSource: any;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
  /**
   * AE title of this performer station. Used for DICOM codes and deterministic
   * Transaction UID derivation. REQUIRED at runtime — all state-change operations
   * (claim, complete, cancel) will block with a user-visible error notification
   * if this value is absent.
   */
  performerAeTitle?: string;
  /**
   * Called after a successful claim, with the workitem UID.
   * The component uses this to navigate to the viewer.
   * Optional — omitting it preserves existing claim behaviour.
   */
  onClaimSuccess?: (uid: string) => void;
}
```

**Backward compatibility**: TypeScript signature unchanged (still optional); runtime
behaviour changes — missing `performerAeTitle` now shows an error instead of silently
using a random UUID. Deployments using the UPS data source already set this value.

---

## 2. `claim` / `complete` / `cancel` Behaviour

| Scenario | Old Behaviour | New Behaviour |
|----------|--------------|--------------|
| `performerAeTitle` set, claim succeeds | txUID → random UUID (stored in localStorage) | txUID derived deterministically (not stored) |
| `performerAeTitle` absent, claim called | txUID → random UUID (fallback) | Error notification; no network call |
| `performerAeTitle` set, complete called | txUID read from `resolveTxUID` (memory/localStorage) | txUID re-derived via `generateDicomUidFromInstanceAndStation` |
| `performerAeTitle` absent, complete called | txUID read from localStorage or throw | Error notification; no network call |
| `performerAeTitle` set, cancel called | Same as complete | txUID re-derived |
| `performerAeTitle` absent, cancel called | Throw / localStorage | Error notification |
| Claim succeeds, `studyInstanceUid` present | Success toast, refresh | + navigate to Basic Viewer |
| Claim succeeds, `studyInstanceUid` absent | Success toast, refresh | (unchanged — no navigation) |
| Claim fails | Error toast, no navigation | (unchanged) |
| Viewer mode not in `loadedModes` | n/a | Info toast, no navigation |

---

## 3. Removed Internal Symbols

| Symbol | Reason |
|--------|--------|
| `resolveTxUID(uid)` | Replaced by inline `generateDicomUidFromInstanceAndStation` |
| `claimedWorkitemsRef` | In-memory txUID cache no longer needed |
| `storageKey(uid)` | `ups_txuid_*` keys no longer written |
| `uuidToDicomUID(uuid)` | Random UUID fallback removed |

---

## 4. localStorage Key Changes

| Key | Change |
|-----|--------|
| `ups_txuid_<uid>` | **Removed** — no longer written or read |
| `ups_startdt_<uid>` | Unchanged — written at claim, read at complete, deleted on complete/cancel |

---

## 5. Viewer URL Contract (unchanged)

```
GET /viewer[dataPath]?StudyInstanceUIDs={uid}&returnTo=/workitems[&configUrl={url}][&<preservedParams>]
```


---

## 1. Hook Option Contract (`useWorkitemActions`)

### Before (existing interface)

```ts
interface UseWorkitemActionsOptions {
  dataSource: any;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
  performerAeTitle?: string;
}
```

### After (this feature adds one optional field)

```ts
interface UseWorkitemActionsOptions {
  dataSource: any;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
  performerAeTitle?: string;
  /**
   * Called after a successful claim, with the workitem UID.
   * The component uses this to navigate to the viewer.
   * Optional — omitting it preserves existing behaviour.
   */
  onClaimSuccess?: (uid: string) => void;
}
```

**Backward compatibility**: fully backward-compatible — existing callers with no
`onClaimSuccess` continue to work unchanged.

---

## 2. `claim` Call-Site Behaviour

| Scenario | Existing Behaviour | New Behaviour |
|----------|-------------------|--------------|
| Claim succeeds, `studyInstanceUid` present | Success toast, refresh | + navigate to Basic Viewer |
| Claim succeeds, `studyInstanceUid` absent | Success toast, refresh | (unchanged — no navigation) |
| Claim fails | Error toast, no navigation | (unchanged) |
| Basic Viewer mode not in `loadedModes` | n/a | Info toast, no navigation |

---

## 3. Viewer URL Contract

```
GET /{viewerRoutePathPrefix}[dataPath]?StudyInstanceUIDs={uid}&returnTo=/workitems[&configUrl={url}][&<preservedParams>]
```

Where `viewerRoutePathPrefix` = `viewer` (the Basic Viewer `routeName`).

### Example

```
/viewer?StudyInstanceUIDs=1.2.840.10008.5.1.4.1.1.2.1&returnTo=%2Fworkitems&configUrl=https%3A%2F%2Fexample.com%2Fconfig.json
```

---

## 4. Caller Integration Diff (WorkItemsList.tsx)

```diff
  const { claim, complete, cancel, reject, getActionState } = useWorkitemActions({
    dataSource,
    onRefresh,
    uiNotificationService,
+   onClaimSuccess: (uid: string) => {
+     const workitem = workitems.find((w: any) => w.workitemUID === uid || w._uid === uid);
+     const studyInstanceUid = workitem?.studyInstanceUid;
+     if (!studyInstanceUid) return;
+     const viewerMode = appConfig.loadedModes?.find(m => m.routeName === 'viewer');
+     if (!viewerMode) {
+       uiNotificationService.show({
+         title: 'Viewer Not Available',
+         message: 'The Basic Viewer mode is not loaded in this configuration.',
+         type: 'info',
+         duration: 5000,
+       });
+       return;
+     }
+     const query = new URLSearchParams();
+     if (filterValues.configUrl) query.append('configUrl', filterValues.configUrl);
+     query.append('StudyInstanceUIDs', studyInstanceUid);
+     query.append('returnTo', '/workitems');
+     preserveQueryParameters(query);
+     navigate(`/${viewerMode.routeName}${dataPath || ''}?${query.toString()}`);
+   },
  });
```

---

## 5. Test Contract (`useWorkitemActions.test.ts`)

### New test cases

| Test ID | Description | Expected outcome |
|---------|-------------|-----------------|
| T-CS-01 | `onClaimSuccess` called after successful claim | `onClaimSuccess` mock called with correct uid |
| T-CS-02 | `onClaimSuccess` NOT called when claim fails | `onClaimSuccess` mock never called |
| T-CS-03 | `onClaimSuccess` optional — omitting it does not throw | No error when option is absent |
