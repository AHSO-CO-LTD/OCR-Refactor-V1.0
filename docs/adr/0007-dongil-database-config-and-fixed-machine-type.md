# 0007 — Database-authoritative Dongil configuration and fixed washing type

Status: Accepted — implementation complete; verification pending

## Context

The OCR Metal Core Washing desktop currently obtains Dongil configuration from
multiple locations: ProgramData `.env`, Electron `process.env`, PostgreSQL,
Electron credential storage, runtime memory, and the Dongil Server assignment.
The settings UI can show a PostgreSQL URL while Electron connection actions read
a blank or different environment value. A CR-only environment file has also
caused `WASHING_MACHINE` to be concatenated with the next setting.

This application is a washing-machine client. Its local machine type is not a
deployment choice, although Dongil Server itself supports multiple machine
types.

## Alternatives

1. Keep ProgramData `.env` authoritative and continuously mirror PostgreSQL.
2. Dual-write `.env` and PostgreSQL and resolve conflicts during startup.
3. Make PostgreSQL authoritative for the Dongil URL, keep the machine
   credential in Electron `safeStorage`, and compile the local type as
   `WASHING_MACHINE`.

## Decision

Use option 3.

- PostgreSQL `DongilSyncConfiguration` is the durable operational authority for
  the Dongil Server URL and non-secret registration state.
- Electron `safeStorage` remains the authority for the secret machine
  credential.
- The OCR client uses one shared constant, `WASHING_MACHINE`, for registration,
  bootstrap, WebSocket hello, heartbeat, outbox delivery, and diagnostics.
- `DONGIL_SERVER_URL` and `DONGIL_MACHINE_TYPE_CODE` become legacy migration
  inputs and are not runtime authorities in the new implementation.
- An existing valid database URL takes precedence during migration. A valid
  legacy URL is imported only when the database configuration is absent.
- Server-assigned type remains authoritative on Dongil Server. A server
  assignment other than `WASHING_MACHINE` is a blocking mismatch; the client
  does not automatically modify the server assignment.
- Reset preserves the singleton configuration-version marker while clearing the
  configured URL, registration state, assignment cache, auto-connect state, and
  Electron credential according to the approved reset contract.
- Production inspection data, live outbox records, historical snapshots, and
  synchronization evidence are not deleted by configuration migration or reset.

## Rationale

One durable configuration authority removes the split-brain state where the UI
and Electron disagree. A compiled client type removes a deployment input that
has no valid variability in this product. Keeping credentials in Windows
protected storage avoids placing reusable machine secrets in PostgreSQL or the
renderer.

## Compatibility and migration

- The first release uses an additive Prisma migration and a versioned singleton
  configuration row.
- ProgramData `.env` is backed up before normalization or legacy import.
- The new application ignores legacy Dongil URL/type keys after migration.
- Downgrade recovery restores a compatible environment backup before starting
  an older application version.
- A post-upgrade URL change may differ from the pre-upgrade environment backup;
  downgrade recovery must surface that difference instead of silently choosing.

## Consequences

- Electron connection actions must request the current configuration from the
  backend instead of reading `process.env`.
- Configuration save/reset paths require backend authorization and audit.
- Startup and installer code must distinguish legacy import from normal runtime
  configuration.
- Machine-type mismatch becomes visible and blocking, which may expose existing
  server assignment errors during rollout.
- Target-machine migration, cold boot, ACL, rollback, and connected-server
  behavior require explicit pilot verification.
