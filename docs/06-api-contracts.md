# API Contracts

## Direction

```text
Next.js -> NestJS /api -> Device Tool /tool/v1
                       -> PostgreSQL
                       -> Dongil Server
```

Frontend must not call Device Tool, PostgreSQL, PLC transports, dongle helpers,
or Dongil Server directly.

## Local Defaults

- Frontend: `http://localhost:3970`
- Backend: `http://localhost:3980/api`
- Swagger: `http://localhost:3980/api/docs`
- Device Tool: `http://localhost:8668/tool/v1`

Electron may supply different ports through runtime environment and fallback selection.

## Authentication

- Protected REST endpoints use `Authorization: Bearer <jwt>`.
- Camera proxy WebSockets currently receive the JWT as a `token` query parameter.
- Electron-only internal endpoints require `x-desktop-internal-token`.
- Backend permissions are reloaded from PostgreSQL for guarded actions.

## Response Convention

Most application endpoints wrap their payload in a top-level `data` field. Some
camera/Tool-adapter paths also return `success` and `error` fields. NestJS framework exceptions are
not yet normalized into one project-wide error envelope. Consumers must use the
typed frontend helper and stable message mapping until a separately approved API normalization task is completed.

## Endpoint Inventory

### System and setup

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health` | Public local health |
| GET | `/setup/status` | Public first-run status |
| POST | `/setup/initial-admin` | Public only while no active admin exists |
| GET | `/system/license/public` | Public startup license check |
| GET | `/system/license` | Authenticated |

### Authentication and administration

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/login` | Public with license gate |
| GET | `/auth/me` | Authenticated |
| GET | `/auth/restore` | Authenticated with physical dongle gate |
| GET/POST/PATCH/DELETE | `/users` and `/users/:id` | `user.manage` |
| GET | `/users/assignable-roles` | `user.manage` |
| POST | `/users/virtual-keyboard` | `user.manage` |
| GET | `/roles` | `role.manage` |
| PUT | `/roles/:code/permissions` | `role.manage`, protected-role rules |
| GET | `/permissions` | `permission.manage` |

### Products

| Method | Path | Main authorization |
| --- | --- | --- |
| GET | `/products` | Authenticated |
| POST/PATCH/DELETE | `/products`, `/products/:id` | `product.manage` |
| GET/POST | `/products/import/template`, `/products/import` | `product.manage` |
| PATCH | `/products/:id/roi-regions` | `roi.edit` |
| PATCH | `/products/roi-regions/apply-all` | `roi.edit` |
| PATCH | `/products/camera-settings/apply-all` | `product.manage` |
| PATCH | `/products/:id/ai-settings`, `/products/ai-settings/apply` | `product.manage` |
| PATCH | `/products/:id/ocr-accepted-variants` | `product.manage` |
| PATCH | OCR test settings routes | `system.debug` |
| PATCH | `/products/:id/batch-size` | Authenticated operational update |
| POST | `/products/apply-profile` | `product.manage` |

### Camera

All camera routes are JWT-protected and additionally apply their controller or
method permission rules.

- `GET /camera/status`
- `GET /camera/devices`
- `GET /camera/identities`
- `POST /camera/identities/sync`
- `PATCH /camera/identities/:id`
- `POST /camera/identities/:id/test-connection`
- `GET /camera/frame-rate`
- `GET /camera/ranges`
- `GET /camera/debug-info`
- `POST /camera/connect`
- `POST /camera/disconnect`
- `POST /camera/grab`
- `POST /camera/ai/start`
- `POST /camera/ai/stop`
- `WS /camera/stream?token=<jwt>`
- `WS /camera/ai/results?token=<jwt>`

### Inspection and reports

- `POST /inspections/start`
- `POST /inspections/begin`
- `GET /inspections/current`
- `POST /inspections/:jobId/stop`
- `POST /inspections/test-image`
- `POST /inspections/dev-simulate-image`
- `POST/GET /inspections/test-sessions`
- `GET /inspections/line-reports/summary`
- `GET /inspections/line-reports/results`
- `GET /inspections/line-reports/results/:captureId/image`
- `GET /inspections/line-reports/export`
- `GET/PATCH /inspections/line-result-settings`

Production start/stop and report routes enforce their named permissions. Test
and settings routes also perform role/permission logic in controller or service paths and must be reviewed when changed.

### PLC and machine runtime

- `GET/PUT /plc/config`
- `GET /plc/status`
- `POST /plc/connect`, `/plc/disconnect`
- `/plc/simulator/*`
- `/plc/outputs/*`
- `POST /plc/custom-keys/:id/execute`
- `GET /plc/machine/status`
- `GET /plc/machine/frame`
- `GET/PUT /plc/machine/inactivity-settings`
- `GET/PUT /plc/machine/stop-settings`
- `POST /plc/machine/activity`
- `PATCH /plc/machine/controls`
- `PATCH /plc/machine/test-mode`, `/plc/machine/test-output`
- `POST /plc/machine/test-result-pulse`
- `POST /plc/machine/start`, `/stop`, `/manual-latch`, `/grab`, `/resume`, `/reconnect-plc`

See [13-plc-runtime.md](13-plc-runtime.md) for signal and state semantics.

### Dongil

Authenticated history APIs:

- `GET /dongil-sync/history/current`
- `GET /dongil-sync/history/invalid`
- `POST /dongil-sync/history/start`
- `POST /dongil-sync/history/pause`
- `POST /dongil-sync/history/resume`
- `POST /dongil-sync/history/cancel`
- `POST /dongil-sync/history/retry-failures`

Electron-only internal Dongil routes live under `/internal/dongil-sync/*` and
require the per-process desktop token.

## Device Tool Contracts

Backend currently consumes:

- Basler discovery, connection, status, parameters, ranges, and diagnostics.
- Camera grab and live WebSocket stream.
- YOLO/OCR model loading, configuration, single-image prediction, camera OCR start/stop, and result WebSocket.
- Modbus TCP or SLMP connection plus common communication read/write/pulse/watch operations.

The Tool accepts ROI crop rotation in 90-degree increments. Application free-angle
ROI geometry is not a promise that the current Tool will crop at an arbitrary angle.

## Compatibility Rule

Any request, response, permission, WebSocket, or Tool contract change must inspect
all current consumers and preserve packaged-version compatibility or include an
approved migration and rollback path.
