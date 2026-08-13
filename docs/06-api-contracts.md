# API Contracts

## Purpose

This document defines the first REST API contract for the refactor project.

The main rule is:

```text
frontend -> backend -> tool
```

The frontend only talks to the NestJS backend. The backend talks to the Python/FastAPI Device/OCR Tool in `tool/` when camera, OCR, or image processing is needed.

## API Style

- REST-first
- JSON request and response bodies
- backend owns authorization
- frontend renders features based on session permissions
- Device/OCR Tool failures must be surfaced by backend responses; frontend must not call the tool directly

## Base URLs

Recommended local defaults:

```text
Frontend: http://localhost:3969
Backend:  http://localhost:3979/api
Tool:     http://localhost:8668/tool/v1
```

These ports can change later, but the responsibility split should stay the same.

## Common Response Shape

Successful responses should return predictable JSON:

```json
{
  "data": {},
  "meta": {}
}
```

Errors should return:

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid username or password",
    "details": {}
  }
}
```

## Common Types

### Role

```ts
type RoleCode = "dev" | "admin" | "engineer" | "operator";
```

### Permission

```ts
type PermissionKey =
  | "dashboard.view"
  | "user.manage"
  | "role.manage"
  | "permission.manage"
  | "product.manage"
  | "camera.manage"
  | "roi.edit"
  | "inspection.start"
  | "inspection.stop"
  | "inspection.override"
  | "history.view"
  | "report.view"
  | "system.shutdown"
  | "system.debug"
  | "license.view";
```

### Session User

```ts
type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: RoleCode;
  permissions: PermissionKey[];
  isDev: boolean;
};
```

## Auth APIs

### Login

```http
POST /auth/login
```

Request:

```json
{
  "username": "operator1",
  "password": "operator1"
}
```

Response:

```json
{
  "data": {
    "accessToken": "jwt-or-local-session-token",
    "user": {
      "id": "user_001",
      "username": "operator1",
      "fullName": "Operator 1",
      "role": "operator",
      "permissions": ["inspection.start", "inspection.stop", "roi.edit"],
      "isDev": false
    }
  }
}
```

### Get Current Session

```http
GET /auth/me
```

Response:

```json
{
  "data": {
    "user": {
      "id": "user_001",
      "username": "operator1",
      "fullName": "Operator 1",
      "role": "operator",
      "permissions": ["inspection.start", "inspection.stop"],
      "isDev": false
    }
  }
}
```

### Restore Remembered Session

```http
GET /auth/restore
```

Uses the same bearer token response shape as `GET /auth/me`, but is reserved for startup auto-login. It rejects dongle mock mode and succeeds only after a real physical dongle check returns `DONGLE_OK`. PLC and camera state are not part of this authentication decision.

### Logout

```http
POST /auth/logout
```

Response:

```json
{
  "data": {
    "success": true
  }
}
```

## User APIs

### List Users

```http
GET /users
```

Response:

```json
{
  "data": [
    {
      "id": "user_001",
      "username": "operator1",
      "fullName": "Operator 1",
      "department": "Production",
      "employeeNo": "OP001",
      "role": "operator",
      "active": true,
      "lastLoginAt": "2026-06-09T08:00:00.000Z"
    }
  ]
}
```

### Create User

```http
POST /users
```

Request:

```json
{
  "username": "engineer1",
  "password": "change-me",
  "fullName": "Engineer 1",
  "department": "Engineering",
  "employeeNo": "EN001",
  "role": "engineer",
  "active": true
}
```

### Update User

```http
PATCH /users/:id
```

Request:

```json
{
  "fullName": "Engineer A",
  "department": "Engineering",
  "role": "engineer",
  "active": true
}
```

### Set User Permissions

```http
PUT /users/:id/permissions
```

Request:

```json
{
  "permissions": ["product.manage", "camera.manage", "roi.edit"]
}
```

## Role And Permission APIs

### List Roles

```http
GET /roles
```

Response:

```json
{
  "data": [
    {
      "code": "admin",
      "name": "Admin",
      "visible": true,
      "permissions": ["user.manage", "role.manage", "product.manage"]
    }
  ]
}
```

Important rule:

- `dev` should be hidden from non-dev users.

### Set Role Permissions

```http
PUT /roles/:code/permissions
```

Request:

```json
{
  "permissions": ["product.manage", "camera.manage", "report.view"]
}
```

### List Permissions

```http
GET /permissions
```

Response:

```json
{
  "data": [
    {
      "key": "product.manage",
      "name": "Manage products",
      "group": "product"
    }
  ]
}
```

## Product APIs

### List Products

```http
GET /products
```

Response:

```json
{
  "data": [
    {
      "id": "product_001",
      "code": "SL-40",
      "name": "SL-40",
      "defaultNumber": 160,
      "batchSize": 150,
      "exposure": 3500,
      "thresholdAccept": 0.5,
      "thresholdMns": 0.5,
      "modelPath": "models/SL-40_150_0.998.pt",
      "rotateTestImageClockwise": true,
      "active": true,
      "camera": {
        "sourceType": "usb",
        "deviceName": "Camera 1",
        "rtspUrl": null,
        "exposure": 3500,
        "imageWidth": 1500,
        "imageHeight": 500,
        "offsetX": 0,
        "offsetY": 0,
        "zoomFactor": 0.4
      },
      "roiPoints": [
        { "index": 1, "x": 760, "y": 1180 },
        { "index": 2, "x": 1250, "y": 1180 }
      ]
    }
  ]
}
```

### Create Product

```http
POST /products
```

Request:

```json
{
  "code": "SL-40",
  "name": "SL-40",
  "defaultNumber": 160,
  "batchSize": 150,
  "exposure": 3500,
  "thresholdAccept": 0.5,
  "thresholdMns": 0.5,
  "modelPath": "models/SL-40_150_0.998.pt",
  "rotateTestImageClockwise": true,
  "active": true,
  "camera": {
    "sourceType": "usb",
    "deviceName": "Camera 1",
    "rtspUrl": null,
    "exposure": 3500,
    "imageWidth": 1500,
    "imageHeight": 500,
    "offsetX": 0,
    "offsetY": 0,
    "zoomFactor": 0.4
  },
  "roiPoints": [
    { "index": 1, "x": 760, "y": 1180 },
    { "index": 2, "x": 1250, "y": 1180 }
  ]
}
```

### Update Product

```http
PATCH /products/:id
```

### Update Product AI Settings

The Configuration screen keeps model and OCR tuning separate from basic
product data. `rowThreshold` is accepted only for the `dev` role.

```http
PATCH /products/:id/ai-settings
```

```json
{
  "modelPath": "models/SL-40.pt",
  "thresholdAccept": 0.5,
  "thresholdMns": 0.5,
  "rowThreshold": 20
}
```

Every field is optional so the client can update the model path without
overwriting thresholds, or update thresholds without changing the model.

### Update Line OCR Crop Rotation Settings

Only `dev` can update this OCR crop rotation setting. It is applied to the real line inspection flow, Camera AI flow, and line validation tools. New product profiles default `rotateTestImageClockwise` to `true`, so future products rotate the ROI crop before OCR unless explicitly changed.

```http
PATCH /products/:id/ocr-test-settings
```

Request:

```json
{
  "rotateTestImageClockwise": true
}
```

Response:

```json
{
  "data": {
    "id": "product_001",
    "code": "SL-40",
    "rotateTestImageClockwise": true
  }
}
```

### Delete Product

```http
DELETE /products/:id
```

### Apply Product Profile

Copy camera and ROI settings from one product profile to all products or selected product codes.

```http
POST /products/apply-profile
```

Request:

```json
{
  "sourceProductId": "product_001",
  "targetProductIds": ["product_002", "product_003"],
  "applyToAll": false
}
```

Response:

```json
{
  "data": {
    "updatedCount": 2
  }
}
```

## Camera And ROI APIs

### Get Camera Config

```http
GET /camera/config
```

Response:

```json
{
  "data": {
    "sourceType": "usb",
    "deviceName": "Camera 1",
    "rtspUrl": null,
    "exposure": 3500,
    "imageWidth": 1500,
    "imageHeight": 500,
    "offsetX": 0,
    "offsetY": 0,
    "zoomFactor": 0.4
  }
}
```

### Update Camera Config

```http
PUT /camera/config
```

### Get ROI Config

```http
GET /roi/config
```

Response:

```json
{
  "data": {
    "points": [
      { "index": 1, "x": 760, "y": 1180 },
      { "index": 2, "x": 1250, "y": 1180 },
      { "index": 3, "x": 1730, "y": 1180 },
      { "index": 4, "x": 2220, "y": 1180 },
      { "index": 5, "x": 2710, "y": 1180 }
    ]
  }
}
```

### Update ROI Config

```http
PUT /roi/config
```

Request:

```json
{
  "points": [
    { "index": 1, "x": 760, "y": 1180 },
    { "index": 2, "x": 1250, "y": 1180 }
  ]
}
```

## Inspection APIs

### Start Inspection

```http
POST /inspections/start
```

Request:

```json
{
  "productId": "product_001",
  "operatorNote": ""
}
```

Response:

```json
{
  "data": {
    "jobId": "job_001",
    "status": "running",
    "startedAt": "2026-06-09T08:00:00.000Z"
  }
}
```

### Stop Inspection

```http
POST /inspections/:jobId/stop
```

### Submit Exception

```http
POST /inspections/:jobId/exceptions
```

Request:

```json
{
  "type": "manual_roi_adjustment",
  "note": "ROI adjusted during run"
}
```

### DEV Simulate Uploaded Production Image

```http
POST /inspections/dev-simulate-image
```

- Requires an authenticated `dev` user and `inspection.start` permission.
- Accepts the current local product ID, the original image data URL, and ROI crop data URLs.
- Runs the existing OCR and aggregate matching rules.
- A completed `OK` or `NG` creates normal inspection logs and a Dongil outbox record.
- `UNKNOWN` is not queued, and this endpoint never emits a PLC result pulse.

### Get Current Inspection Status

```http
GET /inspections/current
```

Response:

```json
{
  "data": {
    "jobId": "job_001",
    "status": "running",
    "productId": "product_001",
    "okCount": 120,
    "ngCount": 2,
    "lastResult": {
      "result": "OK",
      "text": "SL40",
      "confidence": 0.98,
      "capturedAt": "2026-06-09T08:01:00.000Z"
    }
  }
}
```

## History And Report APIs

### List Inspection Logs

```http
GET /history/inspection-logs
```

Query params:

```text
productId
result
from
to
page
limit
```

### Get Report Summary

```http
GET /reports/summary
```

Query params:

```text
from
to
productId
```

Response:

```json
{
  "data": {
    "total": 1000,
    "ok": 980,
    "ng": 20,
    "okRate": 98,
    "ngRate": 2
  }
}
```

## System And License APIs

### Health Check

```http
GET /health
```

### License Status

```http
GET /system/license/public
GET /system/license
```

`/system/license/public` is used by the login screen before authentication.
`/system/license` requires a valid session and is used inside the dashboard.
Both endpoints trigger a local dongle check through the backend, write a
`license_logs` row, and return the current state.

Response:

```json
{
  "data": {
    "status": "licensed",
    "licensed": true,
    "donglePresent": true,
    "lastCheckedAt": "2026-06-09T08:00:00.000Z",
    "code": "DONGLE_OK",
    "message": "Dongle check passed"
  }
}
```

Login must fail closed when the current dongle check is not licensed or the
dongle is missing. Development can use `DONGLE_MOCK_MODE=true`; production
should use `DONGLE_MOCK_MODE=false` with `DONGLE_DLL_PATH` pointing at
`System8.dll`.

### Shutdown System

```http
POST /system/shutdown
```

This endpoint must require a high-level permission such as `system.shutdown`.

## Product XLSX Import

```http
GET /products/import/template?language=vi
POST /products/import
```

- Template là XLSX chỉ có hai cột `Mã sản phẩm` và `Link model`.
- Upload dùng `multipart/form-data`, field `file`, tối đa 5 MB và chỉ nhận `.xlsx`.
- Mã mới tạo sản phẩm với tên bằng mã và các thông số mặc định; mã đã tồn tại cập nhật link model.
- Yêu cầu quyền `product.manage`.

## Machine Runtime Controls

```http
GET /plc/machine/status
GET /plc/machine/frame
GET /plc/machine/inactivity-settings
PATCH /plc/machine/controls
PATCH /plc/machine/test-mode
PATCH /plc/machine/test-output
PUT /plc/machine/inactivity-settings
POST /plc/machine/activity
POST /plc/machine/test-result-pulse
POST /plc/machine/grab
```

`PATCH /plc/machine/controls` accepts any subset of:

```json
{
  "mode": "manual",
  "liveCameraEnabled": true,
  "realtimeAiEnabled": false
}
```

- `mode` is `manual` or `auto`.
- `machine/grab` is rejected as an action in Auto and never emits a PLC result pulse.
- `machine/frame` returns the latest frame captured by runtime plus its sequence; the frontend fetches it only when the sequence changes.
- `machine/status` exposes the three controls, `cameraFrameSequence`, `testModeActive`, and `testOutputEnabled` with the existing machine state.
- `machine/inactivity-settings` stores whether automatic inactivity pause is enabled and its timeout in seconds. Defaults are enabled and `300` seconds. Only `admin` and `dev` can read or update this settings screen contract.
- `machine/activity` records authenticated interaction from the renderer. App scroll, wheel, pointer, touch, keyboard, and focus activity is throttled client-side and resets the inactivity timer only while the machine is running.
- A PLC capture edge and a manual Grab attempt reset inactivity immediately when received, even if the current mode, AI state, live-camera state, or an in-progress capture causes the inspection action itself to be ignored.
- `machine/test-mode` acquires or renews a short-lived isolated test lease by `clientId`. While any lease is active, PLC capture triggers remain observable by test screens but do not execute the production machine-runtime latch or result pulse.
- `machine/test-output` enables or disables only the `OK`/`NG` result pulses for that test lease. The yellow waiting/checking output turns on automatically while either test page is active, independent of this option. When result pulses are enabled, an `OK` or `NG` result turns the yellow output off, emits the configured result pulse for its own `okPulseDurationMs` or `errorPulseDurationMs`, then restores the yellow output as soon as that pulse completes. `UNKNOWN` and test errors keep the yellow output on and emit no result pulse.
- `machine/test-result-pulse` accepts the active test `clientId` plus `result: "OK" | "NG"` and emits exactly the requested configured PLC pulse. `UNKNOWN` and test errors are never accepted as pulse results. Releasing or losing the final test lease restores the production waiting/checking output according to the machine runtime state.
- Test-screen PLC output is disabled by default in the frontend and is never persisted across page visits.

## Line Operation Reports

```http
GET /inspections/line-reports/summary?from=<ISO>&to=<ISO>&groupBy=day|month|year
GET /inspections/line-reports/export?from=<ISO>&to=<ISO>&groupBy=day|month|year
```

- Dữ liệu lấy từ các snapshot được PLC chốt trong session Line thực tế.
- Endpoint `summary` trả tổng session, kết quả OK/NG/UNKNOWN, ROI và thống kê theo kỳ.
- Endpoint `export` tải file XLSX gồm Summary, Statistics, Results và ROI details.
- Yêu cầu quyền `report.view`.

## Backend To Device/OCR Tool Contract

The frontend must not call this API directly.

### Analyze ROI Image

```http
POST /tool/v1/ocr/rois
```

Request from backend to Device/OCR Tool:

```json
{
  "model_path": "models/SL-40_150_0.998.pt",
  "grab_from_camera": true,
  "roi_list": [
    { "label": "slot-1", "x": 760, "y": 1180, "width": 240, "height": 80, "rotate_clockwise": false },
    { "label": "slot-2", "x": 1250, "y": 1180, "width": 240, "height": 80, "rotate_clockwise": false }
  ],
  "acceptance_threshold_ocr": 0.5,
  "duplication_threshold_ocr": 0.5,
  "row_threshold": 20
}
```

Response from Device/OCR Tool:

```json
{
  "success": true,
  "image_width": 1500,
  "image_height": 500,
  "cycle_time_ms": 45,
  "results": [
    { "index": 0, "label": "slot-1", "text": "SL40", "x": 760, "y": 1180, "width": 240, "height": 80, "error": null },
    { "index": 1, "label": "slot-2", "text": "SL40", "x": 1250, "y": 1180, "width": 240, "height": 80, "error": null }
  ],
  "error": null
}
```

## Authorization Rules

- every protected endpoint must check permission in backend
- frontend permission checks are only for UI rendering
- `dev` can bypass normal permission restrictions
- non-dev users should not see or manage the `dev` role
- admin can manage role/user permission lists except protected dev-only permissions

## Mocking Rule

When the Device/OCR Tool is unavailable, backend should return a clear service-unavailable error and the UI should show a Sonner error state.
