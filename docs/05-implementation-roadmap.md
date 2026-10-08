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
- DB-backed local authentication sessions, revocable logout/account-state
  handling, remembered-login restore, camera WebSocket session checks, backend
  loopback binding, and denied renderer-created windows. Static checks,
  isolated migration/integration tests, and source backend runtime verification
  are complete; packaged acceptance remains pending.

## Current Hardening Priorities

1. Complete packaged target-machine acceptance for the additive `AuthSession`
   migration, remembered login, camera, PLC, dongle, installer, updater,
   database backup/restore, and Dongil connectivity loss.
2. Verify packaged backend loopback binding, Electron external-window policy,
   local IPC boundaries, log redaction, and Device Tool firewall/network policy.
3. Add complete audit coverage for privileged mutations through a separately
   inspected and approved plan.
4. Remove or clearly isolate production demo fallback behavior through a
   separately approved behavior-preserving change.
5. Split oversized frontend API, inspection, Electron main, and service-manager
   modules through separately approved behavior-preserving refactors.
6. Promote stable frontend/backend contracts into `shared/` only where this
   reduces demonstrated drift.

## Documentation Baseline

The completed documentation refresh is tracked in
[plans/2026-10-05-documentation-baseline-refresh.md](plans/2026-10-05-documentation-baseline-refresh.md).

The current packaged acceptance gates are tracked in
[plans/2026-10-05-auth-dongil-cold-boot-reliability.md](plans/2026-10-05-auth-dongil-cold-boot-reliability.md)
and
[plans/2026-10-06-local-auth-session-and-runtime-security.md](plans/2026-10-06-local-auth-session-and-runtime-security.md).

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

- Free-angle ROI/runtime crop equivalence. ROI is stable in current operations
  and must not be changed without a new approved scope; Tool supports only
  90-degree crop rotation increments today.
- Login lockout and login rate limiting. The rejected five-attempt/60-second
  policy must not be introduced or replaced implicitly.
- JWT expiry, refresh tokens, and inactivity timeout. Current DB-backed sessions
  remain valid until logout, revocation, invalid account state, or deletion.
- User-level additive/removal permission overrides beyond the current replacement semantics.
- Tool-side arbitrary-angle ROI crop support.
- Device Tool binding/authentication changes; current exposure is handled as a
  deployment/firewall concern unless a separate Tool task is explicitly approved.
- Centralized structured logging and correlation IDs.
- Formal production log retention automation.
- Broader shared-contract extraction.

Each deferred change requires its own inspected and approved plan.
