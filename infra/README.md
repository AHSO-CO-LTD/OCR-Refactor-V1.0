# Infrastructure directory

This directory is currently a reserved location; it contains no executable
infrastructure definition beyond this document.

The project's active operational infrastructure lives elsewhere:

- Prisma schema and migrations: `backend/prisma/`
- Windows installer and runtime staging: `scripts/release/`
- NSIS customization: `build/installer.nsh`
- GitHub Actions workflows: `.github/workflows/`
- Electron lifecycle and updates: `electron/src/`

Do not place speculative cloud, container or service infrastructure here. The
deployment target is a local Windows factory workstation.

See [`../docs/01-architecture.md`](../docs/01-architecture.md) and
[`../docs/12-release-setup.md`](../docs/12-release-setup.md).
