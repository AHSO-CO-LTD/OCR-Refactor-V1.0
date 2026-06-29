# Runtime Flow

## Boot Flow

### 1. User launches the `.exe`

The desktop executable starts the Electron main process.

### 2. Electron performs environment checks

Electron should verify:

- single instance lock
- required local files exist
- dongle/license state
- backend startup readiness
- database connection readiness

### 3. Dongle/license validation

Before the full UI becomes available, the app checks the USB dongle.

If the dongle check fails:

- block normal app entry
- display a clear license error screen
- optionally allow limited diagnostics only

If the dongle check succeeds:

- continue startup
- launch or connect to local services
- open the main UI

### 4. Local backend startup

Electron starts or attaches to the local NestJS service.

NestJS then:

- connects to PostgreSQL
- loads app config
- prepares auth and permission rules
- exposes REST endpoints
- optionally opens websocket channels

### 5. UI load

Next.js renders the initial page:

- login screen if no session
- dashboard if a valid session exists
- role-aware menus and controls based on the session payload

## Login Flow

1. User enters username and password.
2. Frontend sends credentials to NestJS.
3. NestJS verifies:
   - user exists
   - active status
   - password hash
   - attempt lock rules
4. Backend resolves the effective permission list.
5. Backend returns session data.
6. Frontend stores minimal session state and renders the permitted UI.

## Operation Flow

Typical runtime sequence:

1. User chooses product or line profile.
2. User starts inspection.
3. Backend records a job/session.
4. Backend requests ROI OCR from the Python/FastAPI Device/OCR Tool in `tool/`.
5. Device/OCR Tool returns OCR/detection result.
6. NestJS validates result against product rules.
7. Result is persisted to PostgreSQL.
8. UI updates dashboard and history view.

## Exception Flow

If the operator needs to intervene:

- mark the exception
- adjust allowed runtime settings
- re-align ROI if permission is granted
- continue or stop the inspection job

All exception and override actions should be logged.

## Shutdown Flow

On exit or shutdown:

1. stop live inspection
2. close active sessions
3. flush pending logs
4. stop local services if the desktop policy requires it
5. shut down Electron

## Dongle Monitoring Flow

The dongle check should not be a one-time event only.

Recommended behavior:

- check on startup
- re-check periodically while the app is running
- if the dongle is removed, transition the app into a protected state

The protected state should be defined explicitly in the UI and backend.
