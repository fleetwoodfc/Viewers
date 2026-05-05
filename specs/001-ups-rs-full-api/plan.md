# Implementation Plan: Full UPS-RS API Support

**Branch**: `001-ups-rs-full-api` | **Date**: 2026-05-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-ups-rs-full-api/spec.md`

## Summary

Extend the `DicomWebUPS` data source (`extensions/default/src/DicomWebUpsDataSource/index.ts`) to support all 10 UPS-RS operations defined in DICOM PS3.18. Three operations already exist in partial form (`store.workitem`, `store.changeState`, `store.subscribe`); this feature formalises them, fixes gaps (wrong POST URL for create vs update, missing `deletionLock` param), and adds the six missing operations: `retrieve.workitem`, `store.updateWorkitem`, `store.cancelWorkitem`, `store.deleteSubscription`, `store.suspendSubscription`, and `retrieve.subscriptionChannel`. All changes are confined to the single TypeScript file plus a new Jest test file.

## Technical Context

**Language/Version**: TypeScript 5.x / JavaScript (ESM + CJS, monorepo)
**Primary Dependencies**: `@ohif/core` (`IWebApiDataSource`, `DICOMWeb`, `utils`), native `fetch` API, `@ohif/extension-default` (`createDicomWebApi`, `DicomWebConfig`)
**Storage**: N/A — stateless HTTP calls to UPS-RS server
**Testing**: Jest 29 via `yarn jest`; test match `src/**/*.test.ts` per `jest.config.base.js`
**Target Platform**: Web browser (OHIF Viewer); `window.location.origin` used for URL base
**Project Type**: Library extension in monorepo — `@ohif/extension-default`
**Performance Goals**: No special throughput requirements; operations complete within normal network latency
**Constraints**: Must not break existing `query.studies.search` path; must preserve `IWebApiDataSource` interface compatibility; no new package dependencies
**Scale/Scope**: ~200 lines of new/changed code in one source file; ~300 lines of new unit tests

## Constitution Check

*The constitution template in `.specify/memory/constitution.md` is unpopulated (placeholder text only) — no project-specific gates apply.*

**Default gates evaluated:**

| Gate | Status | Notes |
|------|--------|-------|
| Breaking existing API surface | ✅ PASS | All new methods are additive; `store.workitem` signature is unchanged |
| New external dependencies | ✅ PASS | None introduced — uses `fetch` (already in use) |
| Architectural consistency | ✅ PASS | Follows existing `upsGet` / `fetch` pattern; no new abstractions |
| Security — auth headers on all requests | ✅ PASS | All methods route through `getAuthorizationHeader()` helper |
| Error propagation | ✅ PASS | All methods throw on non-OK HTTP responses (FR-012) |

## Project Structure

### Documentation (this feature)

```text
specs/001-ups-rs-full-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ups-rs-api.md    # Phase 1 output — TypeScript API contract
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code

```text
extensions/default/src/DicomWebUpsDataSource/
├── index.ts             ← PRIMARY — all 10 UPS-RS operations (modify)
└── index.test.ts        ← NEW — Jest unit tests for all 10 operations
```

**Structure Decision**: Single-file modification. The entire datasource lives in `index.ts`. No new modules or packages. Test file mirrors the `MergeDataSource/index.test.ts` convention (`jest.fn()` mocks, `beforeEach` reset, `expect(fetch).toHaveBeenCalledWith(...)`).

## Design Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | `specs/001-ups-rs-full-api/research.md` | ✅ Complete |
| Data Model | `specs/001-ups-rs-full-api/data-model.md` | ✅ Complete |
| API Contract | `specs/001-ups-rs-full-api/contracts/ups-rs-api.md` | ✅ Complete |
| Quickstart | `specs/001-ups-rs-full-api/quickstart.md` | ✅ Complete |
| Tasks | `specs/001-ups-rs-full-api/tasks.md` | ✅ Complete |

---

## Implementation Notes

### HTTP Helper Refactor

Introduce a generic `upsRequest` helper alongside the existing `upsGet`:

```typescript
const upsRequest = async (
  method: string,
  path: string,
  opts: { body?: unknown; queryParams?: Record<string, string>; contentType?: string } = {}
): Promise<Response> => {
  const url = new URL(`${upsConfig.upsRoot}${path}`, window.location.origin);
  if (opts.queryParams) {
    Object.entries(opts.queryParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers: Record<string, string> = { ...getAuthorizationHeader() };
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!response.ok && response.status !== 202) {
    throw new Error(`UPS-RS ${method} [${response.status}]: ${url}`);
  }
  return response;
};
```

`upsGet` continues to exist for GET + JSON parse. `upsRequest` covers all mutating calls.

### store.workitem Fix (Create vs Update URL)

Current code incorrectly uses `POST /workitems/{uid}` for create-with-uid. Per DICOM PS3.18, create is always `POST /workitems` and the desired UID is passed as `?AffectedSOPInstanceUID`. `POST /workitems/{uid}` is the **update** operation.

- `store.workitem(dataset, uid?)` → always `POST /workitems{?AffectedSOPInstanceUID=uid}`
- New `store.updateWorkitem(uid, dataset, transactionUID?)` → `POST /workitems/{uid}{?transaction=transactionUID}`

### store.subscribe Fix (deletionLock)

Add `deletionLock?: boolean` parameter:

```typescript
subscribe: async (uid: string, aeTitle: string, deletionLock?: boolean) => {
  const queryParams = deletionLock ? { deletionlock: '1' } : {};
  return upsRequest('POST', `/workitems/${uid}/subscribers/${aeTitle}`, { queryParams });
},
```

### New Operations Summary

| Method | HTTP | Notes |
|--------|------|-------|
| `retrieve.workitem(uid)` | `GET /workitems/{uid}` | Return first element of JSON array |
| `store.updateWorkitem(uid, dataset, txUID?)` | `POST /workitems/{uid}` | Optional `?transaction` param |
| `store.cancelWorkitem(uid)` | `POST /workitems/{uid}/cancelrequest` | Accept 202 as success |
| `store.suspendSubscription(aeTitle)` | `POST /workitems/1.2.840.10008.5.1.4.34.5/subscribers/{aeTitle}` | Uses well-known global UID |
| `store.deleteSubscription(uid, aeTitle)` | `DELETE /workitems/{uid}/subscribers/{aeTitle}` | |
| `retrieve.subscriptionChannel(aeTitle)` | `GET /subscribers/{aeTitle}` | Return raw `Response` for streaming |

### Test Strategy

File: `extensions/default/src/DicomWebUpsDataSource/index.test.ts`

- One `describe` block per operation (10 total)
- Each block tests: correct HTTP method, correct URL, correct headers, correct body (where applicable)
- Each block tests the error path: non-OK response → thrown `Error`
- `global.fetch` mocked via `jest.fn()` with `beforeEach` reset
- `servicesManager.services.userAuthenticationService` mocked to return a Bearer header

---

## Open Questions

None — all NEEDS CLARIFICATION items resolved in `research.md`.

---

## Next Step

Run `/speckit.tasks` to generate `tasks.md` with implementation tasks ordered by dependency.
