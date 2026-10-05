# 0004 — PLC communication through Device Tool

Status: Accepted — documents the current implementation

## Context

The washing machine may use Modbus TCP or Mitsubishi SLMP and needs fixed and
custom signals integrated with the same production state machine.

## Alternatives

- PLC libraries in the renderer.
- Native PLC libraries in NestJS.
- NestJS machine runtime with Device Tool as the protocol adapter.

## Decision

NestJS owns PLC configuration, production state, permissions, retries, signal
semantics, and persistence. Device Tool performs Modbus TCP or SLMP transport.
The configured protocol is authoritative and does not silently fall back.

## Rationale

The design keeps business behavior testable in TypeScript while reusing the
existing Python device communication layer.

## Consequences

- Frontend never calls PLC endpoints on Tool.
- Optional signal addresses are skipped independently.
- PLC loss must not silently change Manual/Auto or result semantics.
- Simulator behavior must remain isolated and backend-authorized for `dev`.
