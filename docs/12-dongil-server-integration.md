# Dongil Server integration

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

Development uses the repository `.env`. Packaged installations use:

```text
C:\ProgramData\AHSO OCR\.env
```

Required pilot values:

```dotenv
DONGIL_SERVER_URL=http://<dongil-server-ip>:3979
DONGIL_MACHINE_TYPE_CODE=WASHING_MACHINE
```

Do not set `DONGIL_SERVER_URL` to `localhost` unless Dongil Server actually runs on the same PC. The installer preserves an existing Dongil URL during repair/reinstall.

DEV/ADMIN can also open **Settings → General → Dongil Server** to:

- enter only `<server-ip>`; Electron derives `http://<server-ip>:3979`;
- test `/api/v1/health` without changing the saved value;
- save the server configuration without registering or connecting;
- send a registration request, refresh its state immediately, and explicitly connect only after server approval;
- view machine ID/type, connection state, runtime state, pending outbox count, last heartbeat and last error.

The saved URL is written atomically to the same development or ProgramData `.env`. Machine ID, `WASHING_MACHINE` type and dongle license status are derived locally and remain visible before the server is configured or while it is offline. The renderer never receives the machine credential. All signed-in roles can see the status, but Electron re-validates an active DEV/ADMIN session before changing the URL.

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
  "appVersion": "1.2.8"
}
```

The server creates a `PENDING` request and returns a registration token. Electron encrypts it with `safeStorage`; PostgreSQL stores only non-secret registration state. The local app checks approval every 10 seconds and also provides **Cập nhật trạng thái đăng ký ngay**. Neither action opens WebSocket.

DEV/ADMIN approves or rejects the request on Dongil Server. Approval activates the same token as the machine credential. The first connection still requires the local user to press **Kết nối server**. After that first explicit connection succeeds, later application launches may reconnect automatically.

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

On startup, legacy `BLOCKED_CONFIG` rows are returned to `PENDING` with their original `localResultId`, product identity, quantities, and inspection time. Server idempotency prevents duplicate results.

Local tables:

- `DongilSyncConfiguration`: non-secret identity/configuration state;
- `DongilProductAssignment`: transition cache for legacy/future server configuration;
- `DongilSyncOutbox`: immutable product identity, result payload, washing OK/NG counts and delivery state.

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
- missing/lost credential for an already approved machine requires controlled recovery on Dongil Server; public registration never exposes the existing secret;
- legacy `BLOCKED_CONFIG` rows are automatically requeued;
- `DONGIL_SERVER_UNAVAILABLE`.
