# Agent Onboarding

## Read Order

1. `AGENTS.md`
2. `PROJECT_PROFILE.md`
3. `docs/00-project-overview.md`
4. `docs/01-architecture.md`
5. `docs/03-business-rules.md`
6. `docs/06-api-contracts.md`
7. task-relevant database, security, PLC, Dongil, release, or ADR documents

## First Inspection

Before proposing changes:

- inspect Git branch and worktree;
- inspect the current implementation and all consumers;
- inspect Prisma schema/migrations for data work;
- inspect accepted ADRs for architecture work;
- distinguish documented intent from current source behavior;
- identify what must not change.

Do not assume older status snapshots describe the current repository.

## Architecture Summary

Electron is the elevated Windows entry point. Next.js renders UI. NestJS owns
business logic, authentication, authorization, persistence, and integrations.
PostgreSQL is authoritative. Device Tool is a separate read-only FastAPI
submodule for camera, OCR, Modbus TCP, and SLMP. Dongil synchronization is optional and durable.

## Protected Boundaries

- Do not modify `tool/`.
- Do not modify original license code or binaries.
- Do not expose secrets in commands, logs, diffs, or documentation.
- Do not start or stop user-owned services.
- Do not commit, push, tag, publish, migrate, or run verification suites without authorization.

## Current Entry Points

Backend:

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/prisma/schema.prisma`
- domain controllers and services under `backend/src/`

Frontend:

- `frontend/app/layout.tsx`
- `frontend/components/app-shell.tsx`
- `frontend/components/operator/operator-runtime-panel.tsx`
- `frontend/components/camera/camera-live-view-panel.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/i18n.tsx`

Electron:

- `electron/src/main.ts`
- `electron/src/service-manager.ts`
- `electron/src/preload.ts`
- `electron/src/auto-updater.ts`
- `electron/src/update-recovery.ts`

## Development Defaults

- Frontend `3970`
- Backend `3980`
- Device Tool `8668`
- Swagger `/api/docs`

Check actual environment configuration and port ownership before starting anything.

## Verification Language

Report source inspection, static checks, build, unit tests, runtime checks,
hardware checks, installer checks, and production acceptance separately. Never
collapse them into one unqualified “verified” claim.

## Current Engineering Risks

- ROI free-angle/runtime crop mismatch.
- Incomplete session security and audit coverage.
- Local Tool network exposure.
- Runtime `.env` parser, backup, ACL and downgrade recovery are implemented but
  not yet verified in a packaged cold-boot acceptance run.
- Large cross-domain modules and inactive shared contracts.
- Hardware and update acceptance still require explicit target-machine evidence.
