# 0005 — Dongil durable outbox and historical reconciliation

Status: Accepted — documents the current implementation

## Context

Factory connectivity can be intermittent. Production capture must not depend on
Dongil availability, and retries must not duplicate server results or alter original timestamps.

## Alternatives

- Send synchronously during capture.
- Retry only in memory.
- Persist live outbox records and historical synchronization snapshots.

## Decision

Persist local inspection results first. Deliver aggregate washing results from a
durable outbox using stable local IDs and bounded retries. Historical runs use
immutable snapshots, stable batch IDs, a worker lease, checkpoints, counter
reconciliation, and result-ID reconciliation.

## Rationale

The approach preserves production continuity, supports restart recovery, and
provides idempotent proof of delivery without deleting local history.

## Consequences

- Delivery and verification are separate durable phases.
- `ACCEPTED` and `REPLAYED` are successful outcomes.
- Invalid historical records remain visible for manual handling.
- New captures continue outside an active historical snapshot.
