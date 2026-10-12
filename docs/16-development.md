# Development

## Prerequisites

- Windows PowerShell.
- Node.js 22 or newer and npm.
- PostgreSQL 14 or newer.
- Python 3.11 environment for the development Device Tool.
- Access to the private source repository and, for release work, the private Tool release.

## Repository Setup

```powershell
npm ci
npm run prisma:generate -w @ocr/backend
```

Configure `backend/.env` and `frontend/.env` from their example files. Never
commit real database URLs, JWT secrets, machine credentials, or dongle secrets.

## Development Ports

| Service | Current default | Health or entry point |
| --- | ---: | --- |
| Frontend | 3970 | `/login` |
| Backend | 3980 | `/api/health` |
| Device Tool | 8668 | `/` and `/tool/v1` |

Before starting a service, inspect the exact target port. Never terminate or
replace a user-owned process. Agent-started services must be stopped after validation.

## Commands

```powershell
npm run dev -w @ocr/backend
npm run dev -w @ocr/frontend
npm run dev:desktop
```

Database commands:

```powershell
npm run prisma:generate -w @ocr/backend
npm run prisma:migrate -w @ocr/backend
npm run prisma:seed -w @ocr/backend
```

Verification commands are opt-in for agent work:

```powershell
npm run typecheck
npm run lint -w @ocr/backend
npm run lint -w @ocr/frontend
npm run test -w @ocr/backend
npm run build
```

Do not report a check as passing unless that exact command ran successfully.
Note that backend lint uses `--fix` and therefore mutates files.

## Desktop Development

`npm run dev:desktop`:

- prepares a Tool Python environment;
- builds Electron TypeScript;
- skips UAC relaunch by default in the development launcher;
- starts or reuses Device Tool, backend, and frontend;
- runs Prisma deployment migrations unless disabled;
- opens the startup page and renderer;
- stops only processes owned by Electron.

Device Tool cannot use a fallback port because its own configuration owns the
port. Backend and frontend may use configured fallback ranges when their default
ports are occupied by an unrelated process.

## Source Boundaries

- `tool/` is a read-only Git submodule. Do not format, generate, migrate, rename,
  delete, or edit within it during application work.
- Do not modify original license sources, `System8.dll`, license helpers, or the
  fallback dongle script without explicit approval for that exact change.
- Frontend must call backend; it must not call Device Tool directly.
- Preserve unrelated dirty-worktree changes.

## Implementation Conventions

- TypeScript strict mode is expected.
- Backend DTO validation uses `class-validator` and the global whitelist pipe.
- Database changes require Prisma migrations.
- Reuse existing UI primitives and i18n keys.
- Operational UI must prioritize the 1280 x 1024 touchscreen.
- Required destructive, save, dirty-state, and sensitive actions use custom dialogs.
- Keep technical diagnostics in logs and user messages concise.

## Hardware-Free Development

Development may use dongle mock mode and the DEV PLC simulator. These paths are
diagnostic conveniences and do not prove real dongle, camera, PLC, installer,
or production behavior. Remembered-session restore deliberately rejects dongle mock mode.

## Release Development

Release work uses `scripts/release/prepare-runtime.ps1` followed by the Electron
NSIS build. A release needs access to the pinned encrypted Tool artifact. Local
release builds can use an explicitly supplied Tool bundle without changing the
`tool/` submodule.

See [12-release-setup.md](12-release-setup.md) for installer and update behavior.
