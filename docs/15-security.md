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
- Remembered restore accepts only real `DONGLE_OK`, validates machine binding,
  compares an opaque token hash, reloads account state/permissions, and issues a
  fresh JWT. Raw remember tokens exist only in Electron Windows `safeStorage`.
- The local encrypted remember file ACL is limited to the current Windows user
  SID, local Administrators and SYSTEM. Electron can repair and remove stale
  application-owned `.tmp`/`.bak` files created by the earlier admin-only ACL.
- JWT payloads contain user ID, username, role and local session `sid`; guards
  require the corresponding `AuthSession` to remain active and reload current
  user state from PostgreSQL.
- Inactive, deleted or revoked sessions are rejected by guarded HTTP endpoints
  and camera WebSocket authorization.

Current limitations:

- JWT expiry is intentionally unset under the accepted no-inactivity-timeout
  policy; validity is controlled by the local session record instead.
- Source now implements server-side logout revocation through JWT plus the
  per-process desktop token before Electron deletes its encrypted file and the
  renderer session. Migration/source/package verification remains pending.
- Failed attempts are counted but do not currently enforce a lock threshold.
- Login rate limiting is not implemented.

The approved next security plan is documented in
[plans/2026-10-06-local-auth-session-and-runtime-security.md](plans/2026-10-06-local-auth-session-and-runtime-security.md)
and ADR 0009. It introduces revocable sessions only in the OCR-local backend and
database; source implementation is complete but verification is pending. It
must not change the external Dongil Server. Account lockout and
login rate limiting are explicitly deferred; the rejected five-attempt,
60-second policy must not be implemented or silently replaced.

## Authorization

- Backend `JwtAuthGuard` verifies bearer tokens.
- `PermissionsGuard` resolves current database permissions for protected actions.
- `dev` has the highest authority and bypasses ordinary permission checks.
- Non-dev administrators cannot view or manage protected `admin`/`dev` role permissions.
- Electron update and Dongil configuration actions revalidate an active `dev` or
  `admin` session through the backend.
- Electron-to-backend internal PLC and Dongil endpoints require a random
  per-process internal token.
- Remembered-login enable/disable requires both bearer JWT and the internal
  token; restore requires the internal token plus Electron-held opaque token and
  machine identity.

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

Renderer-requested new windows are denied. No current product feature needs
`shell.openExternal`; any future external-link feature requires an explicit
scheme and destination allowlist before opening it.

## Local Network Exposure

- Electron calls backend and Tool through loopback URLs.
- NestJS source binds explicitly to `127.0.0.1`; runtime/package verification is
  still pending.
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
- Remember token hashes are stored in PostgreSQL; raw tokens and long-lived JWTs
  are not stored there or in renderer localStorage.
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

`AuditLog` records session creation/revocation, remembered-login
enable/disable/restore/rejection, user create/update/delete, role permission
replacement, Dongil configuration migration/update/reset, reconnect, and
history start. Product, PLC and other settings paths still do not provide
complete audit coverage.

## Update Security

- Release automation downloads a pinned private Device Tool artifact and verifies its SHA-256.
- GitHub Release assets are the updater source.
- Update preparation backs up the database and configuration before applying.
- Recovery retains the previous installer and validates post-update startup.
- Database backup is checked for non-zero size; a persisted backup checksum is
  not currently part of the update-recovery record.

## Security Review Gate

Before production acceptance, verify:

- Tool firewall policy and packaged backend loopback binding.
- Local session migration, logout/revocation, and the explicitly deferred
  lockout/rate-limiting requirements.
- IPC sender validation and external URL allowlisting.
- Audit coverage for privileged changes.
- Update artifact trust and backup integrity on the target workstation.
- Error and log redaction under real failure conditions.
