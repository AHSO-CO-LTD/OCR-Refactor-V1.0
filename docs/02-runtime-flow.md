# Runtime Flow

## Packaged Startup

1. User launches the installed application.
2. Electron requests Administrator if the process is not elevated.
3. Electron acquires the single-instance lock and loads ProgramData `.env`.
4. Electron starts or reuses Device Tool and backend.
5. Backend database migration deployment completes before backend readiness.
6. Electron starts or reuses the frontend.
7. Electron checks setup state and physical dongle license while preparing PLC and camera hardware.
8. License failure blocks entry and cleans up partially prepared hardware.
9. PLC or camera preparation failure produces a startup warning rather than hiding manual diagnostics.
10. Electron opens `/setup` when no active admin exists; otherwise it opens `/login`.

## Login And Restore

- Manual login checks dongle, user activity, and bcrypt password.
- Backend returns a JWT and current effective permissions.
- A remembered session is restored only after the real `DONGLE_OK` result.
- Dongle mock mode can support explicit development login but cannot restore a remembered session.
- Current frontend stores temporary sessions in `sessionStorage` and remembered sessions in application-owned `localStorage` keys.

## Line Operation

1. Select an active product profile.
2. Backend creates or restores the product inspection session.
3. Machine runtime enters its current stopped, starting, running, paused, or recovery state.
4. Camera readiness loads the configured identity, frame settings, model, and ROI.
5. Manual or valid PLC capture obtains a completed OCR result.
6. Backend matches recognized rows against product rules.
7. A known aggregate result may be latched and persisted.
8. PLC result output is emitted only for an eligible PLC-driven production capture.
9. Dongil aggregate data is queued locally after the production result is durable.

`UNKNOWN` is never treated as an eligible production latch.

## Machine Controls

- Manual/Auto, live camera, and realtime AI are independent controls.
- Manual Grab never sends a PLC result pulse.
- With realtime AI disabled, capture may preserve a frame but cannot invent an inspection result.
- PLC connection failure does not block manual camera/OCR diagnosis.
- Configured inactivity may pause capture until explicit resume.
- PLC stop follows configured delay and optional camera-power behavior.

## Dongil Runtime

- Electron derives local machine identity after a valid dongle check.
- Registration is requested explicitly and must be approved by Dongil Server.
- Heartbeat runs independently of result delivery.
- Live results are delivered from a durable outbox.
- Historical synchronization uses a persistent snapshot and resumes after restart.
- Local production is never rolled back because Dongil is offline.

## Shutdown

Default app-and-hardware shutdown:

1. End the active Line session when possible.
2. Disconnect camera/OCR.
3. Turn off configured camera outputs after safe delay.
4. Clear remaining PLC outputs and disconnect PLC.
5. Send Dongil shutdown notification.
6. Stop only Electron-owned services.
7. Quit Electron.

If hardware cleanup fails, the application reports the incomplete stage and
continues closing rather than hanging indefinitely.

## Update Flow

1. Authorized admin/dev checks for an update.
2. User separately confirms download and installation.
3. Electron creates configuration and PostgreSQL recovery checkpoints.
4. Owned services stop and the NSIS updater runs.
5. New version startup begins validation.
6. Successful startup marks the update healthy; failure can restore the checkpoint and prior installer.
