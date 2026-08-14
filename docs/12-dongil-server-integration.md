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

- enter `http://<server-ip>:3979`;
- test `/api/v1/health` without changing the saved value;
- confirm Save and connect immediately without restarting the app;
- view machine ID/type, connection state, runtime state, pending outbox count, last heartbeat and last error.

The saved URL is written atomically to the same development or ProgramData `.env`. The renderer never receives the machine credential. All signed-in roles can see the status, but Electron re-validates an active DEV/ADMIN session before changing the URL.

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

The returned credential is encrypted by Electron `safeStorage` and stored under Electron user data. It is passed to the local backend in memory at startup and is never stored in the OCR PostgreSQL configuration table.

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

## Product/version assignment

The backend loads `GET /api/v1/machine-config/current` and caches the exact server assignment per local `Product.code`.

Before running production inspection, Dongil Server must contain and assign:

1. matching machine type;
2. product with the same code as the local product;
3. immutable profile version;
4. immutable model version;
5. active machine/profile/model assignment.

The cached tuple is captured into the outbox at inspection time. Version values are never derived from local timestamps or model paths.

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

The worker runs every 5 seconds. A server/network outage does not block PLC or OCR. Retry uses bounded exponential backoff. Missing assignment metadata creates `BLOCKED_CONFIG` instead of sending invented versions.

### DEV uploaded-image simulation

The Operation screen exposes an image simulation panel only to the local `dev` role. It uses the currently selected product, saved ROI configuration, current OCR model and normal OK/NG matching rules. A completed result is persisted through the same transaction as a real PLC-latched result:

```text
uploaded image -> ROI crop -> real OCR -> aggregate OK/NG
-> InspectionLog rows + DongilSyncOutbox row -> normal background sender
```

This development path does not force an OK/NG verdict, does not pulse the PLC, and does not upload the image to Dongil Server. An `UNKNOWN` OCR outcome is shown locally and is not queued.

When configuration becomes available, a blocked row is released automatically only if the server assignment already existed at that row's `inspectedAt`. Results older than the assignment remain blocked because applying a later version would corrupt historical reporting.

Local tables:

- `DongilSyncConfiguration`: non-secret identity/configuration state;
- `DongilProductAssignment`: last successful exact server assignments;
- `DongilSyncOutbox`: immutable result payload, washing OK/NG counts and delivery state.

## One-machine pilot checklist

1. Open Settings → General → Dongil Server, test `http://192.168.3.4:3979`, then Save and connect.
2. Start the local application with a valid physical dongle.
3. Confirm the machine appears on Dongil Server with the expected `machine_id`.
4. Assign the correct washing-machine product/profile/model tuple on the server.
5. Restart or wait for the next 30-second bootstrap/config refresh.
6. Run one known OK and one known NG PLC cycle.
7. Confirm the local outbox reaches `SENT`.
8. Confirm server raw results show exactly one OK and one NG, and washing statistics match the known ROI OK/NG quantities.
9. Disconnect LAN, run additional cycles, reconnect, and confirm offline results replay without duplicates.
10. Close the local app normally and confirm `SHUTDOWN`; restart, then interrupt the LAN and confirm `CONNECTION_LOST` followed by automatic `ONLINE` recovery.

## Diagnostics

Electron terminal logs use the `[dongil]` prefix and never include the credential. Local outbox error fields contain sanitized server error codes/messages. Important recovery states:

- `NEEDS_CREDENTIAL_RECOVERY`;
- `MACHINE_CONFIG_NOT_AVAILABLE`;
- `BLOCKED_CONFIG`;
- `DONGIL_SERVER_UNAVAILABLE`.
