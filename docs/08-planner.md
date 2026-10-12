# Current Planner

Last source review: 2026-10-09

## Delivered

- Repository, backend, database, frontend and permission foundation.
- Product, camera identity, camera, AI, OCR variant and ROI configuration.
- Line operation, Line Test, PLC runtime, DEV simulator, history reports and exports.
- Electron startup, license gate, service watchdog, shutdown, installer, updater and recovery.
- Dongil registration, presence, live outbox, machine information and historical reconciliation.
- DB-authoritative Dongil configuration, fixed `WASHING_MACHINE` type, staged
  connection diagnostics, operator connection/history permissions and durable
  recovery after temporary LAN loss.
- Secure remembered login for all roles using Electron `safeStorage`, a
  PostgreSQL token hash, real-dongle restore and current-session JWT storage.
- OCR-local revocable sessions using PostgreSQL `AuthSession` and JWT `sid`,
  dedicated logout, account-state revocation, camera WebSocket validation,
  backend loopback binding and denied renderer-created windows.
- Static, targeted, isolated 49-migration and source-runtime verification
  recorded in the approved plans.
- Local Windows RC1 build, diagnosis of its embedded dev API URL, and replacement
  RC2 build with production URL guard and safe app-only uninstall defaults.
- User-reported installed-RC2 acceptance on 2026-10-09 for local API/login,
  remembered login across repeated restart/cold boot, in-app restart, default
  uninstall preservation, PLC, camera and Dongil operation.

The installed acceptance is a user report, not agent-captured evidence. It does
not imply that every update/rollback, downgrade, representative-data migration,
session revocation/WebSocket or hardware failure case was separately exercised.

## Current Approved And Historical Plans

- [Documentation baseline refresh](plans/2026-10-05-documentation-baseline-refresh.md): done.
- [Auth, Dongil and cold-boot reliability](plans/2026-10-05-auth-dongil-cold-boot-reliability.md): source and installed RC2 operation accepted by user report; detailed residual gates remain documented.
- [Local auth session and runtime security](plans/2026-10-06-local-auth-session-and-runtime-security.md): source/isolated verification complete; installed core flow accepted by user report.
- [RC1 release candidate](plans/2026-10-07-release-candidate-1.5.0-rc.1.md): historical invalidated candidate because of the embedded dev API URL.
- [RC2 API and safe uninstall](plans/2026-10-08-rc2-local-api-and-safe-uninstall.md): done, including user-reported packaged acceptance.
- [Documentation progress refresh](plans/2026-10-09-documentation-progress-refresh.md): current documentation audit.

## Next Release Path

1. Publish the approved stable `v1.5.0` release and verify its updater assets.
2. If promoting to final, align all workspace, lockfile, Swagger and release
   metadata before creating the release commit.
3. Recheck Git status, protected boundaries, version consistency, artifact
   policy and release workflow inputs.
4. Commit and push the approved documentation/version changes only when
   explicitly requested.
5. Push the corresponding immutable tag and let `Windows Setup` build the
   installer with the pinned private Tool artifact.
6. Verify the workflow, GitHub Release metadata, installer/blockmap/latest.yml,
   checksums and download availability.
7. Preserve RC2 acceptance notes and record any final-version delta; if the
   final build differs materially, repeat the affected acceptance cases.

No `v1.5.0*` tag or GitHub Release exists at this review point. The latest
published release remains `v1.4.0`.

## Residual Risks And Deferred Work

- Free-angle ROI editor versus 90-degree runtime crop normalization. ROI remains
  outside current scope because the user explicitly asked not to change it.
- No complete mutation audit pipeline.
- JWT expiry remains intentionally unset; login lockout and rate limiting are
  explicitly deferred. Do not introduce the rejected five-attempt/60-second policy.
- Detailed packaged evidence is still absent for role/deactivation revocation,
  active camera WebSocket closure, update rollback, downgrade env recovery and
  migration against representative production data.
- Device Tool binds beyond loopback and has no application authentication.
- Shared TypeScript contract workspace remains inactive.
- Core service and frontend API files remain large and require a separately
  approved behavior-preserving refactor.
- A restart/service-cleanup race was previously identified during investigation.
  The user reported the installed RC2 restart flow working, but no source fix or
  isolated stress evidence was recorded for that race.

No Dongil Server source/API/database/business-flow, Device Tool, protected
license or ROI change is allowed in the release path.

## Current Source Snapshot — 2026-10-09

- Branch: `remote`.
- HEAD and `origin/remote`:
  `e152c9d4c5fe203c94682279b1fa9ab7cf9c6620` (`Fix Auto login`).
- Workspace, lockfile and Swagger version: `1.5.0`.
- Prisma migration directories: 49.
- Worktree was clean before this documentation refresh.
- Latest local tag and GitHub Release: `v1.4.0`; no `v1.5.0*` remote tag.
- RC2 local installer SHA-256:
  `EFEB014AA300844710FD58E83AD782CC0880BB0962E68C40BFA9E33A7149F73C`.
- `tool/` and protected license boundaries remain outside documentation edits.

## Definition Of Done For Future Features

Applicable plans cover business rules, permission enforcement,
error/loading/empty states, data migration, audit, concurrency, idempotency,
hardware behavior, rollback, documentation and explicit verification status.
