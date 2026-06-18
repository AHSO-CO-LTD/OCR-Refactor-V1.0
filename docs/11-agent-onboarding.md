# Agent Onboarding Guide

## Purpose

This file tells a new agent or developer where to start when entering this project.

Read this first before changing code.

## Project In One Paragraph

This is a local industrial OCR inspection desktop app refactor. The old project was a Python/PyQt monolith. The new system is a local-first app with Next.js frontend, NestJS backend, PostgreSQL, future Python/FastAPI AI service, Electron packaging, and USB dongle boot protection.

## Read Order

1. `README.md`
2. `docs/00-project-overview.md`
3. `docs/01-architecture.md`
4. `docs/07-repo-structure.md`
5. `docs/03-business-rules.md`
6. `docs/06-api-contracts.md`
7. `docs/08-planner.md`
8. `docs/09-i18n.md`
9. `docs/10-frontend-ui-stack.md`
10. this file again

## Current Repo Structure

```text
frontend/  Next.js UI, future Electron shell
backend/   NestJS REST API
ai/        future Python/FastAPI service
shared/    future shared contracts
docs/      project source of truth
infra/     future local env/deploy helpers
scripts/   future automation scripts
```

## Current Progress

### Done

- Repo structure created.
- Next.js frontend scaffolded without `src/`; app router lives at `frontend/app`.
- NestJS backend scaffolded.
- PostgreSQL connected through Prisma.
- Prisma schema and first migration created.
- Seed creates default roles, permissions, `dev`, and `admin`.
- Login API works.
- JWT auth guard works.
- Permission guard works.
- Role permission management API works.
- User list API works.
- User creation API works.
- User update/delete APIs work.
- Admin cannot create or manage `dev` users; only `dev` can.
- Normal admin cannot view or manage `admin/dev` role permissions; only `dev` can manage protected roles.
- Backend prevents deleting, deactivating, or demoting the last active admin account.
- Swagger API documentation is available at `/api/docs`.
- Frontend login works.
- Frontend dashboard shell exists.
- Frontend role permission UI exists.
- Frontend users page lists users.
- Basic shadcn-style components added.
- Sonner installed and wired.
- Recharts installed and dashboard chart added.
- English/Vietnamese i18n layer added.
- Frontend user management create/edit/delete UI is implemented.
- User status quick-change dropdown is implemented.
- Shared confirm modal is implemented for account update/delete/status confirmations.
- User form validation, required markers, advanced fields, and inline errors are implemented.
- Sonner notifications are language-aware and visually vary by notification type.
- 404/not-found/error screens exist with retry/home/report actions and language-aware copy.
- Operator runtime dashboard foundation exists on `/dashboard` with product selector, API/demo product loading, persisted batch-size save, ROI preview, and OK/NG/batch counters.
- Product profile backend/frontend foundation is implemented.
- Product profiles store product code, model path, per-batch quantity, camera settings, and ROI regions per product.
- Product profile template apply flow can copy camera/ROI from one product to all products or selected product codes.
- Product profile form allows creating a profile without ROI, then filling ROI later or applying a template profile.
- Product profile ROI editor currently supports draw/move/resize/rotate, multi-select with `Shift`, copy/paste, undo/redo, alignment/equal-spacing/straight-angle assists, overlap validation, and simulated camera preview background.
- Backend inspection foundation now includes a Device Tool client plus `/api/inspections/start`, `/api/inspections/current`, and `/api/inspections/:jobId/stop` with per-ROI inspection logs.
- Backend camera foundation now proxies Device Tool status, device discovery, connect, grab, and live stream through `/api/camera/status`, `/api/camera/devices`, `/api/camera/connect`, `/api/camera/grab`, and `/api/camera/stream`.
- Dedicated Camera page exists at `/dashboard/camera` with product-profile selection, Device Tool status/device discovery, connect/grab/live controls, view adjustment persistence, and manual refresh for camera status/devices.
- AppShell warms up camera status/device discovery in the background for users with camera or inspection permissions.

### In Progress

- `dev/admin` use sidebar and `engineer/operator` use navbar.
- Frontend responsive behavior is being standardized around the 1280x1080 factory-machine viewport while still supporting smaller and larger screens.
- Existing dashboard, roles, users, and products screens need a final responsive verification pass at 1280x1080.
- Dedicated Camera page still needs verification with a real running Device Tool and connected hardware.
- Operator runtime still mixes real product-profile data with demo fallback; backend Device Tool integration has started, but the frontend runtime is not wired to the new inspection endpoints yet.

### Not Started

- Dedicated ROI config screen/module.
- Dedicated history/reports screens and query flows.
- Full end-to-end inspection runtime orchestration beyond the initial backend Device Tool integration.
- Electron shell.
- Dongle integration.
- Python/FastAPI AI service.
- User-level permission override UI.

## Current Backend Entry Points

Important files:

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/jwt-auth.guard.ts`
- `backend/src/auth/permissions.guard.ts`
- `backend/src/users/users.controller.ts`
- `backend/src/users/users.service.ts`
- `backend/src/roles/roles.controller.ts`
- `backend/src/roles/roles.service.ts`
- `backend/src/permissions/permissions.controller.ts`
- `backend/src/products/products.controller.ts`
- `backend/src/products/products.service.ts`

Important APIs:

```text
GET  /api/health
GET  /api/docs
GET  /api/docs-json
POST /api/auth/login
GET  /api/auth/me
GET  /api/users
POST /api/users
PATCH /api/users/:id
DELETE /api/users/:id
GET  /api/users/assignable-roles
GET  /api/roles
PUT  /api/roles/:code/permissions
GET  /api/permissions
GET  /api/products
POST /api/products
PATCH /api/products/:id
PATCH /api/products/:id/batch-size
DELETE /api/products/:id
POST /api/products/apply-profile
```

Default seeded accounts:

```text
dev / admin123
admin / admin123
```

## Current Frontend Entry Points

Important files:

- `frontend/app/layout.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/dashboard/page.tsx`
- `frontend/app/dashboard/roles/page.tsx`
- `frontend/app/dashboard/users/page.tsx`
- `frontend/app/dashboard/products/page.tsx`
- `frontend/components/app-shell.tsx`
- `frontend/components/operator/operator-runtime-panel.tsx`
- `frontend/components/products/product-profiles-panel.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/session.ts`
- `frontend/lib/i18n.tsx`

Current UI behavior:

- Login is centered and simple.
- Language toggle appears inside login form header.
- `dev/admin` should use sidebar.
- `engineer/operator` should use navbar.
- Menu items are filtered by permissions.
- 1280x1080 is the primary factory-machine viewport for frontend validation.
- The target factory machine uses one touchscreen only; setup and runtime screens must be touch-first and virtual-keyboard-friendly.
- Screens should avoid page-level horizontal overflow at 1280x1080; dense tables should scroll inside their own containers when needed.
- Header, sidebar, and navbar are fixed app chrome; only the active content pane should scroll.
- User-facing pages, modals, empty/error states, validation messages, and notifications must use the current selected language.
- Normal admin must only see/manage `engineer/operator` on role permission screens; `admin/dev` are protected for `dev`.
- `/dashboard` currently hosts the operator runtime foundation instead of a separate dedicated runtime module route.
- `roi`, `history`, and `reports` are present in menu permissions but do not have their own pages yet.
- Camera operations now have a dedicated page at `/dashboard/camera`; the page still depends on the Device Tool running locally, usually at `http://localhost:8000`.
- Product preview uses `frontend/public/preview-background.png` to simulate camera output when no live camera preview is available.
- Product profile save must reject overlapping ROI regions.

## Local Commands

Run backend:

```powershell
npm run dev -w @ocr/backend
```

Before starting backend, check whether port `4000` is already owned by a user process:

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

Before starting frontend, check whether port `3000` is already owned by a user process:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

Agent-started dev servers must be stopped immediately after testing. Never leave a backend/frontend server running after verification unless the user explicitly asked for it.

Run checks:

```powershell
npm run typecheck
npm run lint -w @ocr/backend
npm run lint -w @ocr/frontend
npm run test -w @ocr/backend
```

Prisma:

```powershell
npm run prisma:migrate -w @ocr/backend
npm run prisma:seed -w @ocr/backend
```

## Environment Files

Backend:

```text
backend/.env
backend/.env.example
```

Frontend:

```text
frontend/.env
frontend/.env.example
```

Frontend env key:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

## Non-Negotiable Rules

- Vietnamese UI copy must always use proper Vietnamese diacritics.
- The app must support English and Vietnamese.
- Frontend must call backend only.
- Backend calls AI service later.
- `dev` is hidden from normal roles.
- Normal admin must not manage `dev`.
- Authorization must be enforced in backend, not only by hiding UI.
- Dongle check must eventually happen immediately when Electron starts.
- Prefer shadcn-style UI components, Sonner, and Recharts for frontend.
- Optimize every frontend screen first for the 1280x1080 factory display, then verify mobile/tablet/laptop/wide-desktop responsiveness.
- Never occupy or reuse a port already being used by the user. Always check target ports before starting dev servers, and stop any agent-started test server immediately after verification.

## Suggested Next Task

Continue frontend hardening:

1. Finish standard responsive pass across existing dashboard, roles, and users screens.
2. Verify 1280x1080 does not produce page-level horizontal overflow.
3. Restart backend/frontend dev servers when validating role/user permission changes, to avoid stale dev-server state.
4. Finish Product module hardening, Camera page verification, and persisted product profile verification.
5. Create dedicated ROI/History/Reports pages and move the dashboard runtime foundation toward a real inspection flow.
