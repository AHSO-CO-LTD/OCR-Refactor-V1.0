# Documentation baseline refresh

Status: Done

## Objective

Bring the repository documentation into alignment with the current `v1.4.0`
source tree and make it possible for a new developer or agent to understand the
local factory application without relying on stale scaffold text or old status
snapshots.

## Approved scope

- Create `PROJECT_PROFILE.md` as the concise project source of truth.
- Add durable database, security, development, logging, and architecture-decision documentation.
- Update root, workspace, architecture, runtime, business, API, frontend, PLC,
  Dongil, installer, updater, and onboarding documentation.
- Mark historical plans accurately without erasing their history.
- Align documented routes, ports, permissions, schema, and runtime behavior with
  the current checkout.
- Validate internal Markdown references, UTF-8 text, scope boundaries, and Git whitespace.

## Protected boundaries

- Do not modify anything in `tool/`; it is a read-only submodule.
- Do not modify original license code or binaries, including
  `external/license-key/`, `backend/native/System8.dll`, native dongle helpers,
  or the development fallback dongle script.
- Do not change application source, database schema, migrations, dependencies,
  release artifacts, or runtime configuration.
- Do not run services, build, lint, typecheck, tests, migrations, or hardware checks.

## Work items

- Done — establish the current documentation map and central project profile.
- Done — add database, security, development, logging, and ADR documents.
- Done — refresh root and workspace README files.
- Done — refresh numbered architecture, runtime, business, API, UI, Dongil,
  PLC, and release documents.
- Done — update historical-plan status and cross-references.
- Done — run documentation-only verification for links, encoding, whitespace,
  changed-file scope, and protected paths. Runtime verification remains explicitly
  out of scope.

## Documentation principles

- Source and migrations are authoritative for implemented behavior.
- Documentation must distinguish implemented, historically verified, and currently unverified behavior.
- Hardware presence, successful builds, and published artifacts are not inferred from source.
- English technical identifiers remain unchanged; Vietnamese text must use proper diacritics.
- Existing paths are preserved where practical to avoid breaking links.

## Definition of Done

- The central profile accurately describes the current stack and boundaries.
- No active document claims that implemented Electron, PLC, reporting, installer,
  updater, or Dongil features are not started.
- Current routes, permissions, ports, schema domains, and package commands are documented.
- Security and operational gaps are explicitly identified rather than silently presented as complete.
- Tool and original license sources remain untouched.
- Documentation-only checks complete without unresolved broken local links or whitespace errors.
