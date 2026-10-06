# AHSO OCR Metal Core Washing

Local-first Windows desktop software for camera- and PLC-driven OCR inspection
on an industrial washing line.

Current source baseline: `v1.4.0`.

## Runtime Architecture

```text
Electron desktop
  -> Next.js renderer
  -> NestJS local API
       -> PostgreSQL through Prisma
       -> Device Tool /tool/v1
       -> Dongil Server when configured
```

The frontend never calls camera, OCR, PLC, PostgreSQL, or Dongil services directly.

## Workspaces

| Path | Responsibility |
| --- | --- |
| `frontend/` | Next.js UI, i18n, touch-first operational and configuration screens |
| `backend/` | NestJS auth, permissions, product setup, inspection, PLC, reporting, and synchronization |
| `electron/` | Elevated desktop lifecycle, service orchestration, installer, updater, and recovery |
| `shared/` | Reserved framework-neutral contracts; not yet authoritative |
| `tool/` | Read-only FastAPI camera/OCR/PLC submodule |
| `scripts/` | Development and Windows release automation |
| `docs/` | Architecture, contracts, operations, decisions, and approved plans |

## Implemented Product Areas

- JWT login plus machine-bound remembered login using Electron `safeStorage`,
  a PostgreSQL token hash, and a real-dongle restore gate.
- Dynamic role permissions for `dev`, `admin`, `engineer`, and `operator`.
- User and role-permission administration.
- Product, AI, OCR variant, camera identity, camera, and ROI configuration.
- Basler camera connection, live stream, frame capture, and OCR through Device Tool.
- Modbus TCP and SLMP machine runtime with Manual/Auto, optional signals, inactivity pause, and DEV simulator.
- Production Line sessions, OK/NG capture logs, result saving, training images, reports, and XLSX export.
- Dongil machine registration, heartbeat, durable live outbox, and historical result reconciliation.
- Elevated Electron startup, service watchdog, graceful hardware shutdown, NSIS installer, updater, and rollback checkpoint.

## Documentation Entry Point

Read [PROJECT_PROFILE.md](PROJECT_PROFILE.md) first, then
[docs/11-agent-onboarding.md](docs/11-agent-onboarding.md).

Important references:

- [Architecture](docs/01-architecture.md)
- [Runtime flow](docs/02-runtime-flow.md)
- [Business rules](docs/03-business-rules.md)
- [API contracts](docs/06-api-contracts.md)
- [Dongil integration](docs/12-dongil-server-integration.md)
- [PLC runtime](docs/13-plc-runtime.md)
- [Database](docs/14-database.md)
- [Security](docs/15-security.md)
- [Development](docs/16-development.md)
- [Logging](docs/17-logging-and-diagnostics.md)

## Development Defaults

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3970` |
| Backend | `http://localhost:3980/api` |
| Swagger | `http://localhost:3980/api/docs` |
| Device Tool | `http://localhost:8668/tool/v1` |

Packaged machines use the explicit values written to
`C:\ProgramData\AHSO OCR\.env`.

Before starting any service, check that the target port is free or belongs to a
healthy service intended for reuse. Never take over a user-owned process.

## Common Commands

```powershell
npm ci
npm run dev -w @ocr/backend
npm run dev -w @ocr/frontend
npm run dev:desktop
```

Verification commands are run only when explicitly requested:

```powershell
npm run typecheck
npm run lint -w @ocr/backend
npm run lint -w @ocr/frontend
npm run test -w @ocr/backend
npm run build
```

## Protected Boundaries

- `tool/` is strictly read-only for application work.
- Original license sources and binaries must not be modified without explicit approval.
- Real `.env`, credentials, release tokens, and runtime secrets must not enter Git or logs.
- Source presence and installer publication do not prove live dongle, camera, PLC,
  database, updater, or Dongil acceptance.
