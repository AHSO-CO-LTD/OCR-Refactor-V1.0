# 0008 — Secure machine-bound remembered login for all roles

Status: Accepted — source-runtime cold boot accepted; packaged verification pending

## Context

The renderer currently persists an access JWT and user snapshot in browser
local storage when Remember login is selected. Browser storage is tied to the
frontend origin and can become unavailable when the packaged frontend uses a
different fallback port. Current error handling can also clear the persistent
session after a transient backend, startup, or dongle-check failure.

Remembered login must survive normal application restart, Windows restart, and
cold boot without storing a password. The approved business rule allows every
role (`dev`, `admin`, `engineer`, and `operator`) to opt in. Because privileged
roles are included, a persisted access JWT or raw database token is not an
acceptable long-lived credential.

## Alternatives

1. Continue storing the access JWT in renderer local storage.
2. Store a raw access or refresh token in PostgreSQL.
3. Store only a remembered user ID and trust machine identity plus dongle.
4. Store a high-entropy opaque remember token in Electron Windows
   `safeStorage` and only its hash and binding metadata in PostgreSQL.

## Decision

Use option 4.

- All active roles may enable remembered login.
- Electron generates or receives a cryptographically random token of at least
  256 bits and persists only its Windows-protected encrypted form under the
  application user-data directory.
- The encrypted file ACL grants full control only to the current Windows user
  SID, local Administrators and SYSTEM. Using the explicit current-user SID is
  required because development Electron intentionally skips elevation while
  Windows `safeStorage` remains bound to that user profile.
- PostgreSQL stores only the token hash, user ID, machine ID, role at enablement,
  enable time, and last successful restore time.
- The renderer never receives or persists the raw remember token.
- Restore requires the per-process desktop internal token, the protected local
  remember token, the current machine identity, and a real physical dongle
  result. Dongle mock mode is rejected.
- Backend restore reloads the active user, current role, and effective
  permissions from PostgreSQL, then issues a fresh access JWT for the current
  runtime session.
- A role change revokes remembered login even though the new role is also
  eligible. The user must authenticate with a password and opt in again.
- Logout, successful login without Remember login, account deactivation,
  account deletion, and password reset revoke the remembered credential.
- Application exit, Windows shutdown, network interruption, backend startup
  delay, and recoverable dongle-check errors do not revoke it.
- Access JWTs are current-session state and are not the durable remember
  credential.

## Rationale

Splitting the credential between Windows protected storage and a database hash
prevents a database read from yielding a directly reusable login credential.
Machine and dongle binding limits reuse outside the intended workstation. A
fresh JWT on every restore ensures current account state and permissions are
applied instead of trusting a stale authorization snapshot.

## Failure handling

- If no token or database row exists, the application opens the normal login
  form without presenting an error.
- If secure storage is unavailable, manual login remains available and the
  remember option is disabled with a clear message.
- If database enablement succeeds but secure local persistence fails, Electron
  performs a compensating revoke. A hash without the raw token cannot restore a
  session.
- Legacy `.tmp`/`.bak` artifacts whose old ACL omitted the current user are
  repaired to the approved ACL before application-owned cleanup or replacement.
- Transient startup failures preserve both sides of the remembered credential.
- A definitive token, machine, role, or account mismatch revokes the credential
  and requires manual login.

## Consequences

- Electron needs restricted typed IPC for enable, restore, and disable actions.
- The backend needs an additive `RememberedLogin` model, internal endpoints,
  transaction-aware revocation hooks, and audit events.
- User role, active-state, deletion, and password-reset mutations must inspect
  remembered-login impact.
- Logout becomes an ordered server revoke, local secure-token cleanup, and
  application-session cleanup flow.
- Users must manually sign in and opt in once after upgrading from the legacy
  local-storage implementation.
- Cold boot, role-change, revocation, safe-storage failure, and transient-error
  behavior require explicit verification on a target Windows workstation.
