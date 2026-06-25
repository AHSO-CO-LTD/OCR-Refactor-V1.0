# System Architecture

## High-Level Architecture

```text
LOCAL PC / INDUSTRIAL PC

+------------------------------------------------------------+
|                    DESKTOP APP (.exe)                     |
|                                                            |
|  Electron Main Process                                    |
|  - app lifecycle                                          |
|  - single instance                                        |
|  - local service startup/shutdown                         |
|  - dongle/license check                                   |
|  - auto update hooks                                      |
|                                                            |
|  Electron Renderer                                        |
|  - Next.js + React + TypeScript                           |
|  - dashboards                                             |
|  - config screens                                         |
|  - history and reports                                    |
|  - role-aware UI                                          |
+-----------------------------+------------------------------+
                              |
                              | REST
                              v
+------------------------------------------------------------+
|                        NestJS API                         |
|                                                            |
|  - auth                                                   |
|  - users / roles / permissions                            |
|  - product config                                         |
|  - camera config                                          |
|  - ROI config                                             |
|  - inspection orchestration                               |
|  - history and reports                                    |
|  - websocket gateway for camera stream proxy              |
|  - calls Device/OCR Tool via REST/WebSocket               |
+-----------------------------+------------------------------+
                              |
                              | REST / WebSocket
                              v
+-----------------------------+------------------------------+
|            Python FastAPI Device/OCR Tool in tool/        |
|                                                            |
|  - camera discovery, connect, grab, live stream           |
|  - OCR ROI inference                                      |
|  - YOLO model runtime                                     |
|  - preprocessing                                          |
|  - structured OCR result payloads                         |
+-----------------------------+------------------------------+
                              |
                              | SQL through backend only
                              v
+------------------------------------------------------------+
|                        PostgreSQL                         |
|                                                            |
|  - users                                                  |
|  - roles                                                  |
|  - permissions                                            |
|  - products                                               |
|  - configs                                                |
|  - inspection logs                                        |
+------------------------------------------------------------+
```

## Recommended Responsibility Split

### Electron

Electron is the desktop container and should own:

- opening the desktop window
- enforcing single instance behavior
- starting and stopping local services
- boot-time dongle/license validation
- app-level shutdown and recovery flows
- packaging as `.exe`

### Next.js

Next.js is the UI layer and should own:

- all screens and layouts
- forms and validation
- role-aware rendering
- local user interaction
- dashboard visualization
- realtime status display when data is provided by backend

The frontend must not talk directly to camera SDKs, PLC libraries, or AI/OCR libraries.

### NestJS

NestJS is the local business backend and should own:

- authentication and session management
- permission enforcement
- CRUD for system data
- orchestration of inspection jobs
- persistence and retrieval of business data
- API contract normalization
- outbound calls to the Device/OCR Tool in `tool/`

### Python + FastAPI Device/OCR Tool

The Python/FastAPI service in `tool/` is the local device and OCR worker and should own:

- camera device discovery, connection, grab, and live stream
- frame preprocessing
- OCR
- detection
- model inference
- returning structured recognition results

The archived previous implementation stays in `tool-test/` for reference only.

### PostgreSQL

PostgreSQL stores all durable app data:

- users
- roles
- permissions
- products
- settings
- inspection logs
- history and reports
- license metadata if needed

## Core Design Rules

- UI is stateless with regard to security decisions.
- Backend is the source of truth for permissions.
- Device/OCR Tool is replaceable and isolated behind backend APIs.
- Frontend calls backend only.
- All critical actions must be validated server-side.
- Offline operation must remain possible.

## Local-First Deployment Model

The app is not a cloud SaaS product. It is a local desktop system intended to run on one machine in the production environment.

Recommended runtime behavior:

- start Electron
- check dongle
- start or connect to local backend, frontend, and Device/OCR Tool services
- connect to local PostgreSQL
- open the UI only after essential services are ready

## Suggested Repository Shape

```text
frontend/   # Next.js renderer and Electron shell
backend/    # NestJS backend
tool/       # FastAPI Device/OCR Tool
tool-test/  # archived previous Device Tool implementation
shared/     # shared types, schemas, constants
docs/
infra/
scripts/
```
