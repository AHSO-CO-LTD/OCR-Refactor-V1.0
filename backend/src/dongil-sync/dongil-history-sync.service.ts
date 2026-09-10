import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  DongilDeliveryDisposition,
  DongilHistorySyncItemStatus,
  DongilHistorySyncRunState,
  DongilSyncOutboxStatus,
  InspectionResult,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  DongilApiClient,
  DongilApiError,
  type DongilReconcileScope,
} from './dongil-api.client';
import { DongilSyncService } from './dongil-sync.service';

const BATCH_LIMIT = 500;
const WORKER_INTERVAL_MS = 5_000;
const LEASE_ID = 'default';
const LEASE_MS = 120_000;

type HistoricalCapture = {
  plcCaptureId: string;
  jobId: string;
  inspectedAt: Date;
  productCode: string;
  productName: string | null;
  okCount: number;
  ngCount: number;
};

type HistoricalInvalidCandidate = {
  sourceLogId: string;
  plcCaptureId: string | null;
  reason: string;
  capturedAt: Date;
};

@Injectable()
export class DongilHistorySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DongilHistorySyncService.name);
  private readonly workerId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly cancellationRequests = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dongilSync: DongilSyncService,
  ) {}

  async onModuleInit() {
    await this.prisma.dongilHistorySyncItem.updateMany({
      where: { status: DongilHistorySyncItemStatus.SENDING },
      data: {
        status: DongilHistorySyncItemStatus.PENDING,
        nextAttemptAt: new Date(),
      },
    });
    await this.prisma.dongilSyncWorkerLease.upsert({
      where: { id: LEASE_ID },
      create: { id: LEASE_ID },
      update: {},
    });
    this.timer = setInterval(() => void this.tick(), WORKER_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getCurrent() {
    const [run, invalidCount, lastSuccessfulRun] = await Promise.all([
      this.prisma.dongilHistorySyncRun.findFirst({
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.dongilHistorySyncInvalidItem.count(),
      this.prisma.dongilHistorySyncRun.findFirst({
        where: { verificationCompletedAt: { not: null } },
        orderBy: { verificationCompletedAt: 'desc' },
        select: { verificationCompletedAt: true },
      }),
    ]);
    if (!run) return { data: null };

    const [totalScopes, completedScopes, verifiedCount, currentScope] = await Promise.all([
      this.prisma.dongilHistorySyncScope.count({ where: { runId: run.id } }),
      this.prisma.dongilHistorySyncScope.count({
        where: { runId: run.id, completedAt: { not: null } },
      }),
      this.prisma.dongilHistorySyncItem.count({
        where: { runId: run.id, verifiedAt: { not: null } },
      }),
      this.prisma.dongilHistorySyncScope.findFirst({
        where: { runId: run.id, completedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { scope: true, scopeKey: true, counterReconciledAt: true, idsVerifiedAt: true },
      }),
    ]);
    const uploadConfirmed = run.acceptedCount + run.replayedCount;
    const deliveryComplete = run.uploadCompletedAt !== null;
    const phase =
      run.state === DongilHistorySyncRunState.COMPLETED
        ? 'COMPLETED'
        : !deliveryComplete
          ? 'WAITING_FOR_UPLOAD'
          : !currentScope
            ? 'FINALIZING'
            : !currentScope.counterReconciledAt
              ? 'COUNTERS'
              : !currentScope.idsVerifiedAt
                ? 'RESULT_IDS'
                : 'FINALIZING';

    return {
      data: {
        ...run,
        invalidCount,
        lastSuccessfulVerificationAt:
          lastSuccessfulRun?.verificationCompletedAt ?? null,
        delivery: {
          phase: deliveryComplete ? 'COMPLETED' : 'UPLOADING',
          total: run.uploadTotal,
          confirmed: Math.min(uploadConfirmed, run.uploadTotal),
          percent:
            run.uploadTotal === 0
              ? 100
              : Math.floor((uploadConfirmed / run.uploadTotal) * 100),
          completedAt: run.uploadCompletedAt,
        },
        percent:
          run.snapshotTotal === 0
            ? 100
            : Math.floor((run.snapshotConfirmed / run.snapshotTotal) * 100),
        reconciliation: {
          phase,
          total: run.snapshotTotal,
          verified: verifiedCount,
          percent:
            run.snapshotTotal === 0
              ? 100
              : Math.floor((verifiedCount / run.snapshotTotal) * 100),
          totalScopes,
          completedScopes,
          currentScope: currentScope
            ? { scope: currentScope.scope, scopeKey: currentScope.scopeKey }
            : null,
          startedAt: run.verificationStartedAt,
          completedAt: run.verificationCompletedAt,
        },
      },
    };
  }

  async listInvalid(page: number, limit: number) {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const [total, data] = await Promise.all([
      this.prisma.dongilHistorySyncInvalidItem.count(),
      this.prisma.dongilHistorySyncInvalidItem.findMany({
        orderBy: { capturedAt: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);
    return { data, meta: { page: safePage, limit: safeLimit, total } };
  }

  async start(actorId: string) {
    this.assertRuntimeAvailable();
    const active = await this.prisma.dongilHistorySyncRun.findFirst({
      where: {
        state: {
          in: [
            DongilHistorySyncRunState.PREPARING,
            DongilHistorySyncRunState.RUNNING,
            DongilHistorySyncRunState.PAUSED,
            DongilHistorySyncRunState.BLOCKED,
          ],
        },
      },
    });
    if (active) {
      throw new ConflictException('A Dongil history synchronization run already exists.');
    }

    await this.backfillHistoricalOutbox();
    const allOutbox = await this.prisma.dongilSyncOutbox.findMany({
      where: {
        result: { in: [InspectionResult.OK, InspectionResult.NG] },
        okCount: { not: null },
        ngCount: { not: null },
      },
      orderBy: [{ inspectedAt: 'asc' }, { id: 'asc' }],
    });
    if (allOutbox.length === 0) {
      throw new BadRequestException('No eligible washing results are available for history synchronization.');
    }

    const requiresUpload = allOutbox.filter(
      (row) => row.status !== DongilSyncOutboxStatus.SENT,
    );
    const requiresVerificationOnly = allOutbox.filter(
      (row) =>
        row.status === DongilSyncOutboxStatus.SENT && row.verifiedAt === null,
    );
    const outbox = [...requiresUpload, ...requiresVerificationOnly];
    if (outbox.length === 0) {
      return {
        ...(await this.getCurrent()),
        alreadyVerified: true,
      };
    }

    let run: { id: string };
    try {
      run = await this.prisma.dongilHistorySyncRun.create({
        data: {
          state: DongilHistorySyncRunState.PREPARING,
          snapshotTotal: 0,
          totalBatches: 0,
          startedById: actorId,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A Dongil history synchronization run already exists.');
      }
      throw error;
    }

    const affectedScopeKeys = new Set(
      outbox.map((row) => {
        const { scope, scopeKey } = resolveScope(
          row.localSessionId,
          row.inspectedAt,
        );
        return `${scope}\u0000${scopeKey}`;
      }),
    );
    const scopes = new Map<
      string,
      { scope: DongilReconcileScope; scopeKey: string; total: number; ok: number; ng: number }
    >();
    for (const row of allOutbox) {
      const { scope, scopeKey } = resolveScope(row.localSessionId, row.inspectedAt);
      const key = `${scope}\u0000${scopeKey}`;
      if (!affectedScopeKeys.has(key)) continue;
      const current = scopes.get(key) ?? { scope, scopeKey, total: 0, ok: 0, ng: 0 };
      current.total += 1;
      if (row.result === InspectionResult.OK) current.ok += 1;
      else current.ng += 1;
      scopes.set(key, current);
    }
    for (let index = 0; index < outbox.length; index += BATCH_LIMIT) {
      const chunk = outbox.slice(index, index + BATCH_LIMIT).map((item, offset) => {
        const alreadyDelivered = item.status === DongilSyncOutboxStatus.SENT;
        return {
          runId: run.id,
          outboxId: item.id,
          localResultId: item.localResultId,
          inspectedAt: item.inspectedAt,
          localSessionId: item.localSessionId,
          productCode: item.productCode,
          result: item.result,
          okCount: item.okCount!,
          ngCount: item.ngCount!,
          sequence: index + offset + 1,
          status: alreadyDelivered
            ? DongilHistorySyncItemStatus.CONFIRMED
            : DongilHistorySyncItemStatus.PENDING,
          confirmedAt: alreadyDelivered ? item.sentAt ?? new Date() : null,
        };
      });
      await this.prisma.dongilHistorySyncItem.createMany({ data: chunk });
    }

    await this.prisma.dongilHistorySyncScope.createMany({
      data: [...scopes.values()].map((scope) => ({ runId: run.id, ...scope })),
    });
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: run.id },
      data: {
        state: DongilHistorySyncRunState.RUNNING,
        snapshotTotal: outbox.length,
        snapshotConfirmed: requiresVerificationOnly.length,
        uploadTotal: requiresUpload.length,
        totalBatches: Math.ceil(requiresUpload.length / BATCH_LIMIT),
        checkpointedAt: new Date(),
      },
    });
    void this.tick();
    return this.getCurrent();
  }

  async pause() {
    const run = await this.requireActiveRun();
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: run.id },
      data: { state: DongilHistorySyncRunState.PAUSED, pausedAt: new Date() },
    });
    return this.getCurrent();
  }

  async resume() {
    this.assertRuntimeAvailable();
    const run = await this.requireActiveRun();
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: run.id },
      data: {
        state: DongilHistorySyncRunState.RUNNING,
        pausedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    void this.tick();
    return this.getCurrent();
  }

  async cancel() {
    const run = await this.requireActiveRun();
    this.cancellationRequests.add(run.id);
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: run.id },
      data: {
        state: DongilHistorySyncRunState.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    return this.getCurrent();
  }

  async retryFailures() {
    const run = await this.requireActiveRun();
    const failedItems = await this.prisma.dongilHistorySyncItem.findMany({
      where: { runId: run.id, status: DongilHistorySyncItemStatus.FAILED },
      select: { outboxId: true },
    });
    await this.prisma.dongilHistorySyncItem.updateMany({
      where: { runId: run.id, status: DongilHistorySyncItemStatus.FAILED },
      data: {
        status: DongilHistorySyncItemStatus.PENDING,
        localBatchId: null,
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (failedItems.length > 0) {
      await this.prisma.dongilSyncOutbox.updateMany({
        where: { id: { in: failedItems.map((item) => item.outboxId) } },
        data: {
          status: DongilSyncOutboxStatus.PENDING,
          nextAttemptAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    }
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: run.id },
      data: {
        state: DongilHistorySyncRunState.RUNNING,
        failedCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    void this.tick();
    return this.getCurrent();
  }

  private async tick() {
    if (this.running || !(await this.acquireLease())) return;
    this.running = true;
    try {
      const run = await this.prisma.dongilHistorySyncRun.findFirst({
        where: {
          OR: [
            { state: DongilHistorySyncRunState.RUNNING },
            {
              state: DongilHistorySyncRunState.BLOCKED,
              lastErrorCode: 'DONGIL_RUNTIME_UNAVAILABLE',
            },
          ],
        },
        orderBy: { startedAt: 'asc' },
      });
      if (!run) return;
      const runtime = this.dongilSync.getRuntimeForHistorySync();
      if (!runtime) {
        // A second local backend instance may share this database without
        // receiving Electron's in-memory machine credential. It must not
        // poison the durable run state; the credential-owning instance will
        // resume the same checkpoint once it is available.
        return;
      }
      if (run.state === DongilHistorySyncRunState.BLOCKED) {
        await this.prisma.dongilHistorySyncRun.update({
          where: { id: run.id },
          data: { state: DongilHistorySyncRunState.RUNNING, lastErrorCode: null, lastErrorMessage: null },
        });
      }
      if (!(await this.isRunRunning(run.id))) return;
      await this.flushRun(run, runtime);
    } catch (error) {
      this.logger.error(`Dongil history sync worker failed: ${describeError(error)}`);
    } finally {
      this.running = false;
      await this.releaseLease();
    }
  }

  private async flushRun(
    run: { id: string },
    runtime: { serverUrl: string; machineId: string; credential: string },
  ) {
    if (!(await this.isRunRunning(run.id))) return;
    const next = await this.prisma.dongilHistorySyncItem.findFirst({
      where: {
        runId: run.id,
        status: { in: [DongilHistorySyncItemStatus.PENDING, DongilHistorySyncItemStatus.FAILED] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { sequence: 'asc' },
    });
    if (next) {
      await this.sendNextBatch(run.id, next, runtime);
      return;
    }

    const outstanding = await this.prisma.dongilHistorySyncItem.count({
      where: {
        runId: run.id,
        status: { not: DongilHistorySyncItemStatus.CONFIRMED },
      },
    });
    if (outstanding > 0) return;

    const currentRun = await this.prisma.dongilHistorySyncRun.findUnique({
      where: { id: run.id },
      select: { uploadCompletedAt: true, verificationStartedAt: true },
    });
    if (!currentRun?.uploadCompletedAt) {
      const completedAt = new Date();
      await this.prisma.dongilHistorySyncRun.update({
        where: { id: run.id },
        data: {
          uploadCompletedAt: completedAt,
          verificationStartedAt:
            currentRun?.verificationStartedAt ?? completedAt,
          checkpointedAt: completedAt,
        },
      });
      return;
    }
    await this.reconcileNextScope(run.id, runtime);
  }

  private async sendNextBatch(
    runId: string,
    first: {
      localBatchId: string | null;
      sequence: number;
      attemptCount: number;
    },
    runtime: { serverUrl: string; machineId: string; credential: string },
  ) {
    if (!(await this.isRunRunning(runId))) return;
    const batchId = first.localBatchId ?? randomUUID();
    const rows = await this.prisma.dongilHistorySyncItem.findMany({
      where: {
        runId,
        status: { in: [DongilHistorySyncItemStatus.PENDING, DongilHistorySyncItemStatus.FAILED] },
        ...(first.localBatchId
          ? { localBatchId: batchId }
          : { localBatchId: null, sequence: { gte: first.sequence } }),
      },
      orderBy: { sequence: 'asc' },
      take: BATCH_LIMIT,
    });
    const outbox = await this.prisma.dongilSyncOutbox.findMany({
      where: { id: { in: rows.map((row) => row.outboxId) } },
    });
    const outboxById = new Map(outbox.map((row) => [row.id, row]));
    const validRows = rows.filter((row) => outboxById.has(row.outboxId));
    const missingRows = rows.filter((row) => !outboxById.has(row.outboxId));
    if (missingRows.length > 0) {
      await this.markItemsFailed(
        missingRows.map(({ id, attemptCount }) => ({ id, attemptCount })),
        'LOCAL_RESULT_MISSING',
        'The local outbox record no longer exists.',
        false,
      );
    }
    if (validRows.length === 0) return;

    if (!(await this.isRunRunning(runId))) return;

    await this.prisma.$transaction([
      this.prisma.dongilHistorySyncItem.updateMany({
        where: { id: { in: validRows.map((row) => row.id) } },
        data: { status: DongilHistorySyncItemStatus.SENDING, localBatchId: batchId },
      }),
      this.prisma.dongilSyncOutbox.updateMany({
        where: { id: { in: validRows.map((row) => row.outboxId) } },
        data: {
          status: DongilSyncOutboxStatus.SENDING,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    ]);
    try {
      const response = await new DongilApiClient(runtime.serverUrl).sendWashingBatch(
        runtime.machineId,
        runtime.credential,
        {
          localBatchId: batchId,
          items: validRows.map((item) => {
            const source = outboxById.get(item.outboxId)!;
            return {
              localResultId: item.localResultId,
              productCode: item.productCode,
              productName: source.productName ?? item.productCode,
              result: item.result === InspectionResult.OK ? 'OK' : 'NG',
              localSessionId: item.localSessionId ?? undefined,
              inspectedAt: item.inspectedAt.toISOString(),
              okCount: item.okCount,
              ngCount: item.ngCount,
            };
          }),
        },
      );
      const outcomes = new Map(response.items.map((item) => [item.localResultId, item]));
      for (const item of validRows) {
        const outcome = outcomes.get(item.localResultId);
        if (outcome?.disposition === 'ACCEPTED' || outcome?.disposition === 'REPLAYED') {
          const disposition =
            outcome.disposition === 'ACCEPTED'
              ? DongilDeliveryDisposition.ACCEPTED
              : DongilDeliveryDisposition.REPLAYED;
          await this.prisma.$transaction([
            this.prisma.dongilHistorySyncItem.update({
              where: { id: item.id },
              data: {
                status: DongilHistorySyncItemStatus.CONFIRMED,
                deliveryDisposition: disposition,
                attemptCount: { increment: 1 },
                confirmedAt: new Date(),
                lastErrorCode: null,
                lastErrorMessage: null,
              },
            }),
            this.prisma.dongilSyncOutbox.update({
              where: { id: item.outboxId },
              data: {
                status: DongilSyncOutboxStatus.SENT,
                deliveryDisposition: disposition,
                attemptCount: { increment: 1 },
                sentAt: new Date(),
                lastErrorCode: null,
                lastErrorMessage: null,
              },
            }),
          ]);
        } else {
          await this.markItemsFailed(
            [item],
            outcome?.error?.code ?? 'DONGIL_ITEM_FAILED',
            outcome?.error?.message ?? 'Dongil Server did not confirm the item.',
            true,
          );
        }
      }
      await this.refreshRunProgress(
        runId,
        batchId,
        first.sequence,
        first.localBatchId !== null || first.attemptCount > 0,
      );
    } catch (error) {
      const code = error instanceof DongilApiError ? error.code : 'DONGIL_SERVER_UNAVAILABLE';
      this.logger.error(
        `[dongil-history.batch.failed] ${JSON.stringify({
          runId,
          localBatchId: batchId,
          batchNumber: Math.ceil(first.sequence / BATCH_LIMIT),
          itemCount: validRows.length,
          firstLocalResultId: validRows[0]?.localResultId ?? null,
          lastLocalResultId: validRows.at(-1)?.localResultId ?? null,
          error: toSafeDongilDiagnostic(error),
        })}`,
      );
      await this.markItemsFailed(validRows, code, describeError(error), false);
      await this.refreshRunProgress(
        runId,
        batchId,
        first.sequence,
        first.localBatchId !== null || first.attemptCount > 0,
      );
      if (error instanceof DongilApiError && [401, 403].includes(error.status)) {
        await this.blockRun(runId, code, describeError(error));
      }
    }
  }

  private async reconcileNextScope(
    runId: string,
    runtime: { serverUrl: string; machineId: string; credential: string },
  ) {
    if (!(await this.isRunRunning(runId))) return;
    const scope = await this.prisma.dongilHistorySyncScope.findFirst({
      where: { runId, completedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!scope) {
      await this.prisma.dongilHistorySyncRun.updateMany({
        where: { id: runId, state: DongilHistorySyncRunState.RUNNING },
        data: {
          state: DongilHistorySyncRunState.COMPLETED,
          completedAt: new Date(),
          verificationCompletedAt: new Date(),
          checkpointedAt: new Date(),
        },
      });
      return;
    }
    const client = new DongilApiClient(runtime.serverUrl);
    try {
      if (!scope.counterReconciledAt) {
        const isFinalCounterCheck = scope.idsVerifiedAt !== null;
        const counter = await client.reconcile(runtime.machineId, runtime.credential, {
          scope: scope.scope as DongilReconcileScope,
          scopeKey: scope.scopeKey,
          total: scope.total,
          ok: scope.ok,
          ng: scope.ng,
          reportedAt: new Date().toISOString(),
        });
        await this.prisma.dongilHistorySyncScope.update({
          where: { id: scope.id },
          data: { counterMatched: counter.matched, counterReconciledAt: new Date() },
        });
        if (!counter.matched && !isFinalCounterCheck) {
          await this.expandMismatchedScopeForFullVerification(
            runId,
            scope.scope,
            scope.scopeKey,
          );
        }
        if (isFinalCounterCheck && !counter.matched) {
          const message = 'Counter reconciliation still differs after every local result ID was verified.';
          await this.prisma.dongilHistorySyncScope.update({
            where: { id: scope.id },
            data: {
              lastErrorCode: 'COUNTER_MISMATCH_AFTER_ID_VERIFICATION',
              lastErrorMessage: message,
            },
          });
          await this.blockRun(
            runId,
            'COUNTER_MISMATCH_AFTER_ID_VERIFICATION',
            message,
          );
          return;
        }
      }
      const verificationWhere = this.scopeItemWhere(runId, scope.scope, scope.scopeKey, {
        status: DongilHistorySyncItemStatus.CONFIRMED,
        verifiedAt: null,
      });
      const items = await this.prisma.dongilHistorySyncItem.findMany({
        where: verificationWhere,
        orderBy: { sequence: 'asc' },
        take: BATCH_LIMIT,
      });
      if (items.length > 0) {
        const response = await client.reconcileResultIds(
          runtime.machineId,
          runtime.credential,
          items.map((item) => item.localResultId),
        );
        const present = new Set(response.presentIds);
        const missing = new Set(response.missingIds);
        let requiresAnotherCounterCheck = false;
        for (const item of items) {
          if (present.has(item.localResultId)) {
            const verifiedAt = new Date();
            await this.prisma.$transaction([
              this.prisma.dongilHistorySyncItem.update({
                where: { id: item.id },
                data: { verifiedAt },
              }),
              this.prisma.dongilSyncOutbox.update({
                where: { id: item.outboxId },
                data: { verifiedAt },
              }),
            ]);
          } else if (missing.has(item.localResultId)) {
            requiresAnotherCounterCheck = true;
            await this.prisma.$transaction([
              this.prisma.dongilHistorySyncItem.update({
                where: { id: item.id },
                data: {
                  status: DongilHistorySyncItemStatus.PENDING,
                  deliveryDisposition: null,
                  localBatchId: null,
                  verifiedAt: null,
                  nextAttemptAt: new Date(),
                  lastErrorCode: 'SERVER_RECONCILIATION_MISSING',
                  lastErrorMessage: 'The server did not contain this local result.',
                },
              }),
              this.prisma.dongilSyncOutbox.update({
                where: { id: item.outboxId },
                data: {
                  status: DongilSyncOutboxStatus.PENDING,
                  verifiedAt: null,
                  nextAttemptAt: new Date(),
                },
              }),
            ]);
          } else {
            requiresAnotherCounterCheck = true;
            await this.markItemsFailed(
              [item],
              'DONGIL_RECONCILIATION_INCOMPLETE',
              'The server did not classify the local result ID.',
              true,
            );
          }
        }
        if (requiresAnotherCounterCheck) {
          await this.prisma.dongilHistorySyncScope.update({
            where: { id: scope.id },
            data: { counterReconciledAt: null, idsVerifiedAt: null },
          });
        } else {
          const unverifiedCount = await this.prisma.dongilHistorySyncItem.count({
            where: verificationWhere,
          });
          if (unverifiedCount === 0) {
            await this.prisma.dongilHistorySyncScope.update({
              where: { id: scope.id },
              data: { idsVerifiedAt: new Date(), counterReconciledAt: null },
            });
          }
        }
        return;
      }
      if (!scope.idsVerifiedAt) {
        await this.prisma.dongilHistorySyncScope.update({
          where: { id: scope.id },
          data: { idsVerifiedAt: new Date(), counterReconciledAt: null },
        });
        return;
      }
      await this.prisma.dongilHistorySyncScope.update({
        where: { id: scope.id },
        data: { idsVerifiedAt: new Date(), completedAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
      });
      await this.prisma.dongilHistorySyncRun.update({
        where: { id: runId },
        data: { lastErrorCode: null, lastErrorMessage: null },
      });
    } catch (error) {
      const code = error instanceof DongilApiError ? error.code : 'DONGIL_RECONCILIATION_FAILED';
      const message = describeError(error);
      this.logger.error(
        `[dongil-history.reconcile.failed] ${JSON.stringify({
          runId,
          scope: scope.scope,
          scopeKey: scope.scopeKey,
          error: toSafeDongilDiagnostic(error),
        })}`,
      );
      await this.prisma.dongilHistorySyncScope.update({
        where: { id: scope.id },
        data: { lastErrorCode: code, lastErrorMessage: message.slice(0, 500) },
      });
      await this.prisma.dongilHistorySyncRun.update({
        where: { id: runId },
        data: { lastErrorCode: code, lastErrorMessage: message.slice(0, 500) },
      });
      if (error instanceof DongilApiError && [401, 403].includes(error.status)) {
        await this.blockRun(runId, code, message);
      }
    }
  }

  private async expandMismatchedScopeForFullVerification(
    runId: string,
    scope: string,
    scopeKey: string,
  ) {
    const outboxScopeWhere: Prisma.DongilSyncOutboxWhereInput =
      scope === 'SESSION'
        ? { localSessionId: scopeKey }
        : (() => {
            const { from, to } = dayRange(scopeKey);
            return {
              localSessionId: null,
              inspectedAt: { gte: from, lt: to },
            };
          })();
    const eligibleWhere: Prisma.DongilSyncOutboxWhereInput = {
      ...outboxScopeWhere,
      result: { in: [InspectionResult.OK, InspectionResult.NG] },
      okCount: { not: null },
      ngCount: { not: null },
    };
    const [scopeRows, existingItems, sequenceAggregate] = await Promise.all([
      this.prisma.dongilSyncOutbox.findMany({
        where: eligibleWhere,
        orderBy: [{ inspectedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.dongilHistorySyncItem.findMany({
        where: this.scopeItemWhere(runId, scope, scopeKey, {}),
        select: { outboxId: true },
      }),
      this.prisma.dongilHistorySyncItem.aggregate({
        where: { runId },
        _max: { sequence: true },
      }),
    ]);
    const existingOutboxIds = new Set(existingItems.map((item) => item.outboxId));
    const missingRows = scopeRows.filter((row) => !existingOutboxIds.has(row.id));
    let nextSequence = (sequenceAggregate._max.sequence ?? 0) + 1;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.dongilSyncOutbox.updateMany({
        where: eligibleWhere,
        data: { verifiedAt: null },
      });
      await transaction.dongilHistorySyncItem.updateMany({
        where: this.scopeItemWhere(runId, scope, scopeKey, {}),
        data: { verifiedAt: null },
      });

      for (let index = 0; index < missingRows.length; index += BATCH_LIMIT) {
        const chunk = missingRows.slice(index, index + BATCH_LIMIT);
        await transaction.dongilHistorySyncItem.createMany({
          data: chunk.map((row) => ({
            runId,
            outboxId: row.id,
            localResultId: row.localResultId,
            inspectedAt: row.inspectedAt,
            localSessionId: row.localSessionId,
            productCode: row.productCode,
            result: row.result,
            okCount: row.okCount!,
            ngCount: row.ngCount!,
            sequence: nextSequence++,
            status:
              row.status === DongilSyncOutboxStatus.SENT
                ? DongilHistorySyncItemStatus.CONFIRMED
                : DongilHistorySyncItemStatus.PENDING,
            confirmedAt:
              row.status === DongilSyncOutboxStatus.SENT
                ? row.sentAt ?? new Date()
                : null,
          })),
        });
      }

      if (missingRows.length > 0) {
        await transaction.dongilHistorySyncRun.update({
          where: { id: runId },
          data: {
            snapshotTotal: { increment: missingRows.length },
            snapshotConfirmed: {
              increment: missingRows.filter(
                (row) => row.status === DongilSyncOutboxStatus.SENT,
              ).length,
            },
            uploadTotal: {
              increment: missingRows.filter(
                (row) => row.status !== DongilSyncOutboxStatus.SENT,
              ).length,
            },
          },
        });
      }
    });
  }

  private async markItemsFailed(
    items: Array<{ id: string; outboxId?: string; attemptCount: number }>,
    code: string,
    message: string,
    createNewBatchOnRetry: boolean,
  ) {
    await Promise.all(
      items.map((item) => {
        const nextAttemptAt = nextRetryAt(item.attemptCount + 1);
        const historyUpdate = this.prisma.dongilHistorySyncItem.update({
          where: { id: item.id },
          data: {
            status: DongilHistorySyncItemStatus.FAILED,
            attemptCount: { increment: 1 },
            ...(createNewBatchOnRetry ? { localBatchId: null } : {}),
            nextAttemptAt,
            lastErrorCode: code,
            lastErrorMessage: message.slice(0, 500),
          },
        });
        if (!item.outboxId) return historyUpdate;
        return this.prisma.$transaction([
          historyUpdate,
          this.prisma.dongilSyncOutbox.update({
            where: { id: item.outboxId },
            data: {
              status: DongilSyncOutboxStatus.FAILED,
              attemptCount: { increment: 1 },
              nextAttemptAt,
              lastErrorCode: code,
              lastErrorMessage: message.slice(0, 500),
            },
          }),
        ]);
      }),
    );
  }

  private async refreshRunProgress(
    runId: string,
    batchId: string,
    firstSequence: number,
    isRetry: boolean,
  ) {
    const [confirmed, accepted, replayed, failed, latestFailure] = await Promise.all([
      this.prisma.dongilHistorySyncItem.count({
        where: { runId, status: DongilHistorySyncItemStatus.CONFIRMED },
      }),
      this.prisma.dongilHistorySyncItem.count({
        where: { runId, deliveryDisposition: DongilDeliveryDisposition.ACCEPTED },
      }),
      this.prisma.dongilHistorySyncItem.count({
        where: { runId, deliveryDisposition: DongilDeliveryDisposition.REPLAYED },
      }),
      this.prisma.dongilHistorySyncItem.count({
        where: { runId, status: DongilHistorySyncItemStatus.FAILED },
      }),
      this.prisma.dongilHistorySyncItem.findFirst({
        where: { runId, status: DongilHistorySyncItemStatus.FAILED },
        orderBy: { updatedAt: 'desc' },
        select: { lastErrorCode: true, lastErrorMessage: true },
      }),
    ]);
    await this.prisma.dongilHistorySyncRun.update({
      where: { id: runId },
      data: {
        snapshotConfirmed: confirmed,
        acceptedCount: accepted,
        replayedCount: replayed,
        failedCount: failed,
        currentBatch: Math.ceil(firstSequence / BATCH_LIMIT),
        lastBatchId: batchId,
        ...(isRetry ? { lastRetryAt: new Date() } : {}),
        lastErrorCode: latestFailure?.lastErrorCode ?? null,
        lastErrorMessage: latestFailure?.lastErrorMessage ?? null,
        checkpointedAt: new Date(),
      },
    });
  }

  private async backfillHistoricalOutbox() {
    const captures = await this.prisma.$queryRaw<HistoricalCapture[]>(Prisma.sql`
      SELECT
        log."plcCaptureId" AS "plcCaptureId",
        log."jobId" AS "jobId",
        MIN(log."capturedAt") AS "inspectedAt",
        product."code" AS "productCode",
        product."name" AS "productName",
        COUNT(*) FILTER (WHERE log."result" = 'OK')::int AS "okCount",
        COUNT(*) FILTER (WHERE log."result" = 'NG')::int AS "ngCount"
      FROM "InspectionLog" AS log
      INNER JOIN "InspectionJob" AS job ON job."id" = log."jobId"
      INNER JOIN "Product" AS product ON product."id" = job."productId"
      WHERE log."plcCaptureId" IS NOT NULL
      GROUP BY log."plcCaptureId", log."jobId", product."code", product."name"
      HAVING COUNT(*) FILTER (WHERE log."result" IN ('OK', 'NG')) > 0
      ORDER BY MIN(log."capturedAt") ASC, log."plcCaptureId" ASC
    `);
    for (let index = 0; index < captures.length; index += BATCH_LIMIT) {
      const chunk = captures.slice(index, index + BATCH_LIMIT);
      const existingRows = await this.prisma.dongilSyncOutbox.findMany({
        where: {
          localResultId: { in: chunk.map((capture) => capture.plcCaptureId) },
        },
      });
      const existingByResultId = new Map(
        existingRows.map((row) => [row.localResultId, row]),
      );
      const writes = chunk.flatMap((capture) => {
        const existing = existingByResultId.get(capture.plcCaptureId);
        const productName = capture.productName ?? capture.productCode;
        const result =
          capture.ngCount > 0 ? InspectionResult.NG : InspectionResult.OK;

        if (!existing) {
          return [
            this.prisma.dongilSyncOutbox.create({
              data: {
                localResultId: capture.plcCaptureId,
                productCode: capture.productCode,
                productName,
                profileVersion: null,
                modelVersion: null,
                result,
                okCount: capture.okCount,
                ngCount: capture.ngCount,
                localSessionId: capture.jobId,
                inspectedAt: capture.inspectedAt,
                status: DongilSyncOutboxStatus.PENDING,
              },
            }),
          ];
        }

        const sourceChanged =
          existing.productCode !== capture.productCode ||
          existing.productName !== productName ||
          existing.result !== result ||
          existing.okCount !== capture.okCount ||
          existing.ngCount !== capture.ngCount ||
          existing.localSessionId !== capture.jobId ||
          existing.inspectedAt.getTime() !== capture.inspectedAt.getTime();

        if (!sourceChanged) return [];

        return [
          this.prisma.dongilSyncOutbox.update({
            where: { id: existing.id },
            data: {
              productCode: capture.productCode,
              productName,
              result,
              okCount: capture.okCount,
              ngCount: capture.ngCount,
              localSessionId: capture.jobId,
              inspectedAt: capture.inspectedAt,
              status: DongilSyncOutboxStatus.PENDING,
              deliveryDisposition: null,
              sentAt: null,
              verifiedAt: null,
              nextAttemptAt: new Date(),
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          }),
        ];
      });

      if (writes.length > 0) {
        await this.prisma.$transaction(writes);
      }
    }
    const invalidCandidates = await this.prisma.$queryRaw<
      HistoricalInvalidCandidate[]
    >(Prisma.sql`
      SELECT
        log."id" AS "sourceLogId",
        log."plcCaptureId" AS "plcCaptureId",
        log."capturedAt" AS "capturedAt",
        CASE
          WHEN log."plcCaptureId" IS NULL THEN 'MISSING_STABLE_LOCAL_RESULT_ID'
          WHEN product."id" IS NULL THEN 'MISSING_HISTORICAL_PRODUCT_SOURCE'
          ELSE 'MISSING_HISTORICAL_SOURCE'
        END AS "reason"
      FROM "InspectionLog" AS log
      LEFT JOIN "InspectionJob" AS job ON job."id" = log."jobId"
      LEFT JOIN "Product" AS product ON product."id" = job."productId"
      WHERE log."result" IN ('OK', 'NG')
        AND (
          log."plcCaptureId" IS NULL
          OR job."id" IS NULL
          OR product."id" IS NULL
        )
    `);
    if (invalidCandidates.length > 0) {
      await this.prisma.dongilHistorySyncInvalidItem.createMany({
        data: invalidCandidates.map((candidate) => ({
          sourceLogId: candidate.sourceLogId,
          plcCaptureId: candidate.plcCaptureId,
          reason: candidate.reason,
          capturedAt: candidate.capturedAt,
        })),
        skipDuplicates: true,
      });
    }
  }

  private scopeItemWhere(
    runId: string,
    scope: string,
    scopeKey: string,
    extra: Prisma.DongilHistorySyncItemWhereInput,
  ): Prisma.DongilHistorySyncItemWhereInput {
    if (scope === 'SESSION') {
      return { runId, localSessionId: scopeKey, ...extra };
    }
    const { from, to } = dayRange(scopeKey);
    return {
      runId,
      localSessionId: null,
      inspectedAt: { gte: from, lt: to },
      ...extra,
    };
  }

  private async requireActiveRun() {
    const run = await this.prisma.dongilHistorySyncRun.findFirst({
      where: {
        state: {
          in: [
            DongilHistorySyncRunState.PREPARING,
            DongilHistorySyncRunState.RUNNING,
            DongilHistorySyncRunState.PAUSED,
            DongilHistorySyncRunState.BLOCKED,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!run) throw new BadRequestException('No active Dongil history synchronization run exists.');
    return run;
  }

  private assertRuntimeAvailable() {
    if (!this.dongilSync.getRuntimeForHistorySync()) {
      throw new BadRequestException('Connect to Dongil Server before synchronizing history.');
    }
  }

  private async blockRun(runId: string, code: string, message: string) {
    await this.prisma.dongilHistorySyncRun.updateMany({
      where: { id: runId, state: DongilHistorySyncRunState.RUNNING },
      data: { state: DongilHistorySyncRunState.BLOCKED, lastErrorCode: code, lastErrorMessage: message.slice(0, 500) },
    });
  }

  private async isRunRunning(runId: string) {
    if (this.cancellationRequests.has(runId)) return false;
    const run = await this.prisma.dongilHistorySyncRun.findUnique({
      where: { id: runId },
      select: { state: true },
    });
    return run?.state === DongilHistorySyncRunState.RUNNING;
  }

  private async acquireLease() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_MS);
    const result = await this.prisma.dongilSyncWorkerLease.updateMany({
      where: {
        id: LEASE_ID,
        OR: [{ expiresAt: null }, { expiresAt: { lte: now } }, { ownerId: this.workerId }],
      },
      data: { ownerId: this.workerId, expiresAt },
    });
    return result.count === 1;
  }

  private async releaseLease() {
    await this.prisma.dongilSyncWorkerLease.updateMany({
      where: { id: LEASE_ID, ownerId: this.workerId },
      data: { ownerId: null, expiresAt: null },
    });
  }
}

function resolveScope(localSessionId: string | null, inspectedAt: Date) {
  if (localSessionId) return { scope: 'SESSION' as const, scopeKey: localSessionId };
  return { scope: 'DAY' as const, scopeKey: formatVietnamDate(inspectedAt) };
}

function formatVietnamDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayRange(scopeKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scopeKey)) {
    throw new BadRequestException('Invalid history synchronization day scope.');
  }
  const [year, month, day] = scopeKey.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0));
  const to = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
  return { from, to };
}

function nextRetryAt(attempt: number) {
  const delay = Math.min(5_000 * 2 ** Math.min(attempt, 7), 10 * 60_000);
  return new Date(Date.now() + delay + Math.floor(Math.random() * 2_000));
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown Dongil history synchronization error';
}

function toSafeDongilDiagnostic(error: unknown) {
  if (error instanceof DongilApiError) {
    return {
      type: 'DongilApiError',
      path: error.path,
      httpStatus: error.status,
      code: error.code,
      message: error.message,
      responseBody: redactDiagnosticBody(error.responseBody),
    };
  }

  return {
    type: error instanceof Error ? error.name : 'UnknownError',
    message: describeError(error),
  };
}

function redactDiagnosticBody(value: string | null) {
  if (!value) return null;
  return value
    .slice(0, 4_000)
    .replace(
      /("?(?:authorization|credential|token|password|secret)"?\s*[:=]\s*")([^"]*)(")/gi,
      '$1[REDACTED]$3',
    );
}
