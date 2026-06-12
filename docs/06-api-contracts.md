# API Contracts

## Purpose

This document defines the first REST API contract for the refactor project.

The main rule is:

```text
frontend -> backend -> ai
```

The frontend only talks to the NestJS backend. The backend talks to the Python/FastAPI AI service when OCR or image processing is needed.

## API Style

- REST-first
- JSON request and response bodies
- backend owns authorization
- frontend renders features based on session permissions
- AI service can be mocked while it is not ready

## Base URLs

Recommended local defaults:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000/api
AI:       http://localhost:5000
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
      "active": true,
      "camera": {
        "sourceType": "usb",
        "deviceName": "Camera 1",
        "rtspUrl": null,
        "exposure": 3500,
        "imageWidth": 2500,
        "imageHeight": 1000,
        "offsetX": 300,
        "offsetY": 1400,
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
  "active": true,
  "camera": {
    "sourceType": "usb",
    "deviceName": "Camera 1",
    "rtspUrl": null,
    "exposure": 3500,
    "imageWidth": 2500,
    "imageHeight": 1000,
    "offsetX": 300,
    "offsetY": 1400,
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
    "imageWidth": 2500,
    "imageHeight": 1000,
    "offsetX": 300,
    "offsetY": 1400,
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
GET /system/license
```

Response:

```json
{
  "data": {
    "licensed": true,
    "donglePresent": true,
    "lastCheckedAt": "2026-06-09T08:00:00.000Z"
  }
}
```

### Shutdown System

```http
POST /system/shutdown
```

This endpoint must require a high-level permission such as `system.shutdown`.

## Backend To AI Service Contract

The frontend must not call this API directly.

### Analyze Image

```http
POST /ai/analyze
```

Request from backend to AI service:

```json
{
  "jobId": "job_001",
  "productCode": "SL-40",
  "imagePath": "runtime/frames/frame_001.png",
  "roi": [
    { "index": 1, "x": 760, "y": 1180 },
    { "index": 2, "x": 1250, "y": 1180 }
  ],
  "thresholds": {
    "accept": 0.5,
    "mns": 0.5
  }
}
```

Response from AI service:

```json
{
  "jobId": "job_001",
  "text": "SL40",
  "confidence": 0.98,
  "boxes": [
    {
      "label": "text",
      "confidence": 0.98,
      "x": 100,
      "y": 120,
      "width": 240,
      "height": 80
    }
  ],
  "processingMs": 45
}
```

## Authorization Rules

- every protected endpoint must check permission in backend
- frontend permission checks are only for UI rendering
- `dev` can bypass normal permission restrictions
- non-dev users should not see or manage the `dev` role
- admin can manage role/user permission lists except protected dev-only permissions

## Mocking Rule

While AI service is not ready, backend should provide mock inspection responses behind a config flag.

Recommended flag:

```text
AI_MOCK_MODE=true
```
