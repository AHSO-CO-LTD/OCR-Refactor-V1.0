# 0001 — Local-first Electron runtime

Status: Accepted — documents the current implementation

## Context

The application operates on one Windows factory workstation and must continue
without cloud infrastructure. It needs elevated camera, PLC, database, update,
and shutdown coordination.

## Alternatives

- Browser-hosted SaaS with remote services.
- Independent manually started local services.
- Electron-owned local runtime orchestration.

## Decision

Use Electron as the administrator-required desktop entry point. Electron starts
or reuses local Device Tool, NestJS, and Next.js services, performs startup
checks, opens the renderer, monitors app-owned services, and coordinates shutdown.

## Rationale

This provides one operator entry point, deterministic local service ownership,
offline operation, and a path to Windows installation and recovery.

## Consequences

- Electron main and preload are privileged security boundaries.
- Only app-owned processes may be stopped automatically.
- Hardware and service startup must expose recoverable status.
- Production acceptance must occur on the target Windows workstation.
