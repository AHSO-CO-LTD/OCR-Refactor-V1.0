# 0006 — NSIS installer and update recovery

Status: Accepted — documents the current implementation

## Context

The application requires an elevated per-machine Windows installation, local
runtime provisioning, database preservation, and recovery from failed updates.

## Alternatives

- Portable folder distribution.
- Uninstall and reinstall for every update.
- NSIS installation with staged update and rollback checkpoint.

## Decision

Use electron-builder NSIS for x64 per-machine installation. Use GitHub Releases
for trusted application artifacts. Before update installation, back up runtime
configuration and PostgreSQL, retain the previous installer, stop owned services,
and validate the new startup before marking it healthy.

## Rationale

The design supports controlled elevation, first-run setup, preserved local data,
and recovery without treating the factory workstation as a cloud client.

## Consequences

- Setup must distinguish pre-existing and installer-owned frameworks.
- Database replacement requires explicit confirmation and recovery protection.
- Update failure must preserve ProgramData and restore the prior application state.
- Installer, migration, rollback, and hardware behavior require target-machine acceptance.
