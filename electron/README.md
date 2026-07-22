# Electron Desktop Shell

MVP desktop shell for the local OCR system.

Current responsibilities:

- require administrator privileges on Windows through the UAC prompt
- enforce a single desktop instance
- connect to existing local services when their ports are already active
- start Device Tool, NestJS backend, and Next.js frontend when missing
- run the backend without Nest watch mode so runtime restarts do not trigger
  Windows `taskkill` failures from the Nest CLI watcher
- fall back to the next free backend or frontend port when the default port is occupied or not healthy
- wait for service health checks before opening the renderer
- keep service logs in a background buffer and open the terminal window only on demand
- stop only child processes started by Electron
- expose a minimal context-isolated preload bridge

Run from the repository root:

```powershell
npm run dev:desktop
```

Packaged Windows builds require administrator privileges. The development
launcher skips the UAC relaunch by default so `npm run dev:desktop` can be
started and stopped from a normal terminal. Set
`AHSO_ELECTRON_SKIP_ADMIN_RELAUNCH=0` before launching Electron manually if a
dev session must test the UAC path.

Default local services:

```text
Device Tool  http://127.0.0.1:8668
Backend      http://127.0.0.1:3979
Frontend     http://localhost:3969
```

Electron checks the Device Tool at `/` and passes
`DEVICE_TOOL_API_PREFIX=/tool/v1` to the backend. Override the prefix only when
the Device Tool routes intentionally change.

Fallback ranges:

```text
Backend      3980-4078
Frontend     3970-4068
```

Device Tool port fallback is intentionally disabled because the Tool owns its
server port through `tool/config.json`. Keep Tool source changes separate from
Electron/backend runtime changes.

Electron keeps stdout/stderr from the Device Tool, backend, and frontend in a
background log buffer. It does not open the `OCR Terminal` window at startup.
Open it from the dev Settings terminal tab, or press `F12` five times while the
app window is focused.

The Device Tool interpreter defaults to:

```text
tool/.venv/Scripts/python.exe, then py -3.11 on Windows when no tool venv exists,
then uv run --python 3.11 when Python Launcher cannot resolve 3.11
```

Override it when needed:

```powershell
$env:DEVICE_TOOL_PYTHON = "C:\Path\To\python.exe"
npm run dev:desktop
```

This is a development shell. Installer generation, bundled service artifacts,
database installation, dongle boot gating, and production recovery UI are not
implemented yet.
