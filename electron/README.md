# Electron Desktop Shell

MVP desktop shell for the local OCR system.

Current responsibilities:

- enforce a single desktop instance
- connect to existing local services when their ports are already active
- start Device Tool, NestJS backend, and Next.js frontend when missing
- fall back to the next free Device Tool, backend, or frontend port when the default port is occupied or not healthy
- wait for service health checks before opening the renderer
- open a separate terminal window to stream service logs
- stop only child processes started by Electron
- expose a minimal context-isolated preload bridge

Run from the repository root:

```powershell
npm run dev:desktop
```

Default local services:

```text
Device Tool  http://127.0.0.1:8000
Backend      http://127.0.0.1:4000
Frontend     http://localhost:3000
```

Electron checks the Device Tool at `/tool/v1/health` and passes
`DEVICE_TOOL_API_PREFIX=/tool/v1` to the backend. Override the prefix only when
the Device Tool routes intentionally change.

Fallback ranges:

```text
Device Tool  8001-8099
Backend      4001-4099
Frontend     3001-3099
```

When Electron starts, it also opens an `OCR Terminal` window that shows
stdout/stderr from the Device Tool, backend, and frontend processes started by
Electron.

The Device Tool interpreter defaults to:

```text
tool/.venv/Scripts/python.exe, then py -3.9 on Windows when no tool venv exists
```

Override it when needed:

```powershell
$env:DEVICE_TOOL_PYTHON = "C:\Path\To\python.exe"
npm run dev:desktop
```

This is a development shell. Installer generation, bundled service artifacts,
database installation, dongle boot gating, and production recovery UI are not
implemented yet.
