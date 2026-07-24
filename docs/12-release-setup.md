# Windows Setup And Update Flow

## Goal

Build one Windows setup file for the local OCR station.

The setup must install the desktop shell, backend, frontend runtime, Device/OCR
Tool, local environment, and PostgreSQL database bootstrap. The browser must
still call the backend only; the backend calls the Tool through `/tool/v1`.

## Setup Flow

1. User runs `AHSO-OCR-Setup-<version>-x64.exe`.
2. NSIS requests administrator permission.
3. Setup scans Node.js/npm and PostgreSQL on the customer PC. Python 3.11 is
   already embedded in the encrypted Device Tool.
4. Setup shows the framework status summary:
   - if all frameworks are ready, setup tells the user that the PC already has
     all required frameworks.
   - if anything is missing, setup lists the missing frameworks.
5. When frameworks are missing, the user can install them manually and click
   Check again, or click Next to let setup download and install them
   automatically.
6. After manual recheck or automatic install succeeds, setup shows that all
   required frameworks are ready and waits for the user to click Next before
   the actual OCR database setup starts.
7. User enters PostgreSQL host, port, database name, and app DB user.
8. Installer probes PostgreSQL to check whether that database already exists.
9. If the database exists, setup opens a dedicated choice page: use a different
   database name, reuse the existing database and preserve its data, or replace
   it with a clean database. Setup then opens only the configuration page
   required by the selected option.
10. If the database does not exist, setup asks for PostgreSQL admin credentials
   and creates the database.
11. Installer copies Electron and `resources/runtime`.
12. Installer runs `resources/installer/bootstrap-installer.ps1`.
13. Bootstrap creates `C:\ProgramData\AHSO OCR\.env`.
14. Bootstrap installs Node dependencies.
15. Bootstrap installs `tool/requirements.txt` into `tool/python-embed` and
    verifies that the compiled Tool can be imported.
16. Bootstrap runs Prisma migrations.
17. Bootstrap seeds roles, permissions, and the hidden `dev` support account.
18. User opens the app and sees first-run admin creation when no active admin exists.
19. Customer admin creates their own administrator account.
20. Future logins use normal dongle/license gating.

If bootstrap fails after files are copied, setup removes the copied app files,
shortcuts, and installer registry entry so Windows does not show a half-installed
desktop app. When setup created a new database or deleted and recreated an
existing database for this attempt, bootstrap also drops that database during
failure rollback.

## GitHub Build Flow

```text
push tag vX.Y.Z
  -> GitHub Actions Windows runner
  -> npm ci
  -> download the pinned encrypted Tool asset from its private repository
  -> verify SHA-256 and compiled-module structure
  -> build backend/frontend/electron
  -> stage release-runtime
  -> electron-builder NSIS
  -> upload Setup.exe + latest.yml to GitHub Release
```

The workflow exposes the repository Actions secret `TOOL_RELEASE_TOKEN` as
`GH_TOKEN` only while preparing the runtime. This must be a fine-grained PAT
with `Contents: Read` access to `AHSO-CO-LTD/API-Tool-v1`; the workflow's normal
`GITHUB_TOKEN` is scoped to this application repository and cannot read another
private repository.

The pinned Tool release is configured in:

```text
scripts/release/private-tool-release.json
```

## Local Release Build

Authenticate GitHub CLI with an account that can read the private Tool repo,
then build normally:

```powershell
gh auth login
gh auth status
npm run release:win
```

For a local/offline bundle, bypass GitHub download with:

```powershell
$env:DEVICE_TOOL_BUNDLE_PATH = "C:\duyhai\AHSO\tool-2026.Jul.06.2"
npm run release:win
```

The override accepts an extracted bundle directory or the exact release zip.
The package structure is still validated. Zip overrides are also checked
against the configured SHA-256.

## Env Rule

Real secrets are not committed.

GitHub builds the installer without machine-local secrets. The installer creates
the production `.env` on the target machine:

```text
C:\ProgramData\AHSO OCR\.env
```

This file contains `DATABASE_URL`, `JWT_SECRET`, service ports, Device Tool URL,
and dongle runtime settings.

## Database Setup Rule

The setup uses the PostgreSQL instance selected by the user instead of forcing a
new app-private database service.

Default values:

```text
Host: 127.0.0.1
Port: 5432
Database: ocr_metal_core_washing
App user: ahso_ocr
```

Setup probes PostgreSQL before asking for database credentials. If the selected
database already exists, setup gives three choices on a dedicated page:

1. enter a different database name, then setup scans that new name and creates
   it if it is available.
2. reuse the existing database with the current app DB password and preserve
   its existing data.
3. delete the existing database and create a clean database with the same name.

Each option continues to its own short configuration page. The reuse option
requires the current app DB password and does not set the destructive reset
flag. The delete-and-recreate option requires PostgreSQL admin credentials and
is destructive. The app DB password can be left empty for new/replacement
databases so setup generates one. If the database does not exist, setup requires
PostgreSQL admin credentials and creates the app DB/user. If the installer
cannot probe without admin access, it asks for PostgreSQL admin credentials
first, then continues based on the probe result.

If the online preflight installs PostgreSQL because the customer PC does not
already have a compatible PostgreSQL runtime, setup creates the local
PostgreSQL `postgres` superuser with password `0123456789`. If PostgreSQL was
already installed before setup, setup reuses it and does not change its existing
password.

## Developer Support Account

Production seed creates only the hidden `dev` support account automatically.
The password is randomly generated by the installer and written to:

```text
C:\ProgramData\AHSO OCR\support-dev-credential.json
```

Normal admin screens still hide and protect `dev`.

## Uninstall Rule

The uninstaller shows options before removal starts. The default is a clean
uninstall with no boxes checked.

- Clean uninstall: app files, shortcuts, local OCR database/config, and runtime
  frameworks installed by this setup are removed.
- Keep database: app files are removed, but the local PostgreSQL database and
  runtime config are preserved for reinstall/update recovery.
- Keep frameworks: app files and selected local data are removed, but runtime
  frameworks installed by setup are preserved.
- Keep both: only the AHSO OCR app files and shortcuts are removed.

For safety, the uninstaller removes Node.js and PostgreSQL only
when `C:\ProgramData\AHSO OCR\runtime-ownership.json` shows that the online
setup installed them. Frameworks that already existed on the customer PC before
setup are not removed automatically.

If the database is kept, PostgreSQL is kept too even when framework cleanup is
selected, because the preserved database depends on the local PostgreSQL
runtime.

Silent uninstall uses the default clean mode.

## Customer Admin Account

The customer admin is not seeded silently. When the backend reports no active
admin account, the frontend redirects `/login` to `/setup`, where the user
creates the first admin account.

## Dependency Rule

Generated dependency folders are not bundled into the setup:

```text
node_modules/
tool/.venv/
__pycache__/
```

The installer bootstrap installs Node packages and Python requirements on the
target PC during setup. Python requirements are installed into the Python 3.11
embedded runtime shipped inside the encrypted Device Tool; system Python is not
required for this release.

## Online Environment Preflight

The setup is an online installer by default. It keeps the setup file smaller by
downloading runtime installers only when the target PC is missing them or has an
unsupported version.

The preflight step is implemented by:

```text
scripts/release/preflight-environment.ps1
scripts/release/online-runtime-manifest.json
```

Current scan checks:

- Node.js and npm, with Node.js major version `>= 22`.
- Bundled encrypted Device Tool Python `3.11` (reported as ready without a
  system-Python scan or download).
- PostgreSQL client/server availability through `psql.exe`, with major version
  `>= 14`.
- General internet access through stable connectivity endpoints only when setup
  needs to download and install missing frameworks automatically. Vendor
  installer URLs are downloaded only when the corresponding runtime is missing
  or unsupported.

The first scan does not install anything. If frameworks are missing, the user
can install them manually and press Check again on the setup page. If the user
clicks Next while frameworks are still missing, setup checks internet access and
downloads the installers listed in `online-runtime-manifest.json`. If internet
is unavailable at that point, setup displays a clear message and exits before
the database or app setup pages. If a specific runtime download URL is blocked,
setup reports that download error instead of incorrectly reporting the whole PC
as offline.

When all frameworks are available, whether they were already present, installed
manually, or installed by setup, the setup page shows an environment-ready
summary. The user must click Next before setup continues to the
PostgreSQL/database configuration pages.

The bootstrap step still verifies the runtime after files are copied and then
installs app dependencies, Tool requirements into the embedded Python runtime,
Prisma migrations, and production seed data.

## Product Preview Rotation Default

New product camera profiles default `previewRotation` to `0`. ROI data remains
stored in image coordinates. Line OCR crop rotation is controlled separately by
the per-product `rotateTestImageClockwise` setting and new products default it
to `true`, so the app crops ROI first, rotates that crop 90 degrees clockwise,
then sends the rotated crop to OCR.
