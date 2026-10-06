# 0009 — Local revocable authentication sessions

Status: Accepted — implementation pending

## Context

The OCR desktop application currently issues stateless access JWTs. Explicit
logout revokes the remembered-login credential and clears renderer state, but a
copied access JWT remains valid because the local NestJS backend has no session
record to revoke. Role and account-state mutations also cannot invalidate an
already issued token consistently, and camera WebSocket upgrade checks only the
JWT signature.

The application is local-first and has no inactivity-timeout requirement. Its
Dongil integration is stable and must not require any source, API, WebSocket,
database, or business-flow change in the external Dongil Server.

## Alternatives

1. Keep stateless JWTs and rely only on renderer token deletion.
2. Add short-lived access tokens plus refresh-token rotation.
3. Maintain an in-memory token denylist in the backend process.
4. Add a local PostgreSQL `AuthSession` record and include its ID as `sid` in
   each access JWT.

## Decision

Use option 4.

- Password login and remembered-login restore create a local `AuthSession`.
- Access JWTs include the session ID as `sid`.
- HTTP guards verify both the JWT signature and the current local session/user
  state.
- Camera WebSocket authorization uses the same local session validity rule and
  periodically closes connections whose session becomes invalid.
- Logout uses a dedicated local endpoint/IPC flow that revokes the current
  session and remembered-login record before Electron and renderer cleanup.
- The existing disable-remembered-login operation remains separate because it
  is also used immediately after a successful login without opt-in.
- Role change and account deactivation revoke all local sessions for the user.
  Account deletion removes them through the user foreign-key cascade.
- Sessions have no inactivity timeout and no refresh-token architecture in this
  decision. They remain valid until logout, explicit revocation, invalid user
  state, or deletion.
- Account lockout and login rate limiting are explicitly deferred; no threshold
  is implied by this ADR.
- The external Dongil Server, Device Tool, protected license implementation,
  and ROI behavior are outside this decision and must not be modified.

## Rationale

A database-backed session provides deterministic revocation without introducing
refresh-token complexity into a single-workstation factory application. It
preserves the accepted remembered-login split between Electron `safeStorage`
and a database hash while allowing each newly issued access JWT to be checked
against current local account state.

This is entirely an OCR-side authentication concern. Dongil registration,
presence, outbox delivery, historical synchronization, and reconnect behavior
do not consume OCR user JWTs, so no Dongil Server change is required.

## Consequences

- A new additive local table, index, and user relation are required.
- Every authenticated HTTP request adds a local indexed session lookup.
- Camera WebSocket authorization becomes asynchronous and needs bounded
  periodic revalidation.
- Legacy JWTs without `sid` become invalid after upgrade. Remembered-login
  users can restore automatically; other users sign in again once.
- Logout and account-state mutations gain transactional revocation work.
- Revoked-session retention/cleanup can be planned separately if table growth
  becomes material; it is not part of this decision.
- No external Dongil Server deployment or compatibility coordination is needed.

