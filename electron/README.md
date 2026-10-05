# Electron desktop workspace

Electron 39 is the Windows entry point for the packaged AHSO OCR station. It is
already implemented; this workspace is not a future placeholder.

## Responsibilities

- Require Administrator privileges in packaged Windows builds.
- Enforce a single application instance.
- Render the startup/preflight UI before the login screen.
- Check the dongle/license and prepare PLC/camera startup stages.
- Reuse healthy local services or start the packaged Device Tool, backend and
  frontend runtime.
- Select healthy backend/frontend ports without taking a port already owned by
  another process.
- Keep child-service logs and expose the restricted preload bridge.
- Coordinate graceful shutdown, PLC output cleanup and child-process cleanup.
- Check and apply GitHub Releases updates with staged recovery/rollback data.
- Bootstrap and maintain Dongil machine identity/credential state without
  exposing the credential to the renderer.

Electron stops only child processes it started. It must not terminate an
unrelated service already listening on a candidate port.

## Development

Run from the repository root:

```powershell
npm run dev:desktop
```

The development launcher normally skips UAC relaunch. To exercise the Windows
elevation path explicitly:

```powershell
$env:AHSO_ELECTRON_SKIP_ADMIN_RELAUNCH = "0"
npm run dev:desktop
```

Current development defaults are:

```text
Device Tool  http://127.0.0.1:8668
Backend      http://127.0.0.1:3980
Frontend     http://localhost:3970
```

The Device Tool port is not dynamically reassigned because the Tool owns its
server configuration. Backend/frontend candidate-port behavior is controlled
by the desktop service manager and environment configuration.

## Build and packaging

```powershell
npm run build -w @ocr/electron
npm run release:win
```

`release:win` prepares `release-runtime` and builds a per-machine x64 NSIS
installer. It is not a portable Electron-only package. Read
[`../docs/12-release-setup.md`](../docs/12-release-setup.md) before release
work.

## Security and protected sources

- `contextIsolation` remains enabled and Node integration remains disabled for
  renderer content.
- Add only explicit, validated preload/IPC operations.
- Do not modify original license code or binaries in `external/license-key/`,
  `backend/native/System8.dll`, the native helper or
  `backend/scripts/check-dongle.py`.
- Integration code under `electron/src/license/` may consume the protected
  license boundary without rewriting it.
- Do not modify `tool/`.

See [`../docs/04-dongle-license.md`](../docs/04-dongle-license.md),
[`../docs/15-security.md`](../docs/15-security.md), and
[`../docs/17-logging-and-diagnostics.md`](../docs/17-logging-and-diagnostics.md).
