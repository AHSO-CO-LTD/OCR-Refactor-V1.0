# System Architecture

## High-Level Architecture

```text
LOCAL PC / INDUSTRIAL PC

┌────────────────────────────────────────────────────────────┐
│                    DESKTOP APP (.exe)                     │
│                                                            │
│  Electron Main Process                                     │
│  - app lifecycle                                           │
│  - single instance                                         │
│  - local service startup/shutdown                          │
│  - dongle/license check                                    │
│  - auto update hooks                                        │
│                                                            │
│  Electron Renderer                                          │
│  - Next.js + React + TypeScript                             │
│  - dashboards                                              │
│  - config screens                                           │
│  - history and reports                                      │
│  - role-aware UI                                            │
└─────────────────────────────┬──────────────────────────────┘
                              │ REST
                              ▼
┌────────────────────────────────────────────────────────────┐
│                        NestJS API                          │
│                                                            │
│  - auth                                                    │
│  - users / roles / permissions                             │
│  - product config                                          │
│  - camera config                                           │
│  - ROI config                                              │
│  - inspection orchestration                                │
│  - history and reports                                     │
│  - websocket gateway if needed                              │
│  - calls AI service via REST                                │
└───────────────────────┬───────────────────────┬────────────┘
                        │ REST                  │ SQL
                        ▼                       ▼
┌──────────────────────────────────────┐   ┌──────────────────┐
│         Python AI Service           │   │ PostgreSQL       │
│         FastAPI                     │   │ local database   │
│                                      │   │                  │
│ - OpenCV                            │   │ - users          │
│ - OCR                               │   │ - roles          │
│ - YOLO                              │   │ - permissions    │
│ - preprocessing                     │   │ - products       │
│ - confidence output                 │   │ - configs        │
│ - result payload                    │   │ - inspection log │
└──────────────────────────────────────┘   └──────────────────┘
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

The frontend must not talk directly to camera SDKs, PLC libraries, or AI libraries.

### NestJS

NestJS is the local business backend and should own:

- authentication and session management
- permission enforcement
- CRUD for system data
- orchestration of inspection jobs
- persistence and retrieval of business data
- API contract normalization
- outbound calls to the AI service

### Python + FastAPI

Python service is the vision and AI worker and should own:

- frame preprocessing
- OCR
- detection
- model inference
- confidence scoring
- returning structured recognition results

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
- AI service is replaceable and isolated.
- All critical actions must be validated server-side.
- Offline operation must remain possible.

## Local-First Deployment Model

The app is not a cloud SaaS product. It is a local desktop system intended to run on one machine in the production environment.

Recommended runtime behavior:

- start Electron
- check dongle
- start local backend services
- connect to local PostgreSQL
- open the UI only after essential services are ready

## Suggested Repository Shape

```text
apps/
  desktop/   # Electron main + preload + packaging
  web/       # Next.js renderer
  api/       # NestJS backend
  ai/        # FastAPI service, later
packages/
  shared/    # shared types, schemas, constants
docs/
infra/
```

