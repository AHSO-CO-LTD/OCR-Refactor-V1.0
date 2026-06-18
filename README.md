# OCR Metal Core Washing Refactor

This repository is the refactor target for the original Python/PyQt OCR system.

Target stack:

- Desktop shell: Electron
- Frontend: Next.js + React + TypeScript
- Backend: NestJS
- AI/Tool service: Python + FastAPI, prepared later
- Database: PostgreSQL
- Deployment target: local Windows `.exe`

This repo has moved past the initial documentation-first phase. The backend and frontend foundations are scaffolded, and the documents in `docs/` remain the project source of truth for architecture, runtime flow, business rules, and implementation roadmap.

## Repository Structure

```text
frontend/  Electron + Next.js UI
backend/   NestJS local REST API
ai/        Python + FastAPI OCR/AI service, prepared later
shared/    shared TypeScript contracts
docs/      architecture and planning documents
infra/     local environment and deployment helpers
scripts/   development and packaging automation
```

## First Build Target

The first implementation milestone is mostly implemented:

```text
backend + PostgreSQL + auth + users + roles + permissions
```

This foundation lets the frontend render one shared UI with different features depending on each user's permission list.

Backend API documentation is available through Swagger when the backend is running:

```text
http://localhost:4000/api/docs
```

## Current Handoff

Before continuing implementation, read:

- `docs/11-agent-onboarding.md`
- `docs/08-planner.md`

Current active direction:

```text
Finish responsive hardening for dashboard/roles/users/products/camera -> Product profile verification -> dedicated ROI/History/Reports screens -> real runtime flow -> Electron + dongle
```

Current implemented foundation:

- Auth, JWT session, permissions, roles, and users APIs are implemented.
- Backend Device Tool integration foundation exists with inspection start/current/stop endpoints and per-ROI inspection logging.
- Backend camera APIs proxy Device Tool status, device discovery, connect, grab, and live stream through the local backend.
- Frontend login, dashboard, role permissions, and user management screens exist.
- User management supports create/edit/delete/status flows with shared confirmation UI.
- Normal admin cannot manage protected `admin/dev` role permissions; only `dev` can.
- i18n, Sonner notifications, and error/not-found screens are wired for English/Vietnamese.
- App shell is being standardized around fixed chrome and the 1280x1080 factory-machine viewport.
- App shell now warms up camera status/device discovery in the background for camera or inspection users.
- Product profile management exists with model path, camera config, ROI editor, template apply flow, and simulated preview background.
- `/dashboard` already hosts an operator runtime foundation with product selector, ROI preview, persisted batch-size save, and OK/NG counters.
- `/dashboard/camera` exists with product-profile selection, Device Tool status/device discovery, connect/grab/live controls, view adjustment persistence, and manual camera refresh.
- Dedicated `roi`, `history`, and `reports` pages are not created yet even though their menu permissions exist.

## Port Safety Rule

Agents must never take over a port already being used by the user. Before starting local servers, check the target port first:

```powershell
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

If an agent starts a backend/frontend server only for testing, it must stop that process immediately after verification.
