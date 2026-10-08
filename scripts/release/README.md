# Release Setup Notes

Status: Current release-script reference for local candidate `1.5.0-rc.2`;
packaged acceptance remains pending.

Last source review: `2026-10-08`. The RC2 release build and packaged acceptance
status are recorded in the associated plan; no publish is implied.

The release process may stage an approved encrypted Tool bundle and compiled
license artifacts. It must not modify `tool/` or original license source and
binaries.

The Windows setup is built with Electron Builder NSIS.

Production bootstrap writes machine-local secrets to:

```text
C:\ProgramData\AHSO OCR\.env
C:\ProgramData\AHSO OCR\support-dev-credential.json
```

Do not commit real `.env` files. GitHub Actions builds the app without machine
secrets; the installer creates them on the target PC.

The setup does not bundle generated dependency folders such as `node_modules`
or `tool/.venv`. It does bundle the encrypted Device Tool and its Python 3.11
embedded runtime. During installation, `preflight-environment.ps1` scans Node.js,
npm, and PostgreSQL. After the app files are copied, `bootstrap-installer.ps1`
installs Node dependencies, installs Tool requirements into `tool/python-embed`,
generates the Prisma Client, runs migrations, and seeds production data.

When the online preflight installs Node.js or PostgreSQL, it records
that ownership in `C:\ProgramData\AHSO OCR\runtime-ownership.json`. Normal and
silent uninstall both default to app-only removal: database, ProgramData,
configuration, logs, backups, and runtime frameworks are preserved. Interactive
users may explicitly clear a keep option when destructive cleanup is intended.

When setup installs PostgreSQL itself, the generated local PostgreSQL `postgres`
superuser password is fixed to `0123456789` so service administrators can log in
later. Setup does not change the password of an already-installed PostgreSQL
instance.

The staged `frontend-standalone` folder must contain its own `package.json` so
the installer can install production Next.js dependencies beside the standalone
server.

The release preparation script sets
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3979/api` before `next build` and
rejects any production browser bundle that still contains the dev API on port
`3980`. Writing this variable during installation is not sufficient because
Next.js embeds `NEXT_PUBLIC_*` values at build time.

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

`python-windows-x64.exe` is needed only for legacy Tool bundles that do not
contain `python-embed`; the configured encrypted release contains it already.

After preflight finishes, the bootstrap script expects PostgreSQL through
`psql.exe`, Node/npm through `npm.cmd`, and Python 3.11 at
`runtime\tool\python-embed\python.exe`.

## Private encrypted Tool release

Both local and GitHub Actions builds use
`scripts/release/private-tool-release.json`. The current source is the private
GitHub release asset `AHSO-CO-LTD/API-Tool-v1@2026.Jul.06.2` /
`tool-2026.Jul.06.2.zip`.

The staging script verifies the configured SHA-256 and rejects a package that
does not contain the compiled `api`, `core`, and `drivers` `.pyd` modules. It
also rejects protected plaintext source in those modules.

Local build with an authenticated GitHub CLI session:

```powershell
gh auth login
gh auth status
npm run release:win
```

The authenticated account must have read access to the private Tool repository.
For an offline/local bundle override, point to either the extracted directory or
the exact zip archive:

```powershell
$env:DEVICE_TOOL_BUNDLE_PATH = "C:\duyhai\AHSO\tool-2026.Jul.06.2"
npm run release:win
```

GitHub Actions requires a repository Actions secret named
`TOOL_RELEASE_TOKEN`. Use a fine-grained PAT with `Contents: Read` access to
`AHSO-CO-LTD/API-Tool-v1`. The normal workflow `GITHUB_TOKEN` cannot read a
different private repository.

To upgrade the bundled Tool, update tag, asset name, and SHA-256 together in
`private-tool-release.json`. Release metadata and the asset digest can be
checked with:

```powershell
gh release view 2026.Jul.06.2 --repo AHSO-CO-LTD/API-Tool-v1 --json assets
```
