# Backend workspace

NestJS REST API for the local AHSO OCR station. The backend owns application
business rules, authorization, PostgreSQL persistence, orchestration of the
read-only Device/OCR Tool, PLC runtime, inspection sessions and Dongil Server
synchronization.

## Runtime

- Workspace: `@ocr/backend`
- Default development port: `3980`
- API prefix: `/api`
- Health: `GET /api/health`
- Swagger: `/api/docs`
- Database: PostgreSQL through Prisma 6
- Device Tool base URL: `DEVICE_TOOL_URL`, with `/tool/v1` as the normal API
  prefix

The frontend must call this API rather than calling the Device Tool directly.
Desktop-only internal endpoints require `DESKTOP_INTERNAL_TOKEN`.

## Modules

| Module | Responsibility |
| --- | --- |
| `auth`, `users`, `roles`, `permissions` | JWT authentication, secure remembered-login bootstrap and RBAC |
| `setup` | First active admin bootstrap |
| `system` | Public/authenticated license state and coordinated dongle checks |
| `products` | Product profiles, camera/AI/OCR/ROI settings, import/export support |
| `camera`, `device-tool` | Device discovery, connection, frames and Tool adapter |
| `inspections` | Production/test sessions, OCR results and reports |
| `plc` | PLC configuration, runtime state and machine signals |
| `dongil-sync` | DB-owned server configuration, registration, heartbeat, outbox and historical synchronization |
| `database`, `common` | Prisma lifecycle and shared backend infrastructure |

The authoritative data model and migration notes are in
[`../docs/14-database.md`](../docs/14-database.md).

Remembered login stores only a hash of a random bootstrap token in PostgreSQL;
the plaintext token exists only in Electron `safeStorage`. Restore requires the
desktop internal token, a matching machine/token/user/role record and a real
successful dongle check before a fresh access JWT is issued. Login without the
remember option, explicit logout, user deactivation and role changes revoke the
stored backend record.

Current source also creates a local PostgreSQL `AuthSession` and includes its ID
as JWT `sid`. HTTP guards and camera WebSocket authorization require an active
session. Logout revokes both the current session and remembered-login record;
this is entirely local to OCR and does not change Dongil Server contracts.

Dongil configuration is authoritative in PostgreSQL after an optional one-time
legacy `.env` import. The station machine type is fixed to `WASHING_MACHINE`;
server assignment mismatch blocks connection and synchronization instead of
allowing environment data to override the station type.

## Commands

Run from the repository root:

```powershell
npm run dev -w @ocr/backend
npm run prisma:generate -w @ocr/backend
npm run prisma:migrate -w @ocr/backend
npm run prisma:seed -w @ocr/backend
```

Verification commands exist but are not implicit side effects of documentation
or feature work:

```powershell
npm run typecheck -w @ocr/backend
npm run lint -w @ocr/backend
npm run test -w @ocr/backend
```

Before starting a server, check whether its configured port is already in use.
Stop only processes started by the current task.

## Boundaries

- Do not modify `tool/`; treat its HTTP contract as an external boundary.
- Do not modify original license source or binaries under
  `external/license-key/`, `backend/native/System8.dll`, the native helper or
  `backend/scripts/check-dongle.py`.
- Database changes require Prisma migrations.
- Backend authorization is authoritative; frontend visibility is only UX.
- Dongil operational endpoints require both the desktop internal token and a
  bearer JWT with the relevant permission. Arbitrary-IP diagnostics remain
  restricted to `dev`/`admin`.

See [`../PROJECT_PROFILE.md`](../PROJECT_PROFILE.md),
[`../docs/06-api-contracts.md`](../docs/06-api-contracts.md), and
[`../docs/16-development.md`](../docs/16-development.md) before changing this
workspace.
