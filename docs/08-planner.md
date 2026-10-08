# Current Planner

Last source review: 2026-10-08

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
- OCR-local revocable sessions using PostgreSQL `AuthSession` and JWT `sid`,
  dedicated logout, role/account-state revocation, camera WebSocket validation,
  backend loopback binding, and denied renderer-created windows. Prisma/schema,
  targeted tests, workspace typechecks, isolated 49-migration integration, and
  source backend loopback runtime checks passed; packaged acceptance remains
  pending.
- Version 1.4.0 source and historical Windows release workflow.
- Local Windows release candidate `1.5.0-rc.1`, built without publishing using
  verified Node 22 and the pinned encrypted Tool release. Static, manifest,
  checksum, secret-exclusion, and protected-boundary checks passed. Packaged
  testing then found a dev API URL embedded in the frontend bundle.
- Local Windows release candidate `1.5.0-rc.2` was built without publishing. It
  enforces the packaged local API URL and makes app-only uninstall the safe
  default; target-machine acceptance remains pending.

## Current Approved Plans

The completed documentation baseline refresh is tracked at
[plans/2026-10-05-documentation-baseline-refresh.md](plans/2026-10-05-documentation-baseline-refresh.md).

The completed source implementation and remaining packaged pilot for auth and
Dongil reliability are tracked at
[plans/2026-10-05-auth-dongil-cold-boot-reliability.md](plans/2026-10-05-auth-dongil-cold-boot-reliability.md).

The completed source implementation and remaining packaged acceptance for
revocable local sessions and runtime boundaries are tracked at
[plans/2026-10-06-local-auth-session-and-runtime-security.md](plans/2026-10-06-local-auth-session-and-runtime-security.md).

The completed local RC build and its packaged-pilot handoff are tracked at
[plans/2026-10-07-release-candidate-1.5.0-rc.1.md](plans/2026-10-07-release-candidate-1.5.0-rc.1.md).

The approved RC2 API/uninstall hotfix is tracked at
[plans/2026-10-08-rc2-local-api-and-safe-uninstall.md](plans/2026-10-08-rc2-local-api-and-safe-uninstall.md).

## Recommended Next Engineering Plan

The remaining release path is:

1. Obtain explicit Phase C approval and select the pilot workstation.
2. Back up and checksum the selected pilot workstation database/config before
   any packaged migration or installation.
3. Run the approved target-machine acceptance matrix for migration, remembered
   login/session revocation, install/update/rollback, dongle, camera, PLC, OCR,
   offline behavior, Dongil reconciliation, loopback binding, and secret-free
   diagnostics.
4. Update final evidence and close the two active plans only after packaged
   acceptance succeeds.

After release acceptance, separately inspect and seek approval to isolate demo
fallback behavior and then decompose oversized service/API modules. Do not mix
those refactors into the release candidate.

Each item is separate scope and requires inspection, plan, approval, implementation,
and verification. Do not combine them silently.

## Current Known Gaps

- Free-angle ROI editor versus 90-degree runtime crop normalization.
- No complete mutation audit pipeline.
- Packaged migration and target-machine acceptance for DB-backed session
  revocation/logout remain pending. JWT expiry is intentionally unset; login
  lockout and rate limiting are explicitly deferred.
- Device Tool binds beyond loopback and has no application authentication.
- The new CR/LF/BOM-aware runtime parser and legacy ProgramData backup path are
  implemented. Runtime Dongil settings are DB-only; packaged-machine parsing,
  backup, cold-boot, and downgrade behavior still require verification.
- Shared TypeScript contract workspace remains inactive.
- Packaged hardware and recovery behavior are not yet accepted for the current
  source candidate.

ROI remains outside the current approved work because its existing behavior was
explicitly kept stable. No Dongil Server source/API/database/business-flow,
Device Tool, protected license, or ROI change is allowed in the release path.

## Source Candidate Snapshot — 2026-10-07

- Branch: `remote`.
- Baseline commit: `149b944c7d1d7f29d00bb369cada1330cf72f829`
  (`Feat: Fixing Remembered Login`).
- Worktree is intentionally uncommitted and contains 19 paths: nine project
  documentation files, eight test files, and two production service files whose
  diffs are formatting-only. No changes are staged.
- Dependency manifests, Prisma schema, and migration files have no uncommitted
  diff. The additive `AuthSession` migration is already part of the baseline
  commit.
- `tool/`, protected license paths, `backend/src/dongil-sync/`, and ROI code have
  no worktree diff.
- `git diff --check`, conflict-marker inspection, and changed-file secret-pattern
  scanning passed. Git continues to report only the repository's existing
  LF-to-CRLF checkout warnings.
- The source/static/isolated verification evidence is recorded in the two active
  plans. Phase A did not run a build, installer, migration, seed, Electron, or
  hardware flow.

This snapshot is the input boundary for Phase B. Any later source, schema,
dependency, or contract change requires another candidate audit before build.

## Definition Of Done For Future Features

Applicable plans cover business rules, permission enforcement, error/loading/empty
states, data migration, audit, concurrency, idempotency, hardware behavior,
rollback, documentation, and explicit verification status.
