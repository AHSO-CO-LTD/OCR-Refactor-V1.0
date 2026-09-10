# Dongil washing-history synchronization

Status: In Progress

## Objective

Allow a washing machine to safely upload and verify all eligible locally stored
production results, including a long offline history, without changing original
local inspection data or replacing its original inspection time.

## Approved requirements

- Upload to `POST /api/v1/machine-types/washing/inspection-results/batches` in
  batches of at most 500, authenticated by the current machine credential.
- Treat `ACCEPTED` and `REPLAYED` as delivered. Retain failures and their last
  error locally.
- Persist a fixed historical snapshot, checkpoint only after an acknowledged
  batch, and resume after restart/network loss.
- Keep new production captures outside an active history snapshot; they remain
  locally persisted first and are handled by the normal outbox path.
- Reconcile every historical day/session by counters and use result-ID
  reconciliation to prove completeness and resend only missing IDs.
- Preserve `inspectedAt`; the server's `receivedAt` is never used as a local
  inspection timestamp.
- Never delete local inspection results after synchronization.
- Records without a stable existing `localResultId` or sufficient source data
  are listed for manual handling. The application never manufactures IDs for
  historical records.
- DEV/ADMIN may start, pause, resume, cancel and retry a history run. Cancelling
  marks the run `CANCELLED` after its current batch; it never deletes local or
  already-delivered server data. Signed-in
  operational users may view progress and hide Processing while work continues.
- Delivery and reconciliation are separate durable phases. Successful delivery
  remains visible while reconciliation starts automatically and a later
  reconciliation error must not be presented as an upload failure.
- Completed verification is persisted per `localResultId`. A later run includes
  only new, changed, unconfirmed or unverified results, while counters are still
  calculated from the complete affected day/session.
- A minimized Processing surface remains minimized while navigating between
  application pages. A newly created run opens normally and the current run can
  always be restored from its compact control.
- Starting synchronization when every eligible result is already verified is a
  successful no-op, not an error. The settings panel shows the most recent
  successful verification time from durable run history.

## Current-state findings

- `DongilSyncOutbox` already persists stable new-capture IDs, original time,
  product/result/counts, delivery state, bounded retry and per-item
  `ACCEPTED`/`REPLAYED` handling.
- The existing worker already caps database selections at 500 but generates a
  transient batch ID and has no history snapshot, durable progress, reconcile,
  or user-facing controls.
- New PLC captures have a stable `plcCaptureId`, which is the current
  `localResultId`. Historical `InspectionLog` rows can only be reconstructed
  when their capture ID and product/session data remain available.

## Design

### Database

Add durable sync-run and snapshot-item tables, plus the smallest extensions to
the outbox needed for a stable per-batch ID and receipt disposition.

- One active historical run per machine, protected by a database-backed worker
  lease rather than only in-memory state.
- A run records the immutable total item count, calculated batch count,
  accepted/replayed/failed counts, current batch, state, and checkpoints.
- A snapshot item references an immutable local result ID and the outbox record
  that holds its production payload. It records its run-specific upload and
  verification state; results created after snapshot creation have no snapshot
  item.
- Invalid historical candidates are recorded with a reason for manual review.
- The outbox stores the latest successful server-verification timestamp. Runs
  store separate upload-completed and verification start/completed timestamps.

### Worker

1. Build a durable snapshot from existing outbox rows and reconstructable
   `InspectionLog` capture groups. Persist candidates before uploading.
2. Select the next stable group of at most 500 snapshot items and persist its
   `localBatchId` before sending it.
3. Update every item only from the per-item server result. A transport failure
   leaves the checkpoint unadvanced and retains the same batch ID for retry.
4. After upload, reconcile each Asia/Ho_Chi_Minh day or existing local session.
   A counter mismatch triggers result-ID reconciliation. Historical sync also
   performs ID reconciliation before completion, so equal counters alone cannot
   hide missing results.
5. Requeue only the local records named by `missingIds`; verify again until the
   scope is complete. New captures stay in the normal live outbox.

### Local API and permissions

Add authenticated local APIs for run status, start, pause, resume, cancel, retry
failed items, and paginated manual-review candidates. Backend authorization is
authoritative. `dongil.history-sync.view` is granted to operational roles;
`dongil.history-sync.manage` is granted to DEV/ADMIN.

### Processing UI

Add a touch-friendly, i18n-aware Processing surface. It displays a separate
delivery progress bar and reconciliation progress bar so a fully uploaded
snapshot cannot be mistaken for a completed verification. It also displays
accepted/replayed/failed counters, current batch/retry state, and the approved
Continue operations, Pause, Resume, Cancel and Retry failures actions. Continue
operations hides the surface only; the backend worker stays active. The surface
resumes after restart from persisted status.

The minimized state is stored against the run ID so route changes do not reopen
the modal. Upload completion and automatic reconciliation use separate labels
and progress bars.

## Rollout and recovery

- Migration is additive; no inspection or outbox record is deleted.
- Existing `SENDING` records are recovered to retryable state at startup.
- A failed/expired credential pauses the run without discarding its snapshot.
- Server-side idempotency and stable local IDs protect retries.
- Existing `DongilMachineInfo` migration/Prisma Client generation must be
  completed before applying these dependent backend changes.

## Phases

- [Done] Add schema, migration, API client contracts and durable worker.
- [Done] Add protected local API and permissions.
- [Done] Add Processing UI, delivery/reconciliation progress polling and i18n.
- [Done] Persist incremental verification, split durable upload and
  reconciliation phase status, and preserve minimized UI state across routes.
- [Pending] Add focused unit tests and verify migration/runtime against a
  connected Dongil Server when explicitly requested.

## Definition of done

- A stopped/offline machine can resume an unchanged historical snapshot.
- Every valid result is either confirmed, replayed, or retained with a visible
  failure; no local result is deleted.
- A completed historical run has successful counter and result-ID verification
  for every scope.
- New captures continue to persist and sync independently while history runs.
- UI and backend controls enforce the approved permissions and support English
  and Vietnamese.
