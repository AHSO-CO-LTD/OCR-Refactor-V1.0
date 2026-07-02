# Release Setup Notes

The Windows setup is built with Electron Builder NSIS.

Production bootstrap writes machine-local secrets to:

```text
C:\ProgramData\AHSO OCR\.env
C:\ProgramData\AHSO OCR\support-dev-credential.json
```

Do not commit real `.env` files. GitHub Actions builds the app without machine
secrets; the installer creates them on the target PC.

The setup does not bundle generated dependency folders such as `node_modules`
or `tool/.venv`. During installation, `bootstrap-installer.ps1` installs Node
dependencies and Python requirements on the target PC.

For a fully offline setup, place required vendor installers and package caches
in `release-runtime/vendor` before running `npm run release:win`:

```text
postgresql-windows-x64.exe
node-windows-x64.msi
vc_redist.x64.exe
python-windows-x64.exe
```

The bootstrap script currently expects PostgreSQL to be available through
`psql.exe` or through the bundled `postgresql-windows-x64.exe`. It installs
Node.js through `node-windows-x64.msi` when `npm.cmd` is not available.
