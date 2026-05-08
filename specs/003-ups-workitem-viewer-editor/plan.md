# Implementation Plan: UPS Workitem Attribute Viewer/Editor

**Branch**: `003-ups-workitem-viewer-editor` | **Date**: 2026-05-05 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/003-ups-workitem-viewer-editor/spec.md`

## Summary

Replace the existing raw-dump `WorkItemDetailsModal` with a structured attribute
viewer that organises all IHE RAD RRR-WF Table 40.4.1-1 reading-task attributes
into six labelled sections. When a workitem is IN PROGRESS and the current
browser session holds its Transaction UID in `localStorage`, the viewer switches
to edit mode allowing four key scheduling attributes to be updated via
`store.updateWorkitem`.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18.3.1  
**Primary Dependencies**: dcmjs (DICOM tag resolution), `@ohif/ui-next` (modal, icons, scroll area), `@ohif/core` (services), React Testing Library v13 + Jest  
**Storage**: `localStorage` — `ups_txuid_{uid}` (Transaction UID) and `ups_startdt_{uid}` (claim start DT); no new storage keys needed  
**Testing**: Jest + jsdom; `@testing-library/react` v13.4.0 (same setup as `useWorkitemActions.test.ts`)  
**Target Platform**: Web (desktop-class viewport ≥ 1024 px, Chrome/Firefox/Edge)  
**Project Type**: React component feature inside OHIF Viewers monorepo (`platform/app`)  
**Performance Goals**: Panel open-to-render < 500 ms (single `retrieve.workitem` fetch)  
**Constraints**: Modal opened via `useModal`; no route navigation; no new npm packages  
**Scale/Scope**: Single component file + hook; replaces one existing modal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is a blank template — no active gates are defined. All gates PASS.

**Pre-design gates**: PASS  
**Post-design re-check**: PASS (no new abstractions, no new dependencies, replaces existing component)

## Project Structure

### Documentation (this feature)

```text
specs/003-ups-workitem-viewer-editor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── workitem-viewer-editor.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
platform/app/src/routes/WorkItemsList/
├── WorkItemDetailsModal.tsx        # REPLACE — new structured viewer/editor
├── WorkItemDetailsModal.test.tsx   # NEW — unit tests for viewer/editor
├── WorkItemsList.tsx               # MODIFY — wire up Details button + fetch on open
├── WorkItemActionsPanel.tsx        # no change
├── CancelWorkitemModal.tsx         # no change
├── useWorkitemActions.ts           # no change
├── useWorkitemActions.test.ts      # no change
└── useUpsNotifications.ts          # no change
```

**Structure Decision**: Single-file replacement of `WorkItemDetailsModal.tsx` plus a
corresponding test file. All changes are within the existing
`platform/app/src/routes/WorkItemsList/` directory — no new packages, routes, or
services.

---

## Phase 0 Research — Key Decisions

See [research.md](research.md) for full rationale. Summary:

| Decision | Outcome |
|----------|---------|
| Attribute set | IHE RAD RRR-WF Table 40.4.1-1 — 24 attributes across 6 sections |
| UI pattern | Modal via `useModal` (same as v1) |
| Edit mode gate | IN PROGRESS state AND `localStorage` `ups_txuid_{uid}` present |
| SQ update semantics | Full SQ replacement (DICOM PS3.18 §11.10.3) |
| Replace vs. augment | Replace `WorkItemDetailsModal.tsx` in-place |
| Fetch on open | Call `retrieve.workitem(uid)` fresh on Details click |
| Value formatting | Custom pure functions for PN, DT, DA, TM, SQ (no extra deps) |
| Testing | Jest + React Testing Library (same as `useWorkitemActions.test.ts`) |

---

## Phase 1 Design Artifacts

- **Data model**: [data-model.md](data-model.md) — `RawDicom`, `AttributeRow`, `SectionDefinition`, `EditState`, `ViewerMode`, section-to-tag mapping, state transitions, value formatting rules
- **UI contract**: [contracts/workitem-viewer-editor.md](contracts/workitem-viewer-editor.md) — props interface, rendered output layout, behaviour table, `updateWorkitem` payload shape, caller integration diff
- **Quickstart**: [quickstart.md](quickstart.md) — running the app, running tests, key files, edit mode walk-through, filter usage, troubleshooting

---

## Constitution Check (Post-Design)

All gates PASS.

- No new npm dependencies introduced
- No new routes, services, or packages
- Single component replacement, single test file added
- Edit semantics follow existing pattern (`useWorkitemActions.ts` + `localStorage`)
- No scope creep beyond FR-001 through FR-013

---

## Next Step

Run `/speckit.tasks` to generate `tasks.md` with implementation tasks.
