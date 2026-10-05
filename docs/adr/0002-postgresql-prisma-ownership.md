# 0002 — PostgreSQL and Prisma ownership

Status: Accepted — documents the current implementation

## Context

Users, product configuration, production history, PLC settings, and durable
Dongil synchronization require transactional local storage.

## Alternatives

- SQLite embedded in the renderer.
- Direct database access from multiple processes.
- PostgreSQL owned by the NestJS backend through Prisma.

## Decision

Use PostgreSQL as the durable source of truth. NestJS owns all application data
access through Prisma, and schema changes are delivered through committed migrations.

## Rationale

PostgreSQL supports transactions, constraints, concurrent background work, and
recoverable backups while keeping database access out of the renderer and Tool.

## Consequences

- Installer and startup must verify PostgreSQL and migration readiness.
- Destructive migration work requires backup and recovery planning.
- Generated Prisma Client must match the committed schema.
- Frontend and Tool cannot query PostgreSQL directly.
