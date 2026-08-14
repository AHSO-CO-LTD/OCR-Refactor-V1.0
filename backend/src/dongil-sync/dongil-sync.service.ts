import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  DongilSyncOutboxStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../database/prisma.service';
import { MachineRuntimeService, type MachineRuntimeState } from '../plc/machine-runtime.service';
import {
  DongilApiClient,
  DongilApiError,
  type DongilBatchItem,
  type DongilMachineConfig,
} from './dongil-api.client';
import type { BootstrapDongilSyncDto } from './dto/bootstrap-dongil-sync.dto';

const CONFIGURATION_ID = 'default';
const WORKER_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const CONFIGURATION_ERROR_CODES = new Set([
  'PRODUCT_NOT_FOUND',
  'PROFILE_VERSION_NOT_FOUND',
  'MODEL_VERSION_NOT_FOUND',
  'MODEL_VERSION_AMBIGUOUS',
]);

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown Dongil Server error';
}

type RuntimeConfiguration = {
  serverUrl: string;
  machineId: string;
  machineTypeCode: string;
  licenseStatus: 'LICENSED' | 'UNLICENSED';
  appVersion?: string;
  credential: string;
};

type DongilConnectionState =
  | 'DISABLED'
  | 'CONNECTING'
  | 'ONLINE'
  | 'RETRYING'
  | 'ERROR'
  | 'UNAUTHORIZED';

export type DongilOperationalStatus =
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'STARTING'
  | 'STOPPING'
  | 'ERROR'
  | 'UNKNOWN';

export function normalizeDongilOperationalStatus(state: MachineRuntimeState): DongilOperationalStatus {
  switch (state) {
    case 'running':
      return 'RUNNING';
    case 'idle_machine_stop':
    case 'idle_capture_timeout':
      return 'PAUSED';
    case 'inactive':
      return 'STOPPED';
    case 'resuming':
    case 'waiting_camera':
      return 'STARTING';
    case 'stopping':
      return 'STOPPING';
    case 'restart_required':
    case 'error':
      return 'ERROR';
    default:
      return 'UNKNOWN';
  }
}

@Injectable()
export class DongilSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DongilSyncService.name);
  private runtime: RuntimeConfiguration | null = null;
  private socket: Socket | null = null;
  private socketIdentityKey: string | null = null;
  private workerTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private workerRunning = false;
  private bootstrapPromise: Promise<{ data: unknown }> | null = null;
  private connectionState: DongilConnectionState = 'DISABLED';
  private lastConnectedAt: Date | null = null;
  private lastHeartbeatAckAt: Date | null = null;
  private lastErrorMessage: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    await this.prisma.dongilSyncOutbox.updateMany({
      where: { status: DongilSyncOutboxStatus.SENDING },
      data: { status: DongilSyncOutboxStatus.PENDING, nextAttemptAt: new Date() },
    });
    this.workerTimer = setInterval(() => void this.flushOutbox(), WORKER_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    await this.shutdownConnection();
  }

  async shutdownConnection() {
    this.clearHeartbeat();
    if (this.socket?.connected) {
      try {
        await this.socket.timeout(1_500).emitWithAck('machine:shutdown', {
          reason: 'APPLICATION_SHUTDOWN',
        });
      } catch {
        this.logger.warn('Dongil graceful shutdown acknowledgement timed out.');
      }
    }
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.socketIdentityKey = null;
    this.runtime = null;
    this.connectionState = 'DISABLED';
    return { data: { state: 'SHUTDOWN_SENT' } };
  }

  bootstrap(dto: BootstrapDongilSyncDto) {
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.connectionState = 'CONNECTING';
    this.lastErrorMessage = null;
    this.bootstrapPromise = this.performBootstrap(dto)
      .catch((error) => {
        this.connectionState = 'ERROR';
        this.lastErrorMessage = describeError(error);
        throw error;
      })
      .finally(() => {
        this.bootstrapPromise = null;
      });
    return this.bootstrapPromise;
  }

  async getStatus() {
    const [configuration, pendingSyncCount, latestFailure] = await Promise.all([
      this.prisma.dongilSyncConfiguration.findUnique({ where: { id: CONFIGURATION_ID } }),
      this.prisma.dongilSyncOutbox.count({
        where: { status: { not: DongilSyncOutboxStatus.SENT } },
      }),
      this.prisma.dongilSyncOutbox.findFirst({
        where: { lastErrorMessage: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { lastErrorCode: true, lastErrorMessage: true, updatedAt: true },
      }),
    ]);
    const machineRuntime = this.getMachineRuntimeStatus();
    return {
      data: {
        state: this.connectionState,
        socketConnected: this.socket?.connected === true,
        serverUrl: this.runtime?.serverUrl ?? configuration?.serverUrl ?? null,
        machineId: this.runtime?.machineId ?? configuration?.machineId ?? null,
        machineTypeCode: this.runtime?.machineTypeCode ?? configuration?.machineTypeCode ?? null,
        assignedMachineTypeCode: configuration?.assignedMachineTypeCode ?? null,
        licenseStatus: this.runtime?.licenseStatus ?? configuration?.licenseStatus ?? null,
        operationalStatus: normalizeDongilOperationalStatus(machineRuntime.state),
        runtimeStatus: machineRuntime.state,
        pendingSyncCount,
        lastConnectedAt: this.lastConnectedAt,
        lastHeartbeatAckAt: this.lastHeartbeatAckAt,
        lastRegisteredAt: configuration?.lastRegisteredAt ?? null,
        lastConfigSyncAt: configuration?.lastConfigSyncAt ?? null,
        lastError: this.lastErrorMessage
          ? { code: 'DONGIL_CONNECTION_ERROR', message: this.lastErrorMessage, at: new Date() }
          : latestFailure
            ? {
                code: latestFailure.lastErrorCode,
                message: latestFailure.lastErrorMessage,
                at: latestFailure.updatedAt,
              }
            : null,
      },
    };
  }

  async testConnection(serverUrl: string) {
    const normalized = this.normalizeServerUrl(serverUrl);
    const startedAt = Date.now();
    const response = await fetch(`${normalized}/api/v1/health`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`Dongil Server health check failed with HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as { data?: { status?: unknown } };
    if (payload.data?.status !== 'ok') {
      throw new Error('Dongil Server health response is not ready.');
    }
    return {
      data: {
        serverUrl: normalized,
        reachable: true,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async enqueueCapture(
    transaction: Prisma.TransactionClient,
    input: {
      localResultId: string;
      productCode: string;
      result: 'OK' | 'NG';
      okCount: number;
      ngCount: number;
      localSessionId: string;
      inspectedAt: Date;
    },
  ) {
    const assignment = await transaction.dongilProductAssignment.findUnique({
      where: { productCode: input.productCode },
    });
    await transaction.dongilSyncOutbox.create({
      data: {
        localResultId: input.localResultId,
        productCode: input.productCode,
        profileVersion: assignment?.profileVersion,
        modelVersion: assignment?.modelVersion,
        result: input.result,
        okCount: input.okCount,
        ngCount: input.ngCount,
        localSessionId: input.localSessionId,
        inspectedAt: input.inspectedAt,
        status: assignment
          ? DongilSyncOutboxStatus.PENDING
          : DongilSyncOutboxStatus.BLOCKED_CONFIG,
        lastErrorCode: assignment ? null : 'MACHINE_CONFIG_NOT_AVAILABLE',
        lastErrorMessage: assignment
          ? null
          : 'No server-assigned profile/model tuple was available at inspection time.',
      },
    });
  }

  private async performBootstrap(dto: BootstrapDongilSyncDto) {
    const serverUrl = this.normalizeServerUrl(dto.serverUrl);
    await this.prisma.dongilSyncConfiguration.upsert({
      where: { id: CONFIGURATION_ID },
      create: {
        id: CONFIGURATION_ID,
        serverUrl,
        machineId: dto.machineId,
        machineTypeCode: dto.machineTypeCode,
        licenseStatus: dto.licenseStatus,
      },
      update: {
        serverUrl,
        machineId: dto.machineId,
        machineTypeCode: dto.machineTypeCode,
        licenseStatus: dto.licenseStatus,
      },
    });

    if (dto.licenseStatus !== 'LICENSED') {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState = 'UNAUTHORIZED';
      return { data: { state: 'UNAUTHORIZED', issuedCredential: null } };
    }

    const client = new DongilApiClient(serverUrl);
    let credential = dto.credential?.trim() || null;
    let issuedCredential: string | null = null;
    let config: DongilMachineConfig | null = null;

    if (credential) {
      try {
        config = await client.getCurrentConfig(dto.machineId, credential);
      } catch (error) {
        if (!(error instanceof DongilApiError) || ![401, 403].includes(error.status)) {
          throw error;
        }
        credential = null;
      }
    }

    if (!credential) {
      const registration = await client.register({
        machineId: dto.machineId,
        machineTypeCode: dto.machineTypeCode,
        licenseStatus: dto.licenseStatus,
        appVersion: dto.appVersion,
      });
      issuedCredential = registration.credential;
      credential = registration.credential;
      if (!credential) {
        this.disconnectSocket();
        this.runtime = null;
        this.connectionState = 'ERROR';
        return {
          data: {
            state: 'NEEDS_CREDENTIAL_RECOVERY',
            issuedCredential: null,
            assignedMachineTypeCode: registration.assignedMachineTypeCode,
          },
        };
      }
    }

    this.runtime = {
      serverUrl,
      machineId: dto.machineId,
      machineTypeCode: dto.machineTypeCode,
      licenseStatus: dto.licenseStatus,
      appVersion: dto.appVersion,
      credential,
    };
    if (!config) {
      try {
        config = await client.getCurrentConfig(dto.machineId, credential);
      } catch (error) {
        if (!issuedCredential) throw error;
        this.logger.warn(
          `Dongil credential was issued, but initial config sync failed: ${describeError(error)}`,
        );
        await this.prisma.dongilSyncConfiguration.update({
          where: { id: CONFIGURATION_ID },
          data: { lastRegisteredAt: new Date() },
        });
        this.connectSocket();
        return {
          data: {
            state: 'REGISTERED_CONFIG_PENDING',
            issuedCredential,
          },
        };
      }
    }
    await this.persistAssignments(config);
    if (config.assignedMachineType.code !== dto.machineTypeCode) {
      this.logger.warn(
        `Dongil machine type mismatch: local=${dto.machineTypeCode}; assigned=${config.assignedMachineType.code}`,
      );
    }
    await this.prisma.dongilSyncConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: {
        assignedMachineTypeCode: config.assignedMachineType.code,
        lastRegisteredAt: new Date(),
        lastConfigSyncAt: new Date(),
      },
    });
    this.connectSocket();
    void this.flushOutbox();
    return {
      data: {
        state: 'READY',
        issuedCredential,
        assignedMachineTypeCode: config.assignedMachineType.code,
        assignmentCount: config.assignments.length,
      },
    };
  }

  private async persistAssignments(config: DongilMachineConfig) {
    const productCodes = config.assignments.map((assignment) => assignment.product.code);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.dongilProductAssignment.deleteMany({
        where: productCodes.length > 0 ? { productCode: { notIn: productCodes } } : {},
      });
      for (const assignment of config.assignments) {
        const assignedAt = new Date(assignment.assignedAt);
        await transaction.dongilProductAssignment.upsert({
          where: { productCode: assignment.product.code },
          create: {
            productCode: assignment.product.code,
            profileVersion: assignment.profile.version,
            modelVersion: assignment.model.version,
            assignedAt,
          },
          update: {
            profileVersion: assignment.profile.version,
            modelVersion: assignment.model.version,
            assignedAt,
            syncedAt: new Date(),
          },
        });
        await transaction.dongilSyncOutbox.updateMany({
          where: {
            productCode: assignment.product.code,
            status: DongilSyncOutboxStatus.BLOCKED_CONFIG,
            profileVersion: null,
            modelVersion: null,
            inspectedAt: { gte: assignedAt },
          },
          data: {
            profileVersion: assignment.profile.version,
            modelVersion: assignment.model.version,
            status: DongilSyncOutboxStatus.PENDING,
            nextAttemptAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
      }
    });
  }

  private connectSocket() {
    const runtime = this.runtime;
    if (!runtime) return;
    const identityKey = `${runtime.serverUrl}\u0000${runtime.machineId}\u0000${runtime.credential}`;
    if (this.socket && this.socketIdentityKey === identityKey) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }
    this.disconnectSocket();
    const socket = io(`${runtime.serverUrl}/machine-channel`, {
      transports: ['websocket'],
      auth: {
        machineId: runtime.machineId,
        credential: runtime.credential,
        appVersion: runtime.appVersion,
      },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.4,
    });
    this.socket = socket;
    this.socketIdentityKey = identityKey;
    socket.on('server:accepted', (payload: { heartbeatIntervalMs?: unknown }) => {
      this.connectionState = 'ONLINE';
      this.lastConnectedAt = new Date();
      this.lastErrorMessage = null;
      socket.emit('machine:hello', {
        machineTypeCode: runtime.machineTypeCode,
        licenseStatus: runtime.licenseStatus,
        appVersion: runtime.appVersion,
      });
      const interval =
        typeof payload?.heartbeatIntervalMs === 'number' && payload.heartbeatIntervalMs >= 1_000
          ? payload.heartbeatIntervalMs
          : DEFAULT_HEARTBEAT_INTERVAL_MS;
      this.startHeartbeat(interval);
    });
    socket.on('server:heartbeat-ack', () => {
      this.connectionState = 'ONLINE';
      this.lastHeartbeatAckAt = new Date();
      this.lastErrorMessage = null;
    });
    socket.on('server:rejected', (payload: { message?: unknown }) => {
      this.connectionState = 'ERROR';
      this.lastErrorMessage =
        typeof payload?.message === 'string' ? payload.message : 'Dongil Server rejected the socket.';
    });
    socket.on('disconnect', () => {
      this.clearHeartbeat();
      if (this.runtime) this.connectionState = 'RETRYING';
    });
    socket.on('connect_error', (error: Error) => {
      this.connectionState = 'RETRYING';
      this.lastErrorMessage = error.message;
      this.logger.warn(`Dongil WebSocket connection failed: ${error.message}`);
    });
  }

  private startHeartbeat(intervalMs: number) {
    this.clearHeartbeat();
    const send = () => void this.sendHeartbeat();
    send();
    this.heartbeatTimer = setInterval(send, intervalMs);
  }

  private async sendHeartbeat() {
    if (!this.socket?.connected || !this.runtime) return;
    const pendingSyncCount = await this.prisma.dongilSyncOutbox.count({
      where: { status: { not: DongilSyncOutboxStatus.SENT } },
    });
    const machineRuntime = this.getMachineRuntimeStatus();
    this.socket.emit('machine:heartbeat', {
      machineTypeCode: this.runtime.machineTypeCode,
      licenseStatus: this.runtime.licenseStatus,
      runtimeStatus: machineRuntime.state,
      operationalStatus: normalizeDongilOperationalStatus(machineRuntime.state),
      pendingSyncCount,
    });
  }

  private async flushOutbox() {
    if (this.workerRunning || !this.runtime) return;
    this.workerRunning = true;
    try {
      const rows = await this.prisma.dongilSyncOutbox.findMany({
        where: {
          status: { in: [DongilSyncOutboxStatus.PENDING, DongilSyncOutboxStatus.FAILED] },
          nextAttemptAt: { lte: new Date() },
          profileVersion: { not: null },
          modelVersion: { not: null },
        },
        orderBy: [{ inspectedAt: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      if (rows.length === 0) return;
      const ids = rows.map((row) => row.id);
      await this.prisma.dongilSyncOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: DongilSyncOutboxStatus.SENDING },
      });
      const client = new DongilApiClient(this.runtime.serverUrl);
      const washingRows = rows.filter((row) => row.okCount !== null && row.ngCount !== null);
      const legacyRows = rows.filter((row) => row.okCount === null || row.ngCount === null);
      if (washingRows.length > 0) {
        const keepRunning = await this.sendOutboxGroup(washingRows, () =>
          client.sendWashingBatch(this.runtime!.machineId, this.runtime!.credential, {
            localBatchId: randomUUID(),
            items: washingRows.map((row) => ({
              ...this.toResultPayload(row),
              okCount: row.okCount!,
              ngCount: row.ngCount!,
            })),
          }),
        );
        if (!keepRunning) return;
      }
      if (legacyRows.length > 0) {
        await this.sendOutboxGroup(legacyRows, () =>
          client.sendBatch(this.runtime!.machineId, this.runtime!.credential, {
            localBatchId: randomUUID(),
            items: legacyRows.map((row) => this.toResultPayload(row)),
          }),
        );
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private toResultPayload(row: {
    localResultId: string;
    productCode: string;
    profileVersion: number | null;
    modelVersion: string | null;
    result: string;
    localSessionId: string | null;
    inspectedAt: Date;
  }) {
    return {
      localResultId: row.localResultId,
      productCode: row.productCode,
      profileVersion: row.profileVersion!,
      modelVersion: row.modelVersion!,
      result: row.result === 'OK' ? ('OK' as const) : ('NG' as const),
      localSessionId: row.localSessionId ?? undefined,
      inspectedAt: row.inspectedAt.toISOString(),
    };
  }

  private async sendOutboxGroup(
    rows: Array<{ id: string; localResultId: string; attemptCount: number }>,
    send: () => Promise<{ items: DongilBatchItem[] }>,
  ): Promise<boolean> {
    try {
      const response = await send();
      const outcomes = new Map(response.items.map((item) => [item.localResultId, item]));
      for (const row of rows) {
        await this.applyOutcome(row.id, row.attemptCount, outcomes.get(row.localResultId));
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dongil batch request failed';
      const code = error instanceof DongilApiError ? error.code : 'DONGIL_SERVER_UNAVAILABLE';
      await this.markBatchFailed(
        rows.map((row) => row.id),
        rows[0]?.attemptCount ?? 0,
        code,
        message,
      );
      if (error instanceof DongilApiError && [401, 403].includes(error.status)) {
        this.disconnectSocket();
        this.runtime = null;
        return false;
      }
      return true;
    }
  }

  private async applyOutcome(id: string, attemptCount: number, outcome?: DongilBatchItem) {
    if (outcome?.disposition === 'ACCEPTED' || outcome?.disposition === 'REPLAYED') {
      await this.prisma.dongilSyncOutbox.update({
        where: { id },
        data: {
          status: DongilSyncOutboxStatus.SENT,
          attemptCount: { increment: 1 },
          sentAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      return;
    }
    const code = outcome?.error?.code || 'DONGIL_ITEM_FAILED';
    const blocked = CONFIGURATION_ERROR_CODES.has(code);
    await this.prisma.dongilSyncOutbox.update({
      where: { id },
      data: {
        status: blocked ? DongilSyncOutboxStatus.BLOCKED_CONFIG : DongilSyncOutboxStatus.FAILED,
        attemptCount: { increment: 1 },
        nextAttemptAt: this.nextRetryAt(attemptCount + 1),
        lastErrorCode: code,
        lastErrorMessage: outcome?.error?.message || 'Dongil Server rejected the item.',
      },
    });
  }

  private async markBatchFailed(
    ids: string[],
    attemptCount: number,
    code: string,
    message: string,
  ) {
    await this.prisma.dongilSyncOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: DongilSyncOutboxStatus.FAILED,
        attemptCount: { increment: 1 },
        nextAttemptAt: this.nextRetryAt(attemptCount + 1),
        lastErrorCode: code,
        lastErrorMessage: message.slice(0, 500),
      },
    });
  }

  private nextRetryAt(attempt: number) {
    const base = Math.min(5_000 * 2 ** Math.min(attempt, 7), 10 * 60_000);
    return new Date(Date.now() + base + Math.floor(Math.random() * 2_000));
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private disconnectSocket() {
    this.clearHeartbeat();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.socketIdentityKey = null;
  }

  private normalizeServerUrl(value: string): string {
    const normalized = value.trim().replace(/\/+$/, '');
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      throw new Error('Dongil Server URL must use http or https and include a hostname.');
    }
    return normalized;
  }

  private getMachineRuntimeStatus(): { state: MachineRuntimeState } {
    try {
      const service = this.moduleRef.get(MachineRuntimeService, { strict: false });
      return service.getStatus().data;
    } catch {
      return { state: 'inactive' };
    }
  }

}
