# System Architecture

## Component View

```text
Windows industrial PC

Electron main process
  - elevation and single instance
  - startup and shutdown state machines
  - service ownership and watchdog
  - updater and rollback recovery
  - restricted preload IPC
        |
        v
Next.js renderer ---- REST/WebSocket ----> NestJS backend
                                            |        |
                                            |        +--> Dongil Server
                                            |
                                            +--> PostgreSQL / Prisma
                                            |
                                            +--> Device Tool /tool/v1
                                                   - Basler camera
                                                   - YOLO/OCR
                                                   - Modbus TCP / SLMP
```

## Electron Responsibilities

- Require Administrator for packaged runtime.
- Enforce a single application instance.
- Load ProgramData runtime configuration.
- Start or reuse healthy local services without taking over unrelated processes.
- Run database deployment migrations before backend startup.
- Display startup state and block on license failure.
- Coordinate hardware cleanup, owned-service shutdown, updates, and rollback.
- Persist desktop-only preferences outside business data.

Electron does not own business authorization or production data.

## Frontend Responsibilities

- Render login, setup, Line, configuration, reports, users, roles, and settings.
- Apply i18n, touch-first interaction, loading/error/empty states, and permission-aware visibility.
- Keep only minimal session and UI preference data in application-owned browser storage.
- Call NestJS only; never access Tool, database, dongle, or Dongil directly.

## Backend Responsibilities

- Authenticate users and enforce permissions.
- Own product, camera identity, ROI, PLC, inspection, reporting, and sync rules.
- Persist durable state through Prisma.
- Adapt Device Tool REST/WebSocket contracts.
- Maintain machine runtime state independent of page navigation.
- Persist and deliver Dongil outbox/history synchronization.
- Expose Swagger documentation.

## Device Tool Boundary

The Tool is a separately versioned read-only submodule. It owns device transport
and OCR execution. Current relevant namespaces include:

- `/tool/v1/basler_area/*`
- `/tool/v1/camera/*`
- `/tool/v1/AI/yolo_ocr/*`
- `/tool/v1/modbus_tcp/*`
- `/tool/v1/slmp/*`
- `/tool/v1/comm/*`

Backend converts application DTOs to these contracts and normalizes failures.

## Data And Contract Boundaries

- PostgreSQL is backend-only.
- `shared/` is not yet an active contract source.
- Backend DTOs and frontend `lib/api.ts` currently duplicate some contracts.
- Device Tool payload changes require coordinated consumer review.
- Dongil contracts use stable machine credentials and result IDs.

## Security Boundaries

- Renderer is sandboxed with Node integration disabled.
- Preload exposes an explicit IPC surface.
- Backend guards remain authoritative.
- Electron internal backend endpoints use a random runtime token.
- Device Tool network exposure requires deployment controls because the Tool has no application JWT layer.

## Decisions

Accepted architecture records are under [adr](adr/).
