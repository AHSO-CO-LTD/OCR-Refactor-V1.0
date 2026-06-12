# Repository Structure

## Goal

This repository should be organized as a monorepo so that the desktop shell, frontend, backend, AI service, and shared types can evolve independently while still staying aligned.

The structure must support:

- local desktop deployment
- clear separation of responsibilities
- shared types and contracts
- future packaging into `.exe`
- incremental development without restructuring later

## Recommended Top-Level Layout

```text
ocr-metal-core-washing-refactor/
  frontend/
  backend/
  ai/
  shared/
  docs/
  infra/
  scripts/
  README.md
```

This is a simplified monorepo layout. It keeps the project in one repository while still separating the major system parts clearly.

## Top-Level Folder Responsibilities

### `frontend/`

Contains the user-facing desktop frontend.

Responsibilities:

- Electron shell
- Next.js UI
- login screen
- dashboard
- config pages
- history and reports
- role-aware rendering

### `backend/`

Contains the local NestJS API.

Responsibilities:

- auth and session management
- users, roles, permissions
- products and system settings
- inspection orchestration
- report APIs
- REST APIs for frontend
- REST calls to AI service

### `ai/`

Contains the Python FastAPI service.

Responsibilities:

- OCR and image processing
- OpenCV preprocessing
- YOLO / model inference
- confidence scoring
- structured result output

This folder can be scaffolded later, but the repo should already reserve its place.

### `shared/`

Contains shared contracts between frontend and backend.

Typical contents:

- TypeScript types
- enums
- DTO shapes
- validation schemas
- shared constants

Purpose:

- keep FE and BE aligned
- reduce duplicated type definitions
- define request/response contracts in one place

### `docs/`

Project documentation and source of truth.

Recommended files:

- `00-project-overview.md`
- `01-architecture.md`
- `02-runtime-flow.md`
- `03-business-rules.md`
- `04-dongle-license.md`
- `05-implementation-roadmap.md`
- `06-api-contracts.md`
- `07-repo-structure.md`

### `infra/`

Environment and deployment helpers.

Possible contents:

- database setup
- migration helpers
- environment templates
- local install helpers
- build assets

### `scripts/`

Automation scripts for development and packaging.

Possible contents:

```text
- start local services
- stop local services
- seed database
- build desktop app
- clean generated artifacts
```

## Dependency Direction Rule

To keep the system maintainable, dependencies should flow in one direction:

```text
frontend -> shared
backend -> shared
backend -> ai
ai -> shared only for compatible contracts, if needed
```

Rules:

- `frontend` should not import backend implementation code.
- `backend` should not import frontend UI code.
- `shared` should remain framework-neutral where possible.

## Naming Conventions

- Use lowercase folder names.
- Use clear domain-based module names.
- Keep one responsibility per module.
- Avoid dumping unrelated files into root folders.

## Why This Structure Works For This Project

This structure fits the project because:

- it matches the way you already think about frontend and backend
- it keeps the project easy to understand at the start
- the AI service can be prepared later without affecting the rest
- shared types prevent FE/BE drift
- packaging into `.exe` is easier when the desktop shell stays inside `frontend`

## Practical Recommendation

If you want the simplest safe starting point, the first real scaffold should be:

```text
frontend/
backend/
ai/
shared/
docs/
infra/
```

Then fill in each app gradually.
