# Security

## Trust Boundaries

```text
User
  -> sandboxed Electron renderer
  -> restricted preload IPC
  -> local NestJS API with JWT authorization
  -> PostgreSQL and Device Tool
  -> optional Dongil Server over factory LAN
```

The application runs elevated, so Electron IPC, local service exposure, runtime
configuration, and update handling are privileged security boundaries.

## Authentication

- Passwords are stored as bcrypt hashes with cost 12.
- Login checks account activity and the physical or explicitly mocked dongle state.
- Remembered-session restore accepts only the real `DONGLE_OK` result.
- JWT payloads contain user ID, username, and role; current permission checks
  reload the user and effective permissions from PostgreSQL.
- Inactive or deleted users are rejected by guarded permission endpoints.

Current limitations:

- JWTs do not have a documented expiry or server-side revocation record.
- Logout clears application-owned browser storage but has no backend token revocation endpoint.
- Failed attempts are counted but do not currently enforce a lock threshold.
- Login rate limiting is not implemented.

## Authorization

- Backend `JwtAuthGuard` verifies bearer tokens.
- `PermissionsGuard` resolves current database permissions for protected actions.
- `dev` has the highest authority and bypasses ordinary permission checks.
- Non-dev administrators cannot view or manage protected `admin`/`dev` role permissions.
- Electron update and Dongil configuration actions revalidate an active `dev` or
  `admin` session through the backend.
- Electron-to-backend internal PLC and Dongil endpoints require a random
  per-process internal token.

Some authenticated endpoints intentionally have no fine-grained permission
decorator. Their business authorization must be reviewed whenever the endpoint
contract changes.

## Electron

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- Renderer sandboxing is enabled.
- Preload exposes explicit methods rather than raw `ipcRenderer`.
- Sensitive Dongil IPC handlers verify the sender is the main renderer.
- Main and terminal windows use the same restricted preload bridge.

Open external URL handling currently delegates renderer-requested URLs to the
operating system without an explicit allowlist. Any future external-link feature
must validate scheme and destination before opening it.

## Local Network Exposure

- Electron calls backend and Tool through loopback URLs.
- NestJS does not currently specify a loopback-only bind host.
- `tool/config.json` currently binds Device Tool to `0.0.0.0`.
- Device Tool camera and PLC endpoints do not implement application JWT authorization.

Windows Firewall or factory network isolation may reduce exposure, but those
controls are not represented in source. Production deployment must verify that
untrusted LAN clients cannot invoke privileged Device Tool operations.

## Secrets And Credentials

- Real `.env` files, ProgramData runtime files, support credentials, release
  runtime contents, and build artifacts are ignored by Git.
- Packaged configuration lives under `C:\ProgramData\AHSO OCR`.
- Machine registration credentials are stored by Electron, not exposed as normal UI data.
- Logs must not include passwords, JWTs, database passwords, machine credentials,
  private keys, or dongle secrets.
- Original license source and binaries are protected and must not be modified
  without explicit license-side approval.

## License Boundary

Electron and backend may call the existing license integration and document its
result. The following are protected implementation artifacts:

- `external/license-key/`
- `backend/native/System8.dll`
- compiled native dongle helper
- `backend/scripts/check-dongle.py`

Application documentation or integration changes must not alter those sources by default.

## Audit

`AuditLog` exists in Prisma, but the current user, permission, role, product,
PLC, and settings mutation paths do not provide complete audit writes. This is
an implementation gap, especially for privileged configuration and permission changes.

## Update Security

- Release automation downloads a pinned private Device Tool artifact and verifies its SHA-256.
- GitHub Release assets are the updater source.
- Update preparation backs up the database and configuration before applying.
- Recovery retains the previous installer and validates post-update startup.
- Database backup is checked for non-zero size; a persisted backup checksum is
  not currently part of the update-recovery record.

## Security Review Gate

Before production acceptance, verify:

- Tool and backend network binding/firewall policy.
- JWT expiry, logout, revocation, lockout, and rate limiting requirements.
- IPC sender validation and external URL allowlisting.
- Audit coverage for privileged changes.
- Update artifact trust and backup integrity on the target workstation.
- Error and log redaction under real failure conditions.
