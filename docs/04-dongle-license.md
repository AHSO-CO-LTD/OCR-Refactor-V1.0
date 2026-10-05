# Dongle And License

## Boundary

This document describes application integration only. Original license source,
`System8.dll`, compiled license helpers, and the fallback Python dongle script
are protected and are not modified by ordinary application work.

## Current Integration

- Backend `DongleCheckerService` invokes the native helper when available.
- Development may use the Python helper only outside production or when explicitly allowed.
- The helper receives the configured DLL path, retry count, retry interval, and timeout.
- Backend normalizes the result into `DONGLE_OK`, mock, missing DLL/helper, return-code, or execution-error states.
- Persisted checks create `LicenseLog` records without storing dongle secrets.

## Startup Contract

- Electron starts required local services before calling backend license status.
- License and physical dongle failure block application entry.
- Startup hardware preparation may run concurrently but is cleaned up if licensing blocks startup.
- Machine identity is derived only after the physical license succeeds.

## Login Contract

- Manual login requires the ordinary license gate.
- Development dongle mock mode may pass manual login.
- Remembered-session restore requires physical `DONGLE_OK`; mock mode is rejected.
- Authenticated license status can be refreshed through backend.

## Configuration

Relevant backend environment keys include:

- `DONGLE_MOCK_MODE`
- `DONGLE_DLL_PATH`
- `DONGLE_HELPER_PATH`
- `DONGLE_ALLOW_PYTHON_HELPER`
- `DONGLE_PYTHON_COMMAND`
- `DONGLE_RETRY_COUNT`
- `DONGLE_RETRY_INTERVAL_MS`
- `DONGLE_CHECK_TIMEOUT_MS`

Never commit real secrets or machine-specific protected values.

## Current Limitations

- Periodic full-runtime dongle removal protection is not documented as a complete production acceptance result.
- Source and historical release evidence do not prove behavior with the target physical dongle.
- Dongle error messages must remain useful without exposing key material or SDK internals.

## Acceptance

Validate on the target PC:

- valid, absent, removed, reinserted, and SDK-error states;
- retry and timeout behavior;
- remembered-session rejection under mock mode;
- Electron blocked-startup recovery and hardware cleanup;
- license logging without secret disclosure.
