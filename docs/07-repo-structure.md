# Repository Structure

```text
backend/                 NestJS API, Prisma schema/migrations, native license runtime
build/                   tracked NSIS customization
docs/                    project documentation, ADRs, plans, historical UI notes
electron/                desktop main, preload, service lifecycle, updater, recovery
external/license-key/    protected original license reference
frontend/                Next.js renderer and UI modules
infra/                   deployment helper boundary
scripts/                 development and release automation
shared/                  reserved shared TypeScript contracts
tool/                    read-only Device Tool submodule
PROJECT_PROFILE.md       central current project profile
PRODUCT.md               product purpose and experience principles
AGENTS.md                repository-specific agent entry rules
```

## Backend Domains

- `auth/`, `users/`, `roles/`, `permissions/`
- `products/`, `camera/`, `device-tool/`
- `inspections/`, `plc/`
- `dongil-sync/`
- `system/`, `setup/`, `database/`, `common/`
- `prisma/` for schema, migrations, and seed

## Frontend Domains

- `app/` for App Router pages.
- `components/operator/` for Line and test workspaces.
- `components/camera/`, `products/`, `plc/`, `reports/`, `settings/`, `users/`.
- `components/system/`, `update/`, and `ui/` for cross-cutting runtime UI.
- `lib/api.ts` for current HTTP/WebSocket contracts.
- `lib/i18n.tsx` for English and Vietnamese copy.
- `lib/session.ts` for application-owned session storage.

## Electron Domains

- `main.ts`: desktop entry and IPC orchestration.
- `service-manager.ts`: service, migration, watchdog, hardware startup/shutdown, and internal calls.
- `preload.ts`: restricted renderer bridge.
- `auto-updater.ts`: user-driven update lifecycle.
- `update-recovery.ts`: configuration/database checkpoint and rollback.
- `license/`: local machine identity and credential storage integration.

## Dependency Rules

```text
frontend -> backend API
backend -> Prisma/PostgreSQL
backend -> Device Tool HTTP/WebSocket
backend -> Dongil Server HTTP/Socket.IO
Electron -> local services and protected backend internal API
```

- Do not import backend implementation into frontend.
- Do not import Tool implementation into backend.
- Keep `shared/` framework-neutral when it becomes active.
- New modules should follow domain ownership rather than expanding already large cross-domain files.

## Generated And Local Data

Dependencies, builds, `.next`, releases, runtime bundles, coverage, logs, real
environment files, Python virtual environments, and local databases are ignored.
Do not treat ignored local outputs as source-of-truth documentation.
