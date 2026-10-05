# Shared workspace

Reserved workspace for cross-process TypeScript contracts and assets.

Current facts:

- Package name: `@ocr/shared`.
- The application logo is stored under `shared/logo/` and is consumed by the
  Electron build.
- The workspace does not yet publish compiled shared contracts; its build,
  lint and typecheck scripts are explicit placeholders that only print status.
- Most current API/IPC types remain owned by their consuming workspaces.

Do not assume a type is shared merely because this workspace exists. When
moving a contract here, inspect every backend, frontend, Electron and preload
consumer and treat the move as an API/IPC compatibility change.

See [`../docs/01-architecture.md`](../docs/01-architecture.md).
