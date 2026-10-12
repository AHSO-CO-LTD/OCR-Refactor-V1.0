# 0003 — Device Tool HTTP and WebSocket boundary

Status: Accepted — documents the current implementation

## Context

Camera, OCR, Modbus TCP, and SLMP are implemented by the Python Device Tool,
while application business rules and authorization are implemented in NestJS.

## Alternatives

- Call Device Tool directly from the renderer.
- Import Python/device implementation into NestJS.
- Keep a versioned local HTTP/WebSocket boundary behind NestJS.

## Decision

Frontend calls NestJS only. NestJS calls the read-only Device Tool through
`/tool/v1` REST and WebSocket contracts. Application code adapts Tool payloads
without importing or modifying Tool implementation.

## Rationale

This isolates device-specific runtime behavior, keeps authorization and
persistence in the backend, and allows the Tool to be released separately.

## Consequences

- Tool contract changes require consumer review in backend and Electron.
- Tool outages must produce explicit backend errors.
- Tool-side changes require a separately approved task in the Tool repository.
- Network exposure of the unauthenticated Tool interface must be controlled operationally.
