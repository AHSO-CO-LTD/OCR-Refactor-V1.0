# Implementation Planner

## Purpose

This planner turns the roadmap into an actionable implementation checklist.

The project should start with frontend and backend. The current Python/FastAPI Device/OCR runtime lives in `tool/` and is integrated through the backend with the `/tool/v1` contract defined in `docs/06-api-contracts.md`.

## Current Strategy

Build order:

1. repository foundation
2. backend foundation
3. frontend shell
4. admin/dev permission flow
5. operational screens
6. Electron packaging
7. dongle integration
8. Device/OCR runtime integration

## Current Status Snapshot

Last updated: 2026-06-23

Completed:

- Stage 1 repository foundation.
- Stage 2 backend foundation.
- Stage 3 database foundation.
- Part of Stage 4 frontend foundation.
- Stage 5 dev/admin management flow is mostly implemented for roles and users.
- Backend Swagger API documentation at `/api/docs`.
- User create/edit/delete/status management exists in frontend and backend.
- Shared confirmation modal exists for user update/delete/status changes.
- Role permission UI and backend protect `admin/dev` from normal admin users.
- i18n is wired for pages, modals, validation, notifications, and error/not-found screens.
- AppShell fixed chrome behavior is implemented so only page content scrolls.
- Product profile foundation is implemented with product code, model path, per-product camera config, per-product ROI regions, and template apply flow.
- Product profile ROI editor now supports direct drawing, move/resize/rotate, undo/redo, copy/paste, multi-select, assist overlays, and overlap validation.
- Product profile `batchSize` is persisted and can be updated from the operator runtime dashboard.
- Operator runtime dashboard foundation exists on `/dashboard` with product selector, ROI preview, API/demo product loading, and OK/NG/batch counters.
- Operator runtime counter semantics are fixed as:
  `count` = recognized amount from the current scan,
  `quantity` = accumulated amount in the active batch,
  `batch` = completed package count with remainder rollover when `quantity >= batchSize`.
- Backend inspection foundation now includes Device Tool client wiring plus `/api/inspections/start`, `/api/inspections/current`, and `/api/inspections/:jobId/stop` with per-ROI inspection logs.
- Backend camera foundation proxies Device Tool status, device discovery, connect, grab, and live stream through `/api/camera/status`, `/api/camera/devices`, `/api/camera/connect`, `/api/camera/grab`, and `/api/camera/stream`.
- Device Tool integration now targets the API-Tool-v1 implementation in `tool/` with backend/Electron calls using configurable `DEVICE_TOOL_API_PREFIX=/tool/v1`. This active tool owns camera control and the current AI/yolo_ocr OCR runtime. The previous Device Tool source is kept as `tool-test/` for reference only.
- Backend license foundation checks the legacy `System8.dll` dongle flow, records `license_logs`, exposes public/authenticated license status endpoints, and blocks login when the dongle is missing unless dongle mock mode is enabled.
- Frontend login shows API/license/dongle startup status and disables sign-in until the backend reports a valid dongle.
- Dedicated Camera page exists at `/dashboard/camera` with product-profile selection, Device Tool status/device discovery, connect/grab/live controls, view adjustment persistence, and manual refresh for camera status/devices.
- AppShell warms up camera status/device discovery in the background for users with camera or inspection permissions.

In progress:

- Final responsive hardening for dashboard, roles, users, and products at the 1280x1080 factory-machine viewport.
- Role-based layout verification: `dev/admin` sidebar, `engineer/operator` navbar.
- Product module persisted save/load verification and Camera/ROI integration with product profiles.
- Dedicated Camera page verification with a real running Device Tool and connected hardware.
- Touch-first hardening for the single-screen factory touchscreen, including virtual-keyboard-friendly setup forms.
- Operator runtime foundation needs to be moved from demo-assisted UI behavior to the new inspection backend flow.
- Dedicated `roi`, `history`, and `reports` routes/screens are still missing behind existing menu permissions.

Not started:

- Dedicated ROI config screen/module.
- Dedicated history/reports screens and query flows.
- Electron shell.
- Full Electron boot-time dongle gate, periodic runtime recheck, and production hardware validation.
- Full runtime dashboard integration with the `tool/` OCR result flow.

For detailed handoff, read `docs/11-agent-onboarding.md`.

## Stage 1 - Repository Foundation

Goal: create a stable project structure.

Tasks:

- create `frontend/`
- create `backend/`
- create `tool/`
- create `shared/`
- create `infra/`
- create `scripts/`
- add root project metadata
- add root `.gitignore`
- add environment examples

Done when:

- repo folders exist
- docs match the repo structure
- team knows where each type of code belongs

## Stage 2 - Backend Foundation

Goal: create the NestJS API foundation.

Tasks:

- scaffold NestJS inside `backend/`
- connect PostgreSQL
- choose ORM or query layer
- create base config module
- create health endpoint
- create auth module
- create users module
- create roles module
- create permissions module
- implement password hashing
- implement session or token strategy
- implement permission guard
- add Swagger API documentation

Done when:

- backend starts locally
- `GET /api/health` works
- Swagger opens at `/api/docs`
- login API works
- session returns user permissions
- protected endpoints reject unauthorized users

## Stage 3 - Database Foundation

Goal: define the first PostgreSQL schema.

Tables:

- `users`
- `roles`
- `permissions`
- `role_permissions`
- `user_permissions`
- `products`
- `camera_configs`
- `roi_configs`
- `inspection_jobs`
- `inspection_logs`
- `audit_logs`
- `license_logs`

Done when:

- database can be migrated from empty state
- seed creates initial `dev` and `admin`
- default permissions exist
- backend can read/write core entities

## Stage 4 - Frontend Foundation

Goal: create the Next.js UI foundation.

Tasks:

- scaffold Next.js inside `frontend/`
- add app shell layout
- add login screen
- add authenticated layout
- add dashboard shell
- add API client
- add session store
- add permission helper
- add protected route handling
- add role-aware menu rendering

Done when:

- frontend starts locally
- login works through backend
- menu changes according to permission list
- unauthorized screens are hidden or blocked

## Stage 5 - Dev/Admin First

Goal: implement the top-level management experience first.

Tasks:

- create user management screen `[done]`
- create role management screen `[done]`
- create permission assignment screen `[done]`
- hide `dev` role from non-dev users `[done]`
- hide/protect `admin` role permission management from normal admin users `[done]`
- prevent normal admin from assigning dev-only permissions `[done]`
- add confirmation modal for update/delete/status flows `[done]`
- add user form validation and required field feedback `[done]`
- add audit logging for permission changes

Done when:

- dev can access everything
- admin can manage users and normal `engineer/operator` permissions
- non-dev users cannot see the `dev/admin` protected roles in role permission management
- permission changes affect UI after login/session refresh

## Stage 6 - Product And Config Screens

Goal: build the main engineering/admin setup screens.

Tasks:

- product list `[foundation done]`
- create/edit product `[foundation done]`
- product thresholds `[done]`
- product batch size per profile `[done]`
- product model path in basic profile fields `[done]`
- product code profile with camera and ROI data `[foundation done]`
- apply one product profile as template to all or selected product codes `[foundation done]`
- ROI preview background simulation `[done]`
- ROI editor draw/move/resize/rotate `[done]`
- ROI editor undo/redo `[done]`
- ROI editor copy/paste and multi-select `[done]`
- overlap prevention before save `[done]`
- camera config form `[foundation done inside product profile]`
- image size and offset config `[foundation done inside product profile]`
- ROI config screen `[not started as a dedicated page]`
- save and restore ROI config `[done inside product profiles]`

Done when:

- admin/engineer can configure product and camera data
- operator only sees allowed controls
- config data is persisted in PostgreSQL

## Stage 7 - Runtime Dashboard

Goal: build the operator-facing runtime flow.

Tasks:

- product selector `[ui foundation done]`
- start inspection
- stop inspection
- current status panel `[ui foundation done]`
- OK/NG counters `[ui foundation done]`
- latest OCR result panel
- exception checkbox/action
- ROI adjustment if permission allows `[preview foundation exists]`
- history preview

Done when:

- operator can run a mocked inspection flow
- backend can create and stop inspection jobs
- dashboard updates from backend data
- exception actions are logged

## Stage 8 - History And Reports

Goal: make production data reviewable.

Tasks:

- inspection log list
- filter by product/date/result
- report summary
- OK/NG rate
- export placeholder

Done when:

- users with report permission can view reports
- users without report permission cannot access reports
- inspection history is queryable

## Stage 9 - Electron Desktop Shell

Goal: package the app as a local desktop application.

Tasks:

- add Electron main process `[MVP done]`
- add preload bridge if needed `[minimal bridge done]`
- start backend from Electron `[development lifecycle done]`
- open Next.js renderer `[done]`
- enforce single instance `[done]`
- handle app shutdown `[owned-process shutdown done]`
- prepare build pipeline

Current Electron MVP:

- `electron/` is a dedicated workspace.
- Existing healthy services on ports `3000`, `4000`, and `8000` are reused.
- Missing or unhealthy frontend/backend/Device Tool services are started on the first available fallback port in their local range and health-checked.
- Electron stops only child processes it owns.
- Installer, bundled production artifacts, dongle gate, and service recovery UI remain pending.

Done when:

- app can be launched as a desktop window
- backend starts with the desktop app
- closing app shuts down cleanly
- local build path toward `.exe` is verified

## Stage 10 - Dongle Integration

Goal: add license protection.

Tasks:

- create dongle/license module `[backend foundation done]`
- implement boot-time check `[login-time backend check done; Electron startup gate pending]`
- implement retry logic `[backend foundation done]`
- log check result `[backend foundation done]`
- block app if dongle is missing `[login blocked; Electron shell block pending]`
- add periodic runtime recheck
- add license status screen/state

Done when:

- valid dongle allows app entry
- missing dongle blocks normal operation
- removal during runtime changes app state
- license events are logged

## Stage 11 - Device/OCR Runtime Integration

Goal: connect the runtime dashboard to the Python/FastAPI Device/OCR Tool in `tool/`.

Tasks:

- keep the `/tool/v1` FastAPI endpoints documented
- keep the backend Device Tool client aligned with `/tool/v1/ocr/rois`
- send camera/product ROI data to the Device/OCR Tool through backend only
- receive OCR text and tool timing/error details
- validate result against product rule
- persist inspection result

Done when:

- backend can run real OCR through the active Device/OCR Tool
- inspection result includes OCR text and per-ROI status
- dashboard shows real inspection data when the Device/OCR Tool is available

## Stage 12 - Release Hardening

Goal: prepare the first production candidate.

Tasks:

- test startup flow
- test shutdown flow
- test permission matrix
- test user lock behavior
- test dongle failure modes
- test local database migration
- test packaging on target Windows machine
- write deployment checklist

Done when:

- `.exe` can run on target local machine
- app recovers from common startup failures
- role/permission behavior is verified
- release notes and deployment steps are documented

## First Implementation Target

The first real coding milestone is now mostly implemented:

```text
NestJS backend + PostgreSQL + auth + users + roles + permissions
```

Reason:

- permissions control the whole UI
- admin/dev flow is the highest priority
- frontend can be built correctly once the session payload is stable

## Next Implementation Target

The next practical milestone is:

```text
Responsive admin shell hardening -> Product + Camera verification -> Dedicated ROI/History/Reports screens -> Real runtime flow
```

Reason:

- the admin/dev foundation is in place
- product data is the base configuration for inspection runtime
- camera and ROI configuration depend on product/setup workflows

## Notes

- Do not create a separate external OCR service; use the active Python/FastAPI Device/OCR Tool in `tool/`.
- Keep FE/BE usable when the Device/OCR Tool is unavailable, but route real OCR through `/tool/v1`.
- Keep the permission list flexible per role and per user.
- Keep all critical checks in backend.
- Keep Electron packaging in mind, but do not block early backend/frontend work on packaging.
