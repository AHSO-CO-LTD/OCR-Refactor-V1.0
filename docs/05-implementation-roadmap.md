# Implementation Roadmap

## Delivered Foundation

- npm workspace and local-first component boundaries.
- NestJS, PostgreSQL, Prisma migrations, Swagger, authentication, and permissions.
- Next.js shell, English/Vietnamese i18n, touch UI, users, roles, and settings.
- Product, AI, OCR variant, ROI, camera identity, camera, and test configuration.
- Inspection sessions, Line runtime, PLC protocols, DEV simulator, result saving, and reports.
- Electron lifecycle, elevated packaged runtime, service watchdog, and hardware shutdown.
- Dongle startup integration and first-run customer admin setup.
- NSIS installer, online prerequisites, updater, recovery checkpoint, and GitHub release workflow.
- Dongil registration, heartbeat, live outbox, machine information, and historical reconciliation.

## Current Hardening Priorities

1. Resolve free-angle ROI editing versus 90-degree runtime crop behavior without modifying Tool outside a separately approved Tool task.
2. Complete target-machine acceptance for camera, PLC, dongle, installer, updater, database backup/restore, and Dongil connectivity loss.
3. Add complete audit coverage for privileged mutations.
4. Define and implement JWT expiry, server-side revocation/logout, login lockout, and rate limiting.
5. Constrain local service network exposure and validate external URL/IPC policy.
6. Remove or clearly isolate production demo fallback behavior.
7. Split oversized frontend API, inspection, Electron main, and service-manager modules through approved behavior-preserving refactors.
8. Promote stable frontend/backend contracts into `shared/` where this reduces real drift.

## Documentation Baseline

The documentation refresh plan is tracked in
[plans/2026-10-05-documentation-baseline-refresh.md](plans/2026-10-05-documentation-baseline-refresh.md).

## Release Acceptance Gate

A release candidate is not production-ready until explicitly verified for:

- clean install, reuse, update, rollback, uninstall, and reinstall;
- database migration, backup, restore, and preserved configuration;
- physical dongle startup and runtime failure modes;
- known-good and known-NG camera/OCR samples;
- Modbus TCP or SLMP signals used by the target machine;
- offline production, restart recovery, and Dongil replay/reconciliation;
- 1280 x 1024 touchscreen workflows and virtual keyboard entry;
- permission matrix and protected-role behavior;
- logs and exported diagnostics without secrets.

## Deferred Decisions

- User-level additive/removal permission overrides beyond the current replacement semantics.
- Tool-side arbitrary-angle ROI crop support.
- Centralized structured logging and correlation IDs.
- Formal production log retention automation.
- Broader shared-contract extraction.

Each deferred change requires its own inspected and approved plan.
