# Project Profile

Last source review: 2026-10-08
Current source candidate: `1.5.0-rc.2` on branch `remote`; last published release: `v1.4.0`

## Project

AHSO OCR Metal Core Washing is a local-first industrial inspection application
for a single Windows factory workstation. It controls a camera and PLC, runs
product-specific OCR, records production results, and optionally synchronizes
aggregate washing results with Dongil Server. The product is distributed as an
administrator-required Windows desktop application, not as a cloud website.

## Stack

- Desktop: Electron 39, electron-builder 26, NSIS.
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4.
- Backend: NestJS 11 REST/WebSocket API.
- Database: PostgreSQL with Prisma 6 migrations.
- Device runtime: Python 3.11 FastAPI submodule in `tool/`.
- UI libraries: local shadcn-style primitives, Sonner, Recharts, Lucide.
- Package manager: npm workspaces; Node.js 22 or newer.

## Architecture

```text
Electron main process
  -> starts or reuses local Device Tool, backend, and frontend
  -> performs startup, update, recovery, and shutdown orchestration
  -> exposes a restricted preload bridge

Next.js renderer
  -> calls NestJS only

NestJS backend
  -> enforces authentication and permissions
  -> owns business state and PostgreSQL persistence
  -> calls Device Tool through /tool/v1
  -> communicates with Dongil Server when configured

Device Tool
  -> owns Basler camera, OCR/YOLO, Modbus TCP, and SLMP device operations
```

The `shared/` workspace is reserved for framework-neutral contracts but is not
yet the authoritative contract package. Current frontend API types remain in
`frontend/lib/api.ts` and backend DTOs remain in their domain modules.

## Database

- PostgreSQL is the durable source of truth.
- Schema: `backend/prisma/schema.prisma`.
- Migration history: `backend/prisma/migrations/`.
- Current schema contains 29 models and 13 enums.
- Electron runs `prisma migrate deploy` before starting the backend unless
  `BACKEND_AUTO_MIGRATE=false`.
- Installer bootstrap creates or reuses a selected PostgreSQL database and runs
  production migrations and seed data.
- Production inspection and Dongil data are never deleted after successful synchronization.

See [docs/14-database.md](docs/14-database.md).

## Authentication And Authorization

- Credentials are verified with bcrypt password hashes.
- NestJS issues bearer JWTs signed with `JWT_SECRET`.
- Roles are `dev`, `admin`, `engineer`, and `operator`.
- Effective permissions come from user permissions when present; otherwise role permissions apply.
- `dev` bypasses ordinary permission checks and is hidden from non-dev management flows.
- Only `dev` can view or manage protected `admin`/`dev` role permissions.
- Backend guards are authoritative; frontend menu filtering is only a UX layer.
- Remembered login is available to all four active roles. Electron stores the
  opaque token with Windows `safeStorage`; PostgreSQL stores only its SHA-256
  hash and machine/user binding. Restore requires real `DONGLE_OK` and issues a
  fresh current-session JWT.
- Access JWT and user state live in renderer `sessionStorage`; legacy remembered
  JWT keys in `localStorage` are removed and are never used for restore.
- Current source creates a local PostgreSQL `AuthSession` for each password or
  remembered login and places its ID in JWT `sid`. HTTP guards and camera
  WebSocket authorization reject revoked/inactive sessions. Static checks and
  isolated migration/runtime verification have passed; packaged acceptance is
  still pending.

JWT expiry remains intentionally unset under the accepted no-inactivity-timeout
policy. Login rate limiting and enforced failed-attempt lockout are deferred;
audit coverage remains incomplete outside the newly covered auth, user and role
permission mutations.
See [docs/15-security.md](docs/15-security.md).

## UI

- English and Vietnamese are implemented through `frontend/lib/i18n.tsx`.
- Current default is Vietnamese; the selected language is persisted.
- Primary layout target is a 1280 x 1024 single-touchscreen factory display.
- `dev` and `admin` use sidebar navigation; operational roles use navbar navigation.
- `/dashboard` currently redirects to the Line workspace.
- Product, AI, ROI, camera, identity, and diagnostic setup are unified under
  `/dashboard/configuration`.
- Dedicated Line, Line Test, PLC configuration, reports, test reports, users,
  roles, and settings routes exist.
- Browser-native alert, confirm, and prompt dialogs are not part of the intended UI pattern.

## Operational Runtime

- Machine controls support Manual/Auto, camera live, and realtime AI independently.
- PLC protocols are Modbus TCP and Mitsubishi SLMP through Device Tool.
- Production captures persist inspection logs and may emit configured OK/NG signals.
- Manual Grab and Line Test do not emit production result pulses.
- Aggregate `UNKNOWN` results are not latched, counted, persisted as production
  captures, or sent to PLC.
- Inactivity pause, PLC stop, recovery, and graceful hardware shutdown are implemented.

See [docs/13-plc-runtime.md](docs/13-plc-runtime.md).

## Dongil Integration

- Machine identity is derived locally after a valid physical dongle check.
- Registration requires explicit server approval and stores the machine credential locally.
- PostgreSQL `DongilSyncConfiguration` is authoritative for the server URL.
  ProgramData `.env` is imported once only for legacy compatibility.
- Local machine type is fixed to `WASHING_MACHINE`; a different server assignment
  blocks connection and delivery rather than overwriting the local type.
- Presence and heartbeat use Socket.IO; production results use REST outbox delivery.
- Durable historical synchronization snapshots, retries, delivery dispositions,
  counter reconciliation, and result-ID reconciliation are implemented.
- Camera images, OCR rows, ROI details, PLC internals, and Device Tool state stay local.

See [docs/12-dongil-server-integration.md](docs/12-dongil-server-integration.md).

## Desktop And Services

- Packaged builds require Administrator on every launch.
- Electron enforces a single instance and uses `contextIsolation: true`,
  `nodeIntegration: false`, and renderer sandboxing.
- Startup order covers Device Tool, database migration, backend, frontend,
  license, PLC, camera power/light, camera frame readiness, and PLC signals.
- License failure blocks entry. PLC/camera preparation failures are warnings so
  manual diagnosis remains possible.
- The watchdog restarts unhealthy app-owned services but does not kill unrelated
  external processes occupying a port.
- Normal shutdown attempts camera, output, PLC, Dongil, and owned-service cleanup.

## Installer And Updater

- Windows installer: per-machine NSIS with elevation.
- Local release candidate `1.5.0-rc.1` was built without publishing on
  2026-10-07 and passed artifact/manifest/checksum/protected-boundary checks,
  but packaged testing found that its frontend bundle retained the dev API URL
  on port `3980`. Local candidate `1.5.0-rc.2` corrects the production build
  guard and safe uninstall defaults and was built without publishing on
  2026-10-08; packaged acceptance remains pending.
- Online preflight checks Node.js 22+, bundled Tool Python 3.11, PostgreSQL 14+,
  and network access only when a missing runtime must be downloaded.
- The installer supports new databases, reuse, selection of a different name,
  or explicit replacement.
- Production seed creates a hidden support `dev`; the customer creates the first admin in `/setup`.
- GitHub Releases is the update source.
- Download and install are separate user actions.
- Update preparation backs up runtime configuration and PostgreSQL, retains the
  prior installer, validates startup, and can roll back after failure.

See [docs/12-release-setup.md](docs/12-release-setup.md).

## Ports

Current development defaults:

| Service | Port |
| --- | ---: |
| Frontend | 3970 |
| Backend | 3980 |
| Device Tool | 8668 |

Packaged machines may receive explicit values from
`C:\ProgramData\AHSO OCR\.env`. Dongil Server defaults to port 3979 on its
factory-LAN address. Port ownership must always be checked before starting a local service.

## Logging

- Electron buffers service output and exposes startup/update log export.
- NestJS uses framework loggers for runtime diagnostics.
- License checks persist `LicenseLog` records.
- Dongil delivery and history reconciliation persist durable status and errors.
- `AuditLog` covers remembered-login lifecycle, Dongil configuration,
  reconnect, and history-start changes. Other mutation domains still do not
  provide complete audit coverage.

See [docs/17-logging-and-diagnostics.md](docs/17-logging-and-diagnostics.md).

## Source Boundaries

- `tool/` is a read-only submodule. Application work may inspect its contract,
  but Tool-side changes must be handled as a separately approved Tool task.
- Original license code and binaries are protected. Do not modify
  `external/license-key/`, `backend/native/System8.dll`, native license helpers,
  or the fallback Python dongle script without explicit license-side approval.
- Frontend calls backend only.
- Do not treat source presence, a successful build, or a published installer as
  proof of production hardware acceptance.

## Current Verification Status

The `v1.4.0` source and installer publication have historical evidence. Phase
9A on 2026-10-06 generated Prisma Client, passed 66 targeted backend tests, both
env/bootstrap harnesses, all three workspace typechecks, and all three
production builds. Phase 9B applied all 48 migrations to a backed-up isolated
PostgreSQL 18.4 database and passed six guarded DB integration tests covering
remembered login, revocation, operator permissions, fixed machine type and
Dongil idempotency. Phase 9C then ran the backend and frontend against that
isolated database: health passed, the physical dongle returned `DONGLE_OK`,
admin/operator remembered-session restore and opt-out passed, operator Dongil
read permissions passed, fixed type remained `WASHING_MACHINE`, and browser
layout had no horizontal overflow at 1280 x 1024. The database was restored from
its verified pre-runtime backup and all started services were stopped. A later
non-elevated Electron harness also verified current-user ACL recovery,
`safeStorage` token round-trip and artifact cleanup without starting the normal
desktop hardware flow. The configured workstation database was checked
read-only during Phase 9B and was not migrated by that test. A later read-only
`prisma migrate status` audit on 2026-10-06 found all 48 migrations applied and
the workstation `ocrahso` schema up to date; the audit did not apply migrations
or establish when or by whom they were deployed.

On 2026-10-07, the additive `AuthSession` migration was applied with all 49
migrations to a new guarded PostgreSQL 18 isolated database. A second deploy
reported no pending migrations. Seven DB integration tests passed for table,
index and cascade-FK structure, password and remembered-login `sid` issuance,
logout rejection of the old JWT, role/deactivation revocation, deletion cascade,
operator permissions and audit secret exclusion. A backend runtime check against
that database returned healthy and listened only on `127.0.0.1`; its process was
stopped, port `3981` was released, and the isolated database was removed. The
workstation `ocrahso` database was not migrated or written by this verification.

The user subsequently reported successful manual acceptance on the development
Electron source runtime: real remembered-login opt-in survived application
restart and a full Windows cold boot, operator Dongil controls respected the
approved allow/deny boundary, temporary LAN loss recovered with outbox replay,
and the reviewed runtime logs did not expose passwords, JWTs, remember tokens,
or machine credentials. This evidence is user-reported rather than
agent-captured and does not cover the packaged installer.
Changed source files pass non-fixing ESLint; full frontend and backend lint
remain blocked by documented baseline issues outside this change set. No seed,
installer acceptance, camera, PLC, updater, packaged cold boot, or
production-data migration pilot has been performed for this change.
