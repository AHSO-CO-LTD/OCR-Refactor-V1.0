# Automation scripts

Repository automation is intentionally split by responsibility.

## Root scripts

- `start-frontend-safe.ps1`: starts the frontend only after choosing a safe
  available port according to the script's rules.
- `prepare-license-key-runtime.mjs`: prepares license runtime assets consumed
  by the Electron build; it must not rewrite the protected source SDK.

## Development scripts

`scripts/dev/ensure-tool-python.ps1` prepares the local Tool Python environment
used by `npm run dev:desktop`. The Tool directory remains read-only for product
source changes; generated local environment handling is operational only.

## Release scripts

`scripts/release/` contains runtime staging, private Tool bundle validation,
environment preflight, database probing/bootstrap, native dongle-helper build,
Dongil configuration bootstrap and uninstall cleanup.

The main entry points are:

```powershell
npm run release:prepare
npm run release:win
```

Release scripts can install software, create or migrate a database and write
machine-local configuration. Read
[`../docs/12-release-setup.md`](../docs/12-release-setup.md) and
[`release/README.md`](release/README.md) before executing them.

Do not modify `tool/` or original license source/binaries as part of script
maintenance.
