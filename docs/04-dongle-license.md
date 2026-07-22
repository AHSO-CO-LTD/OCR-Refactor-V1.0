# Dongle / License Security

## Login startup contract

The login startup flow has two independent paths:

1. API, license, and the physical USB dongle are checked first.
2. A valid remembered session may auto-login immediately after those checks. PLC and camera checks never gate this auto-login path.
3. If manual login is needed, the desktop app performs best-effort hardware preparation before showing the credential form: PLC connection, camera power, camera light, then camera connection with a real frame.
4. Missing PLC configuration, omitted PLC output addresses, or camera errors are displayed as skipped/unavailable and do not block manual login.

Dongle mock mode may still support explicit development login, but it is not accepted for remembered-session auto-login. Auto-login requires the real dongle result code `DONGLE_OK`.

## Purpose

The project uses a USB dongle mechanism to protect the desktop application.

The dongle is part of the local trust chain and is used to decide whether the application is allowed to run normally.

## Why It Belongs In The Desktop Layer

The dongle check should be placed in the desktop runtime layer, not in the browser UI.

Reasoning:

- browser UI should not access hardware directly
- desktop main process can start early and block the app before the UI is usable
- native integration is easier to manage in Electron main or a dedicated local helper

## Existing Legacy Pattern

The legacy Python application uses a retry-based dongle check similar to:

- set default key values
- call dongle SDK
- retry several times
- write logs for failures and successes
- return a boolean state

This behavior should be preserved conceptually in the new architecture.

## Recommended New Flow

1. Electron starts.
2. Dongle module checks the USB key.
3. If valid, app startup continues.
4. If invalid, the app is blocked or limited.
5. The app re-checks periodically while running.
6. If the dongle is removed, the app transitions to a protected state.

## Recommended Responsibilities

### Electron main

- load native dongle integration
- perform boot-time license check
- relay license state to renderer and backend

### NestJS backend

- receive license state if needed
- expose license status endpoints for UI
- log license failures or transitions

### Next.js frontend

- show license state
- block normal screens when unlicensed

## Security Notes

- avoid hard-coding secrets in frontend code
- keep dongle secrets in native/backend layer
- production builds should use the compiled `native/dongle-checker.exe` helper
  instead of shipping the plaintext Python helper
- keep `backend/scripts/check-dongle.py` for development/debug fallback only
- limit diagnostic exposure
- log failures without leaking implementation details

