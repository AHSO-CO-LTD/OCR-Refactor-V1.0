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
or `tool/.venv`. During installation, `preflight-environment.ps1` first scans
for required runtime frameworks and reports anything missing. The user can
install missing frameworks manually and click Check again, or click Next to let
setup download and install only the missing/unsupported runtime components from
`online-runtime-manifest.json`. After the app files are copied,
`bootstrap-installer.ps1` installs Node dependencies, generates the Prisma
Client, runs migrations, seeds production data, and installs Python requirements
on the target PC. The Device Tool runtime requires Python 3.11 only.

When the online preflight installs Node.js, Python, or PostgreSQL, it records
that ownership in `C:\ProgramData\AHSO OCR\runtime-ownership.json`. The
uninstaller uses that file so the default clean uninstall removes only runtime
frameworks installed by this setup, not frameworks that already existed on the
customer PC.

When setup installs PostgreSQL itself, the generated local PostgreSQL `postgres`
superuser password is fixed to `0123456789` so service administrators can log in
later. Setup does not change the password of an already-installed PostgreSQL
instance.

The staged `frontend-standalone` folder must contain its own `package.json` so
the installer can install production Next.js dependencies beside the standalone
server.

The staged backend runtime must include `native\dongle-checker.exe`; the backend
license service loads that helper before calling `System8.dll`. The Python
`backend/scripts/check-dongle.py` helper is kept for development/debug fallback
and is not copied into the production runtime.
During bootstrap, setup removes any stale production
`runtime\backend\scripts\check-dongle.py` left by older installs.

The release build machine needs Go available in `PATH` so
`scripts/release/build-dongle-helper.ps1` can compile the production dongle
helper. Customer machines do not need Go.

The default setup is an online installer and needs internet during installation.
For a fully offline setup, place required vendor installers and package caches
in `release-runtime/vendor` before running `npm run release:win` and replace or
disable the online preflight:

```text
postgresql-windows-x64.exe
node-windows-x64.msi
vc_redist.x64.exe
python-windows-x64.exe
```

After preflight finishes, the bootstrap script expects PostgreSQL through
`psql.exe`, Node/npm through `npm.cmd`, and Python 3.11 to be available on the
target PC.
