# Agent Entry Point

Read this file before working in the repository.

## Required Reading

1. `PROJECT_PROFILE.md`
2. `docs/11-agent-onboarding.md`
3. `docs/03-business-rules.md`
4. the relevant architecture, API, database, security, PLC, Dongil, or release document
5. relevant accepted ADRs under `docs/adr/`

## Project Summary

This is a local-first industrial OCR inspection desktop application. Electron
is the elevated Windows entry point, Next.js is the renderer, NestJS owns
business and security rules, PostgreSQL is the durable store, and the read-only
Python Device Tool owns camera, OCR, Modbus TCP, and SLMP operations.

## Current Source Baseline

- Version metadata: `1.4.0`.
- Git branch used by this checkout: `remote`.
- Frontend dev port: `3970`.
- Backend dev port: `3980`.
- Device Tool port: `8668`.
- Primary viewport: 1280 x 1024 single-touchscreen Windows workstation.

## Non-negotiable Source Boundaries

- Never edit, format, generate, migrate, rename, or delete anything in `tool/`.
  It is a separate read-only submodule. Report Tool-side contract needs instead.
- Never modify original license code or binaries without explicit user approval
  for that exact license task. Protected examples include `external/license-key/`,
  `backend/native/System8.dll`, native dongle helpers, and
  `backend/scripts/check-dongle.py`.
- Frontend calls backend only. Backend calls Device Tool through `/tool/v1`.
- Preserve unrelated worktree changes and never commit or push automatically.

## Runtime Safety

- Check a port before starting a service.
- Reuse only a healthy intended service.
- Stop only processes started by the agent.
- After agent-run service checks, recheck touched ports; include legacy ports
  3000, 4000, and 8000 when OCR runtime work could affect them.
- Do not run migrations, seed, build, lint, typecheck, tests, Electron, installer,
  or hardware flows unless the user explicitly requests that verification.

## Security And Permissions

- Backend authorization is authoritative.
- `dev` is hidden from non-dev users.
- Only `dev` may view or manage protected `admin`/`dev` role permissions.
- `dev` and `admin` use sidebar navigation; operational roles use navbar navigation.
- Never log passwords, JWTs, database credentials, machine credentials, release tokens, or dongle secrets.
- Remembered-session restore requires a real dongle result.

## UI Rules

- English and Vietnamese are mandatory; Vietnamese text uses proper diacritics.
- Preserve the selected language through the i18n layer.
- Optimize operational and setup screens for 1280 x 1024 first.
- Use visible touch-friendly controls and virtual-keyboard-compatible inputs.
- Keep header/sidebar/navbar fixed; only the active content pane scrolls.
- Avoid page-level horizontal overflow; wide tables scroll inside their container.
- Use custom confirmation UI, not browser `alert`, `confirm`, or `prompt`.
- Keep non-critical explanation out of compact headers, cards, navbars, and menus; use tooltips where appropriate.

## Current Functional Areas

- Auth, users, roles, permissions, first-run admin setup, and dongle status.
- Unified product, AI, ROI, camera, camera identity, and diagnostics configuration.
- Line operation, Line Test, PLC runtime, DEV simulator, reports, and result saving.
- Dongil registration, status, outbox delivery, and historical synchronization.
- Electron startup, watchdog, shutdown, installer, updater, and rollback recovery.

Do not rely on old status text that describes these areas as unimplemented.

## Known High-risk Gaps

- Free-angle ROI display and the runtime crop path are not fully equivalent;
  Device Tool accepts only 90-degree crop rotation increments.
- JWT expiry/revocation, login rate limiting, lockout enforcement, and complete audit writes are not implemented.
- Device Tool currently binds to all interfaces and has no application JWT layer.
- Electron `.env` parsing does not handle CR-only line endings.
- Core service and frontend API files have grown large and need separately approved refactoring.

## Task Workflow

For meaningful work:

```text
understand -> inspect -> challenge -> clarify -> restate -> plan -> approval -> implement -> report
```

Medium and Large changes require approval before implementation. Large approved
plans are saved under `docs/plans/` and tracked during execution. Do not silently
expand scope or fix unrelated technical debt.

Completion reports distinguish completed work, incomplete work, checks not run,
and remaining risks.
