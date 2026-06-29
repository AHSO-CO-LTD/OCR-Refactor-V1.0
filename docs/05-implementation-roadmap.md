# Implementation Roadmap

## Delivery Strategy

The project should be delivered in phases so the desktop app remains coherent at every stage.

The safest order is:

1. architecture and contracts
2. backend foundation
3. frontend shell
4. desktop packaging
5. Device/OCR Tool integration
6. production hardening

## Phase 0 - Foundation

### Goals

- confirm repo layout
- confirm stack choices
- define data contracts
- define permission model
- define local runtime startup strategy

### Outputs

- docs
- shared types
- service boundaries
- database schema draft
- API contract draft

## Phase 1 - Backend Core

### Goals

- create NestJS project
- create PostgreSQL schema
- implement auth
- implement users
- implement roles and permissions
- implement session handling

### Outputs

- login API
- permission-aware session payload
- CRUD for users
- CRUD for roles and permissions
- audit logging skeleton

## Phase 2 - Frontend Shell

### Goals

- create Next.js app
- create app shell
- create login screen
- create dashboard shell
- create shared UI components

### Outputs

- responsive desktop-like UI
- dynamic menus based on permissions
- protected routes
- reusable forms

## Phase 3 - Operational Modules

### Goals

- implement product management
- implement camera config screens
- implement ROI config screens
- implement runtime controls
- implement history and report screens

### Outputs

- role-aware screens
- CRUD and stateful workflows
- production-oriented layouts

## Phase 4 - Electron Desktop Shell

### Goals

- create Electron main process
- create preload bridge
- start local services
- connect renderer to local API
- handle single instance
- handle shutdown

### Outputs

- desktop app container
- local startup orchestration
- packaging path toward `.exe`

## Phase 5 - Dongle Integration

### Goals

- implement license check module
- retry logic
- boot gating
- runtime recheck

### Outputs

- unlicensed state handling
- protected app behavior
- dongle logs

## Phase 6 - Device/OCR Tool Integration

### Goals

- keep the Python/FastAPI `tool/` contract aligned with backend usage
- define image input and result payloads
- connect NestJS to the Device/OCR Tool

### Outputs

- OCR pipeline integration point
- inspection result API
- model inference workflow

## Phase 7 - Packaging And Hardening

### Goals

- bundle desktop app
- verify local install behavior
- test startup/shutdown
- test permissions
- test dongle failure modes

### Outputs

- release-ready `.exe`
- deployment checklist
- rollback and recovery notes

## Recommended Milestones

### Milestone A

Backend auth, users, permissions, and a basic frontend shell running locally.

### Milestone B

Product, camera, ROI, and history workflows available through REST.

### Milestone C

Electron packaging and dongle gating completed.

### Milestone D

Device/OCR Tool connected and inspection flow operational.

### Milestone E

Stabilization and production release candidate.

## Implementation Rules

- do not create a separate external OCR service
- keep the UI usable when the Device/OCR Tool is unavailable
- ship the backend and shell first
- keep all critical rules server-side
- preserve offline/local operation
