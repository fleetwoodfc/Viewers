# Implementation Plan: Claim Launches Basic Viewer + Deterministic TxUID

**Branch**: `004-claim-launch-basic-viewer` | **Date**: 2026-05-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-claim-launch-basic-viewer/spec.md`

## Summary

After a successful UPS workitem claim, the application navigates to the Basic Viewer
(`/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems`) for the workitem's referenced
study. The claim's Transaction UID is derived deterministically from the workitem UID
and the station AE title (`generateDicomUidFromInstanceAndStation`) — eliminating all
localStorage writes for txUID and the `resolveTxUID` fallback chain. The same
deterministic derivation is used by `complete()` and `cancel()`.

**Phase 1 (navigation callback)** — already implemented.
**Phase 2 (txUID refactor)** — remaining work: refactor `complete()` and `cancel()`, remove `resolveTxUID`, update tests.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 18.3.1, `@testing-library/react` (hooks), Jest 29 + jsdom
**Storage**: Browser `localStorage` (only `ups_startdt_*` entries post-refactor)
**Testing**: Jest 29, `renderHook` + `act`, jsdom + WebCrypto polyfill in `beforeAll`
**Target Platform**: Browser (modern Chromium / Firefox / Safari — all support `crypto.subtle`)
**Project Type**: OHIF monorepo — React SPA, no server-side component
**Performance Goals**: Navigation triggered <2s after claim response
**Constraints**: DICOM UID ≤ 64 chars (2.25 arc with 128-bit int is ~44 chars — within limit)
**Scale/Scope**: 2 source files modified, 1 test file modified, 0 new files

## Constitution Check

Constitution file is an unfilled template — no project-specific gates defined.
No violations to evaluate.

## Project Structure

### Documentation (this feature)

```text
specs/004-claim-launch-basic-viewer/
├── plan.md              ← This file
├── research.md          ← Phase 0 decisions (updated 2026-05-07)
├── data-model.md        ← Phase 1 entities and state transitions (updated 2026-05-07)
├── quickstart.md        ← Developer quickstart (updated 2026-05-07)
├── contracts/
│   └── claim-launch-viewer.md   ← Hook interface + behaviour contract (updated 2026-05-07)
└── tasks.md             ← Phase 2 output (to be regenerated)
```

### Source Code

```text
platform/app/src/routes/WorkItemsList/
├── useWorkitemActions.ts        ← Hook — primary change target
├── useWorkitemActions.test.ts   ← Unit tests — update T028 suite
└── WorkItemsList.tsx            ← Component — onClaimSuccess wiring (already done)
```

## Implementation Phases

### Phase 1 — Navigation Callback ✅ COMPLETE

All 13 original tasks (T001–T013) implemented and tested. 20/20 unit tests pass.

Key changes already in place:
- `generateDicomUidFromInstanceAndStation` added to `useWorkitemActions.ts`
- `claim()` uses deterministic txUID when `performerAeTitle` is set
- `onClaimSuccess` callback added to hook options and wired in `WorkItemsList.tsx`
- Navigation to `/viewer?StudyInstanceUIDs=<uid>&returnTo=/workitems` implemented

### Phase 2 — TxUID Refactor (remaining work)

#### 2.1 — Refactor `complete()` in `useWorkitemActions.ts`

Replace `resolveTxUID(uid)` with:
```ts
if (!performerAeTitle) {
  uiNotificationService.show({
    title: 'Complete Failed',
    message: 'Station name not configured — cannot complete workitem.',
    type: 'error',
    duration: 6000,
  });
  setActionState(uid, 'idle');
  return;
}
const txUID = await generateDicomUidFromInstanceAndStation(uid, performerAeTitle);
```

Update `useCallback` dependency array: remove `resolveTxUID`, keep `performerAeTitle`.

#### 2.2 — Refactor `cancel()` in `useWorkitemActions.ts`

Same pattern as `complete()`:
- Guard on missing `performerAeTitle` → error notification + early return
- Replace `resolveTxUID(uid)` with `await generateDicomUidFromInstanceAndStation(uid, performerAeTitle)`
- Update dependency array

#### 2.3 — Remove dead code

Remove from `useWorkitemActions.ts`:
- `uuidToDicomUID` function
- `claimedWorkitemsRef` useRef
- `storageKey(uid)` helper
- `resolveTxUID` useCallback
- All `localStorage.setItem(storageKey(...), ...)` and `localStorage.getItem(storageKey(...))` and `localStorage.removeItem(storageKey(...))` calls
- In `claim()`: remove `claimedWorkitemsRef.current.set(uid, txUID)` and the `localStorage.setItem(storageKey(uid), txUID)` block
- In `complete()` and `cancel()`: remove `claimedWorkitemsRef.current.delete(uid)` and `localStorage.removeItem(storageKey(uid))`

Retain:
- `claimStartDTsRef`, `startDtKey`, `resolveStartDT` — still used for start-datetime
- `generateDicomUidFromInstanceAndStation` — now used by claim + complete + cancel

#### 2.4 — Update unit tests

In `useWorkitemActions.test.ts`, update the `describe('useWorkitemActions — resolveTxUID (T028)')` block:

| Old test | New test |
|----------|----------|
| (a) in-memory cache hit for complete | complete() calls `changeState` with deterministic UID |
| (b) localStorage hit after simulated refresh | complete() re-derives UID without any localStorage read |
| (b2) same via cancel | cancel() re-derives UID |
| (b3/b4) cleanup on complete/cancel removes localStorage | `ups_txuid_*` never written; `ups_startdt_*` removed on success |
| (c) no UID → error notification for complete | no `performerAeTitle` → error notification, no `changeState` call |
| (c2) no UID → error notification for cancel | no `performerAeTitle` → error notification, no `changeState` call |

Also update `claim()` tests that currently assert `localStorage.getItem(storageKey(uid))`:
- Remove assertion that `ups_txuid_<uid>` is written to localStorage
- Keep assertion that the correct deterministic UID is passed to `changeState`

## Complexity Tracking

No constitution violations. No unjustified complexity introduced.


## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
