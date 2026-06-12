# Agent Entry Point

This is the first file every agent should read before working on this repository.

## Project Summary

This project refactors an industrial OCR inspection app from a Python/PyQt monolith into a local-first desktop system.

Target stack:

- Frontend: Next.js + React + TypeScript
- Backend: NestJS REST API
- Database: PostgreSQL + Prisma
- Future desktop shell: Electron
- Future AI service: Python + FastAPI
- Future license protection: USB dongle checked at app startup

Ultimate deployment goal:

- Package the whole local system as a Windows `.exe`.
- Electron is the desktop entry point.
- The final app must run locally on a PC/industrial PC, not as a cloud web app.
- Electron should eventually start/check required local services before opening the UI.

## Read These Files First

Read in this order:

1. `docs/11-agent-onboarding.md`
2. `README.md`
3. `docs/08-planner.md`
4. `docs/03-business-rules.md`
5. `docs/06-api-contracts.md`
6. `docs/09-i18n.md`
7. `docs/10-frontend-ui-stack.md`

## Current Status

Backend:

- Auth is implemented.
- JWT session is implemented.
- Permission guard is implemented.
- Role permission APIs are implemented.
- User list API is implemented.
- User creation API is implemented.
- User update/delete APIs are implemented.
- Backend protects `dev` and `admin` role permission management from normal admin users.
- Backend protects the system from deleting, deactivating, or demoting the last active admin account.
- Swagger API documentation is implemented at `/api/docs`.

Frontend:

- Login exists.
- Dashboard exists.
- Role permission screen exists.
- User list screen exists.
- User create/edit/delete UI exists.
- Product profile backend/frontend foundation exists.
- Product profiles store product code, model path, per-batch quantity, camera settings, and ROI regions per product.
- Product profile template apply flow exists for all products or selected product codes.
- Product profile create flow supports empty ROI state and later template apply.
- Product profile ROI editor supports:
  - draw ROI directly on preview
  - drag to move ROI
  - drag handles to resize ROI
  - drag to rotate ROI on horizontal axis
  - undo/redo
  - copy/paste ROI
  - multi-select with `Shift`
  - equal-spacing/alignment/straight-angle assist overlays
  - overlap detection that blocks save
- Product preview uses `frontend/public/preview-background.png` as the simulated camera background.
- User status quick-change dropdown exists and uses confirmation before applying changes.
- Shared confirm modal exists for update/delete/status confirmation flows.
- Role permission screen hides `dev/admin` from normal admin users; only `dev` can view/manage protected roles.
- Sonner notifications use current language and visual variants by notification type.
- Error/not-found screens exist with retry/home/report actions and language-aware copy.
- AppShell uses fixed application chrome: sidebar/header/navbar do not scroll with page content.
- Responsive behavior is being standardized around the 1280x1080 factory-machine viewport, but still needs a final pass across existing screens.

Electron/packaging:

- Not implemented yet.
- Must be added before production release.
- Electron must become the local app entry point.
- Final release target is a Windows `.exe`.
- Electron should eventually handle single instance, app lifecycle, local service startup/shutdown, dongle boot gate, and packaging.

## Current Next Task

Finish frontend hardening for the first operational module:

1. Complete final responsive verification for dashboard, roles, users, and products at 1280x1080.
2. Re-check smaller/larger viewports and remove any remaining page-level horizontal overflow.
3. Verify product profile ROI editor behavior with real backend restart and persisted save/load flow.
4. Start the first dedicated Camera/ROI operational screens on top of the product profile foundation.
5. Continue toward runtime inspection flow after product/setup behavior is stable.

## Non-Negotiable Rules

- Vietnamese UI copy must always use proper Vietnamese diacritics.
- The app must support English and Vietnamese.
- Every user-facing page, modal, error screen, empty state, validation, and notification must use the i18n layer and display according to the user's previously selected language.
- The frontend must be responsive across screen sizes, with 1280x1080 treated as the primary factory-machine viewport.
- Every operational/admin screen must be comfortable at 1280x1080 without page-level horizontal overflow; use internal table scrolling only when tabular data is wider than the available content area.
- Header, sidebar, and navbar are fixed application chrome and must not scroll with page/tab content; only the active content pane may scroll.
- Do not design only for web widescreen. Electron renderer layouts must work well on the 1280x1080 industrial PC screen first, then scale up/down for other desktop, laptop, tablet, and mobile sizes.
- The factory machine uses a single touchscreen display. All operational and setup screens must be designed touch-first: large hit targets, no hover-only critical actions, visible controls, and form inputs that work well with on-screen virtual keyboards.
- Frontend calls backend only.
- Backend later calls Python/FastAPI AI service.
- Backend must enforce authorization; frontend hiding is not enough.
- `dev` role is hidden from normal roles.
- Normal admin must not manage `dev`.
- Normal admin must not view or manage `admin/dev` role permissions; only `dev` can manage protected roles.
- `dev/admin` should use sidebar.
- `engineer/operator` should use navbar.
- Prefer shadcn-style UI components.
- Use Sonner for toast notifications.
- Use Recharts/shadcn chart patterns for charts.
- Never occupy a port that is already being used by the user. Before starting backend/frontend/dev servers, check whether the target port is already listening. If a temporary test server is started by an agent, it must be stopped immediately after verification and must not be left running.
- Do not create port conflicts with the user's own terminal sessions. If an agent accidentally starts a duplicate server or causes `EADDRINUSE`, identify and stop only the agent-started process as soon as testing is complete.
- Electron must eventually check dongle immediately at startup.
- The project must always be designed toward local `.exe` packaging, not web-only deployment.

## Electron And Packaging Goal

Do not treat the frontend as a standalone website. It is the renderer for a future Electron desktop app.

Expected final startup flow:

```text
User opens .exe
  -> Electron main starts
  -> Dongle/license check runs immediately
  -> If valid, Electron starts or connects to local backend
  -> Electron opens Next.js UI
  -> UI calls NestJS REST API
  -> NestJS calls Python/FastAPI AI service later
```

Expected final local components:

```text
Electron .exe
Next.js renderer
NestJS local API
PostgreSQL local database
Python/FastAPI AI service
USB dongle/license module
```

Electron work is not started yet, but every architecture decision should keep `.exe` packaging in mind.

## Commands

Run backend:

```powershell
npm run dev -w @ocr/backend
```

Before running backend, check port `4000`:

```powershell
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
```

Swagger:

```text
http://localhost:4000/api/docs
```

Run frontend:

```powershell
npm run dev -w @ocr/frontend
```

Before running frontend, check port `3000`:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

If a server is only needed for testing, stop the process immediately after the test finishes.

Run checks:

```powershell
npm run typecheck
npm run lint -w @ocr/backend
npm run lint -w @ocr/frontend
npm run test -w @ocr/backend
```

## Seed Accounts

```text
dev / admin123
admin / admin123
```
