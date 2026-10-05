# Logging And Diagnostics

## Current Sources

| Source | Current behavior |
| --- | --- |
| Electron | Buffers stdout/stderr from managed services and writes update logs through `electron-log` |
| Startup UI | Displays stage status and can export a startup diagnostic log |
| Terminal window | Shows buffered frontend, backend, and Tool process output on demand |
| NestJS | Uses Nest `Logger` and process output for runtime diagnostics |
| License | Persists check results to `LicenseLog` when requested by authenticated flows |
| Dongil | Persists outbox status, attempts, error codes, delivery disposition, verification, and history-run checkpoints |
| Installer | Writes preflight, bootstrap, uninstall, and status artifacts under ProgramData |

## Diagnostic Entry Points

- Electron startup screen: service, database, license, PLC, camera, and signal stages.
- F12 five times or DEV settings: local terminal window.
- Swagger: backend API contract at `/api/docs` while backend is running.
- Camera diagnostics: Configuration diagnostics tab for authorized users.
- PLC status and DEV simulator: backend-authorized runtime diagnostics.
- Dongil settings and Processing UI: registration, heartbeat, outbox, and history state.
- Update settings: check, download, install, progress, exported log, and recovery notice.

## Sensitive Data Rules

Never log:

- plaintext passwords or password hashes;
- JWTs or authorization headers;
- database passwords or full `DATABASE_URL` values;
- Dongil machine credentials;
- Tool release tokens;
- private keys or dongle secrets.

When exporting logs, retain operational state, timestamps, error codes, and
service names while redacting credentials and user-entered secrets.

## Current Gaps

- Application logs do not yet use one normalized structured envelope or correlation ID.
- There is no documented six-month rotation and cleanup implementation across all log categories.
- `AuditLog` schema exists but is not consistently written by mutation services.
- Runtime log-level persistence and an in-app searchable structured log viewer are not implemented.
- Tool logging is owned by the read-only Tool project and must not be changed from this repository task.

## Troubleshooting Order

1. Identify whether failure belongs to Electron startup, backend, database,
   Device Tool, camera, PLC, dongle, Dongil, installer, or updater.
2. Record the exact timestamp and machine-local context.
3. Check the owning component log rather than inferring from a wrapper error.
4. For packaged backend startup errors, verify generated Prisma Client freshness
   and migration state before editing schema or business code.
5. For Dongil failures, correlate stable local result ID, batch ID, run ID, and server response.
6. For one-machine failures, inspect ProgramData runtime configuration and file
   encoding before assuming a shared source defect.

## Retention Direction

The project standard targets six months of rotated operational logs, but the
implementation is incomplete. Any future retention task must distinguish app,
backend, database, updater, installer, preflight, crash, and audit logs and must
not remove database backups or business records.
