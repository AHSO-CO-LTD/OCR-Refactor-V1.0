# Dongil Server integration

Status: Implemented; connected-server verification remains environment
dependent.

Last source review: `2026-10-06`. Related architecture records:
[`adr/0005-dongil-durable-outbox.md`](adr/0005-dongil-durable-outbox.md) and
[`adr/0007-dongil-database-config-and-fixed-machine-type.md`](adr/0007-dongil-database-config-and-fixed-machine-type.md).

## Purpose

This local washing-machine application is the first Dongil Server machine client. Dongil Server receives machine presence, the aggregate production OK/NG verdict, and only the per-scan OK/NG quantity totals required for washing statistics. Camera, PLC, OCR, Device Tool, images, individual ROI details, and NG text remain local.

## Local authorization and identity

```text
validate the existing physical dongle
-> dongle invalid: block startup and do not register
-> dongle valid: derive machine_id from License-Key machine-ID SDK
-> register and report LICENSED
```

A valid dongle is reported to Dongil Server as `licenseStatus=LICENSED`. This is a local-reported status, not cryptographic proof verified by Dongil Server.

The copied SDK under `external/license-key/` is read-only. Integration changes belong in `electron/src/license/`.

The current pilot does not read or evaluate `license.dat`. Local software-license activation and server-pushed activation are deferred. The reserved future product code is `ocr-metal-core-washing`.

## Configuration

PostgreSQL `DongilSyncConfiguration` is the runtime authority for server URL,
machine binding, registration state and server-assigned type. Packaged
installations may still contain the legacy file:

```text
C:\ProgramData\AHSO OCR\.env
```

Legacy values:

```dotenv
DONGIL_SERVER_URL=http://<dongil-server-ip>:3979
DONGIL_MACHINE_TYPE_CODE=WASHING_MACHINE
```

On first backend start after the configuration migration, a valid legacy
`DONGIL_SERVER_URL` is imported only when the DB has no URL and the import marker
has not been set. It is not read again as runtime authority. The legacy machine
type value is ignored; this OCR client always uses `WASHING_MACHINE`.

DEV/ADMIN can also open **Settings → General → Dongil Server** to:

- enter only `<server-ip>`; Electron derives `http://<server-ip>:3979`;
- test `/api/v1/health` without changing the saved value; DEV/ADMIN receive
  staged URL, health, registration, and machine-type diagnostics even when an
  expected check fails;
- save the server configuration without registering or connecting;
- reset the server configuration, which disconnects immediately and clears the saved URL, registration/assignment cache, local credential, and synchronized machine-information row while retaining outbox and history data;
- disconnect the current server without clearing its configuration; this disables automatic reconnection until a DEV/ADMIN explicitly connects again;
- send a registration request, refresh its state immediately, and explicitly connect only after server approval;
- view machine ID/type, connection state, runtime state, pending outbox count, last heartbeat and last error.

The saved URL is transactionally written to PostgreSQL with config audit.
Machine ID, fixed `WASHING_MACHINE` type and dongle license status are derived
locally and remain visible while offline. The server-assigned type is shown
separately; any non-washing assignment blocks socket/outbox/history work. The
renderer never receives the machine credential.

Operator has `dongil.connection.view`, `dongil.connection.operate`,
`dongil.history-sync.view`, and `dongil.history-sync.start` by default. Operator
may refresh status/registration, reconnect saved approved configuration, view
history progress and start a new run, but cannot edit/test/save/reset/register,
disconnect, or manage an existing history run. Backend permissions are authoritative.

## Registration and credential

Electron sends trusted local identity to the owned NestJS backend through a localhost endpoint protected by `DESKTOP_INTERNAL_TOKEN`. The backend registers through:

```http
POST /api/v1/machines/register
```

Payload:

```json
{
  "machineId": "XXXX-XXXX-XXXX-XXXX",
  "machineTypeCode": "WASHING_MACHINE",
  "licenseStatus": "LICENSED",
  "appVersion": "1.4.0"
}
```

The server creates a `PENDING` request and returns a registration token. Electron encrypts it with `safeStorage`; PostgreSQL stores only non-secret registration state. The local app checks approval every 10 seconds and also provides **Cập nhật trạng thái đăng ký ngay**. Neither action opens WebSocket.

DEV/ADMIN approves or rejects the request on Dongil Server. Approval activates the same token as the machine credential. After a successful connection, later application launches reconnect automatically unless a local DEV/ADMIN explicitly selects **Ngắt kết nối server**.

If the one-time credential is lost after registration, automatic registration cannot reveal it again. Use the controlled credential rotation/recovery flow on Dongil Server.

## WebSocket

- Namespace: `/machine-channel`.
- Transport: Socket.IO WebSocket.
- Heartbeat: 10 seconds by default.
- Reconnect: bounded exponential delay with jitter.
- Handshake authenticates `machineId` and machine credential.
- `machine:hello` and heartbeat report machine type and normalized license status.
- Heartbeat preserves the raw washing runtime state and reports normalized `RUNNING`, `PAUSED`, `STOPPED`, `STARTING`, `STOPPING`, `ERROR` or `UNKNOWN` separately.
- A normal application exit makes Electron call the protected local shutdown endpoint before stopping backend; backend sends `machine:shutdown` and waits up to 1.5 seconds for acknowledgement. An unexpected socket loss or heartbeat timeout is classified by the server as `CONNECTION_LOST`.
- The navbar server icon polls real local connection state every 5 seconds: green is connected, amber is connecting/retrying, red is disabled/error/unauthorized.
- OK/NG results are not sent through WebSocket.

## Product identity

Result delivery uses the local `Product.code` and `Product.name`; it does not depend on `GET /api/v1/machine-config/current`, profile assignment, or model metadata. If the product is missing on Dongil Server, the authenticated washing result creates it automatically inside `WASHING_MACHINE` with profile `v1 {}`.

The configuration endpoint and local assignment cache remain only for transition compatibility and possible future capabilities. They do not gate production capture.

## OK/NG outbox

One accepted PLC cycle has one `plcCaptureId`. That ID becomes `localResultId`.

```text
aggregate ROI results
-> final OK or NG
-> count known ROI results as okCount + ngCount; exclude UNKNOWN
-> transaction: InspectionLog rows + DongilSyncOutbox row
-> washing-specific background batch send, max 500
-> ACCEPTED or REPLAYED marks SENT
```

The washing sender uses:

```http
POST /api/v1/machine-types/washing/inspection-results/batches
```

Each item contains the shared scan verdict plus `okCount` and `ngCount`. ROI rows are not uploaded. `UNKNOWN` is not included in either quantity and an aggregate `UNKNOWN` scan is not queued.

Outbox rows created before the quantity migration retain null counts and continue through the generic batch endpoint. The client does not invent missing historical quantities.

The worker runs every 5 seconds. A server/network outage does not block PLC or OCR. Retry uses bounded exponential backoff. Missing server product/profile/model metadata never creates a new `BLOCKED_CONFIG` row.

### DEV uploaded-image simulation

The Operation screen exposes an image simulation panel only to the local `dev` role. It uses the currently selected product, saved ROI configuration, current OCR model and normal OK/NG matching rules. A completed result is persisted through the same transaction as a real PLC-latched result:

```text
uploaded image -> ROI crop -> real OCR -> aggregate OK/NG
-> InspectionLog rows + DongilSyncOutbox row -> normal background sender
```

This development path does not force an OK/NG verdict, does not pulse the PLC, and does not upload the image to Dongil Server. An `UNKNOWN` OCR outcome is shown locally and is not queued.

On startup, interrupted `SENDING` rows return to `PENDING`. `BLOCKED_CONFIG`
rows remain blocked until credential recovery or a relevant configuration
change reopens them. Stable local IDs preserve server idempotency.

Local tables:

- `DongilSyncConfiguration`: non-secret identity/configuration state;
- `DongilMachineInfo`: latest server-confirmed display name, activation state, and factory/line/station metadata; disconnect retains it, while Reset clears it;
- `DongilProductAssignment`: transition cache for legacy/future server configuration;
- `DongilSyncOutbox`: immutable product identity, result payload, washing OK/NG counts and delivery state.

## Historical washing-result synchronization

DEV/ADMIN and users with `dongil.history-sync.start` can start **Đồng bộ lịch sử máy rửa** from the Dongil Server
settings panel once the machine is connected. The action creates an immutable
local snapshot before any historical result is uploaded. It is intended for a
machine that has accumulated local data while offline for a long period.

- Every snapshot item uses its existing stable `localResultId` and original
  `inspectedAt`. The client never generates a replacement ID for old data and
  never substitutes the server receipt time for the inspection time.
- The worker sends no more than 500 items to
  `POST /api/v1/machine-types/washing/inspection-results/batches`, with the
  current `Machine` credential and `X-Machine-Id` header. `ACCEPTED` and
  `REPLAYED` are both durable delivery confirmations; a failed item remains
  local with its last error and retry state.
- The snapshot, batch ID, per-item delivery result, retry timing and checkpoint
  are stored in PostgreSQL. A restart returns in-flight items to a retryable
  state and resumes the same snapshot after reconnecting.
- Successful verification is persisted on the outbox record. Later runs include
  only new, changed, unconfirmed or unverified results. A changed or newly
  imported result invalidates its previous verification and makes its
  day/session eligible again.
- Upload and reconciliation have separate durable completion timestamps. The UI
  reports upload success immediately, then reconciliation starts automatically.
  A reconciliation error does not turn the completed upload phase into an
  upload failure.
- Counter reconciliation uses the complete local total for each affected
  day/session. If a counter differs, that scope expands to verify every stable
  local result ID before the final counter check.
- Starting another run when no result needs upload or verification returns a
  successful no-op. The local UI reports that data is already current and shows
  the most recent completed verification time instead of presenting an error.
- New PLC captures continue to be stored in `InspectionLog` and the ordinary
  outbox first. They are deliberately outside the historical snapshot and are
  sent only after that snapshot no longer owns the delivery worker.
- The historical worker reconciles each local session (or Asia/Ho_Chi_Minh day
  where no session exists) with `POST /api/v1/sync/reconcile`, then verifies
  every `localResultId` in groups of at most 500 through
  `POST /api/v1/sync/reconcile/result-ids`. Missing IDs are requeued and
  rechecked. A final counter mismatch after all IDs are present blocks the run
  for manual investigation instead of claiming completion.
- A result reconstructed from older `InspectionLog` data is eligible only when
  it has an existing `plcCaptureId`, related product and usable OK/NG counts.
  Records that lack a stable historical identity are saved to the local manual
  review list; no ID is fabricated.
- The Processing screen shows batch/result progress, newly accepted, replayed
  and failed counts, the latest batch/retry/checkpoint and manual-review count.
  **Tiếp tục vận hành** only hides this screen; it does not pause the backend
  worker. Roles with the view permission can see progress. Start has its own
  permission; `dongil.history-sync.manage` is required only for pause, resume,
  cancel, or retry failures.

`DongilSyncWorkerLease` is a shared database lease: the normal outbox sender
and historical sender cannot post batches concurrently for the same machine.
No local inspection data is deleted after server confirmation.

## One-machine pilot checklist

1. Open Settings → General → Dongil Server, enter and test `192.168.3.4`, then save the configuration.
2. Start the local application with a valid physical dongle and press **Gửi yêu cầu đăng ký**.
3. Confirm the machine appears in the pending-registration table on Dongil Server with the expected `machine_id`.
4. Approve it on the server, then wait up to 10 seconds or press **Cập nhật trạng thái đăng ký ngay** on local.
5. Press **Kết nối server** on local; approval alone must not connect automatically.
6. Select a local product that does not yet exist on Dongil Server.
7. Run one known OK and one known NG PLC cycle.
8. Confirm Dongil Server automatically creates the matching product and profile `v1 {}`.
9. Confirm the local outbox reaches `SENT`.
10. Confirm server raw results show exactly one OK and one NG, and washing statistics match the known ROI OK/NG quantities.
11. Disconnect LAN, run additional cycles, reconnect, and confirm offline results replay without duplicates.
12. Close the local app normally and confirm `SHUTDOWN`; restart, then interrupt the LAN and confirm `CONNECTION_LOST` followed by automatic `ONLINE` recovery.

## Diagnostics

Electron terminal logs use the `[dongil]` prefix and never include the credential. Local outbox error fields contain sanitized server error codes/messages. Important recovery states:

- `REGISTRATION_PENDING`, `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`;
- `MACHINE_TYPE_MISMATCH` blocks connection until Dongil Server assigns
  `WASHING_MACHINE`;
- `NEEDS_CREDENTIAL_RECOVERY` blocks automatic retry until a valid credential
  is restored;
- missing/lost credential for an already approved machine requires controlled recovery on Dongil Server; public registration never exposes the existing secret;
- permanent/configuration failures remain `BLOCKED_CONFIG` until recovery;
- `DONGIL_SERVER_UNAVAILABLE`.
