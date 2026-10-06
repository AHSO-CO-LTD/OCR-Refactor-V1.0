# Current Planner

Last source review: 2026-10-06

## Delivered

- Repository, backend, database, frontend, and permission foundation.
- Product, camera identity, camera, AI, OCR variant, and ROI configuration.
- Line operation, Line Test, PLC runtime, DEV simulator, history reports, and exports.
- Electron startup, license gate, service watchdog, shutdown, installer, updater, and recovery.
- Dongil registration, presence, live outbox, machine information, and historical reconciliation.
- Source-runtime stabilization for DB-authoritative Dongil configuration, fixed
  washing-machine type, operator connection/synchronization permissions,
  machine-bound remembered login, dongle-check coordination, and camera
  discovery count correctness. Manual source cold-boot, Dongil/outbox and
  operator acceptance were reported successful; packaged acceptance remains
  pending.
- Version 1.4.0 source and historical Windows release workflow.

## Active Documentation Work

The approved documentation baseline refresh is tracked at
[plans/2026-10-05-documentation-baseline-refresh.md](plans/2026-10-05-documentation-baseline-refresh.md).

The completed source implementation and remaining packaged pilot for auth and
Dongil reliability are tracked at
[plans/2026-10-05-auth-dongil-cold-boot-reliability.md](plans/2026-10-05-auth-dongil-cold-boot-reliability.md).

## Recommended Next Engineering Plan

The next implementation plan should address runtime correctness and acceptance in this order:

1. Decide the supported ROI rotation product rule and correct preview/runtime crop equivalence.
2. Add OCR-local security hardening for revocable session lifecycle, audit,
   local bindings, IPC, and external URLs. Account lockout and login rate
   limiting are deferred until a separate policy is approved; no Dongil Server
   source/API/database change is allowed.
3. Run an approved target-machine acceptance matrix for install, update, rollback,
   dongle, camera, PLC, OCR, offline behavior, and Dongil reconciliation.
4. Remove or explicitly isolate demo fallback from production Line behavior.
5. Plan behavior-preserving decomposition of oversized service and API modules.

Each item is separate scope and requires inspection, plan, approval, implementation,
and verification. Do not combine them silently.

## Current Known Gaps

- Free-angle ROI editor versus 90-degree runtime crop normalization.
- No complete mutation audit pipeline.
- No server-side JWT expiry/revocation/logout policy, enforced login lockout, or rate limiting.
- Device Tool binds beyond loopback and has no application authentication.
- The new CR/LF/BOM-aware runtime parser and legacy ProgramData backup path are
  implemented. Runtime Dongil settings are DB-only; packaged-machine parsing,
  backup, cold-boot, and downgrade behavior still require verification.
- Shared TypeScript contract workspace remains inactive.
- Hardware and recovery behavior are not proven by this documentation pass.

## Definition Of Done For Future Features

Applicable plans cover business rules, permission enforcement, error/loading/empty
states, data migration, audit, concurrency, idempotency, hardware behavior,
rollback, documentation, and explicit verification status.
