import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  DongilDeliveryDisposition,
  DongilHistorySyncRunState,
  DongilSyncOutboxStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../database/prisma.service';
import {
  MachineRuntimeService,
  type MachineRuntimeState,
} from '../plc/machine-runtime.service';
import {
  classifyDongilFailure,
  DongilApiClient,
  DongilApiError,
  type DongilBatchItem,
  type DongilMachineConfig,
  type DongilRegistrationStatus,
} from './dongil-api.client';
import { LOCAL_DONGIL_MACHINE_TYPE_CODE } from './dongil-sync.constants';
import type { BootstrapDongilSyncDto } from './dto/bootstrap-dongil-sync.dto';
import type { RegistrationStatusDto } from './dto/registration-status.dto';
import type { TestDongilConnectionDto } from './dto/test-dongil-connection.dto';

const CONFIGURATION_ID = 'default';
const WORKER_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const OUTBOX_WORKER_LEASE_ID = 'default';
const OUTBOX_WORKER_LEASE_MS = 120_000;
const DONGIL_CONFIGURATION_VERSION = 2;
const CREDENTIAL_RECOVERY_ERROR_CODE = 'DONGIL_CREDENTIAL_RECOVERY_REQUIRED';
function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown Dongil Server error';
}

type RuntimeConfiguration = {
  serverUrl: string;
  machineId: string;
  machineTypeCode: typeof LOCAL_DONGIL_MACHINE_TYPE_CODE;
  licenseStatus: 'LICENSED' | 'UNLICENSED';
  appVersion?: string;
  credential: string;
};

type DongilConnectionState =
  | 'DISABLED'
  | 'REGISTRATION_PENDING'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'NEEDS_CREDENTIAL_RECOVERY'
  | 'MACHINE_TYPE_MISMATCH'
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

export function normalizeDongilOperationalStatus(
  state: MachineRuntimeState,
): DongilOperationalStatus {
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
  private readonly workerLeaseOwnerId = randomUUID();
  private runtime: RuntimeConfiguration | null = null;
  private socket: Socket | null = null;
  private socketIdentityKey: string | null = null;
  private workerTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private socketValidationRetryTimer: NodeJS.Timeout | null = null;
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
    await this.importLegacyConfiguration();
    await this.prisma.dongilSyncOutbox.updateMany({
      where: {
        status: {
          in: [DongilSyncOutboxStatus.SENDING],
        },
      },
      data: {
        status: DongilSyncOutboxStatus.PENDING,
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    this.workerTimer = setInterval(
      () => void this.flushOutbox(),
      WORKER_INTERVAL_MS,
    );
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
      .catch(async (error: unknown) => {
        const classification = classifyDongilFailure(error);
        const message = describeError(error);
        if (classification === 'CREDENTIAL_RECOVERY') {
          await this.enterCredentialRecovery(message);
        } else {
          this.connectionState =
            classification === 'RETRYABLE' ? 'RETRYING' : 'ERROR';
          this.lastErrorMessage = message;
          if (classification === 'PERMANENT') {
            await this.prisma.dongilSyncConfiguration.updateMany({
              where: { id: CONFIGURATION_ID },
              data: { autoConnectEnabled: false },
            });
          }
        }
        this.logger.warn(
          `[dongil.bootstrap.failed] ${JSON.stringify({
            classification,
            ...(error instanceof DongilApiError
              ? {
                  correlationId: error.correlationId,
                  path: error.path,
                  status: error.status,
                  code: error.code,
                }
              : { type: error instanceof Error ? error.name : 'UnknownError' }),
          })}`,
        );
        throw error;
      })
      .finally(() => {
        this.bootstrapPromise = null;
      });
    return this.bootstrapPromise;
  }

  async reconnect(dto: BootstrapDongilSyncDto, actorId: string) {
    try {
      const result = await this.bootstrap(dto);
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'dongil.connection.reconnect',
          target: CONFIGURATION_ID,
          details: {
            result: 'SUCCESS',
            machineId: dto.machineId,
            serverUrl: this.normalizeServerUrl(dto.serverUrl),
          },
        },
      });
      return result;
    } catch (error) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'dongil.connection.reconnect',
          target: CONFIGURATION_ID,
          details: {
            result: 'FAILED',
            machineId: dto.machineId,
            errorCode:
              error instanceof DongilApiError
                ? error.code
                : 'DONGIL_RECONNECT_FAILED',
          },
        },
      });
      throw error;
    }
  }

  async getStatus() {
    const [configuration, machineInfo, pendingSyncCount, latestFailure] =
      await Promise.all([
        this.prisma.dongilSyncConfiguration.findUnique({
          where: { id: CONFIGURATION_ID },
        }),
        this.prisma.dongilMachineInfo.findUnique({
          where: { id: CONFIGURATION_ID },
        }),
        this.prisma.dongilSyncOutbox.count({
          where: { status: { not: DongilSyncOutboxStatus.SENT } },
        }),
        this.prisma.dongilSyncOutbox.findFirst({
          where: { lastErrorMessage: { not: null } },
          orderBy: { updatedAt: 'desc' },
          select: {
            lastErrorCode: true,
            lastErrorMessage: true,
            updatedAt: true,
          },
        }),
      ]);
    const machineRuntime = this.getMachineRuntimeStatus();
    return {
      data: {
        state: this.connectionState,
        socketConnected: this.socket?.connected === true,
        serverUrl: this.runtime?.serverUrl ?? configuration?.serverUrl ?? null,
        machineId: this.runtime?.machineId ?? configuration?.machineId ?? null,
        machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
        assignedMachineTypeCode: configuration?.assignedMachineTypeCode ?? null,
        configVersion:
          configuration?.configVersion ?? DONGIL_CONFIGURATION_VERSION,
        configurationSource: configuration?.serverUrl
          ? configuration.legacyEnvImportedAt
            ? 'LEGACY_ENV_IMPORTED'
            : 'DATABASE'
          : 'NOT_CONFIGURED',
        machineInfo: machineInfo
          ? {
              displayName: machineInfo.displayName,
              isActive: machineInfo.isActive,
              factoryName: machineInfo.factoryName,
              lineName: machineInfo.lineName,
              stationName: machineInfo.stationName,
              lastSyncedAt: machineInfo.lastSyncedAt,
            }
          : null,
        registrationStatus: configuration?.registrationStatus ?? null,
        autoConnectEnabled: configuration?.autoConnectEnabled ?? false,
        licenseStatus:
          this.runtime?.licenseStatus ?? configuration?.licenseStatus ?? null,
        operationalStatus: normalizeDongilOperationalStatus(
          machineRuntime.state,
        ),
        runtimeStatus: machineRuntime.state,
        pendingSyncCount,
        lastConnectedAt: this.lastConnectedAt,
        lastHeartbeatAckAt: this.lastHeartbeatAckAt,
        lastRegisteredAt: configuration?.lastRegisteredAt ?? null,
        lastConfigSyncAt: configuration?.lastConfigSyncAt ?? null,
        lastError: this.lastErrorMessage
          ? {
              code: this.getConnectionErrorCode(),
              message: this.lastErrorMessage,
              at: new Date(),
            }
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

  async testConnection(dto: TestDongilConnectionDto) {
    const startedAt = Date.now();
    const stages: Array<{
      id: 'URL_VALIDATION' | 'SERVER_HEALTH' | 'REGISTRATION' | 'MACHINE_TYPE';
      status: 'PASSED' | 'FAILED' | 'SKIPPED';
      code?: string;
    }> = [];
    let normalized: string;
    try {
      normalized = this.normalizeServerUrl(dto.serverUrl);
      stages.push({ id: 'URL_VALIDATION', status: 'PASSED' });
    } catch {
      stages.push(
        {
          id: 'URL_VALIDATION',
          status: 'FAILED',
          code: 'DONGIL_URL_INVALID',
        },
        { id: 'SERVER_HEALTH', status: 'SKIPPED' },
        { id: 'REGISTRATION', status: 'SKIPPED' },
        { id: 'MACHINE_TYPE', status: 'SKIPPED' },
      );
      return {
        data: {
          serverUrl: null,
          reachable: false,
          latencyMs: Date.now() - startedAt,
          stages,
        },
      };
    }

    try {
      const response = await fetch(`${normalized}/api/v1/health`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      const payload = response.ok
        ? ((await response.json()) as { data?: { status?: unknown } })
        : null;
      if (!response.ok || payload?.data?.status !== 'ok') {
        stages.push({
          id: 'SERVER_HEALTH',
          status: 'FAILED',
          code: 'DONGIL_SERVER_HEALTH_FAILED',
        });
      } else {
        stages.push({ id: 'SERVER_HEALTH', status: 'PASSED' });
      }
    } catch {
      stages.push({
        id: 'SERVER_HEALTH',
        status: 'FAILED',
        code: 'DONGIL_SERVER_UNAVAILABLE',
      });
    }

    if (stages.some((stage) => stage.status === 'FAILED')) {
      stages.push(
        { id: 'REGISTRATION', status: 'SKIPPED' },
        { id: 'MACHINE_TYPE', status: 'SKIPPED' },
      );
      return {
        data: {
          serverUrl: normalized,
          reachable: false,
          latencyMs: Date.now() - startedAt,
          stages,
        },
      };
    }

    if (dto.machineId && dto.credential) {
      let registration: DongilRegistrationStatus;
      try {
        registration = await new DongilApiClient(
          normalized,
        ).getRegistrationStatus(dto.machineId, dto.credential);
      } catch (error) {
        const classification = classifyDongilFailure(error);
        stages.push(
          {
            id: 'REGISTRATION',
            status: 'FAILED',
            code:
              classification === 'CREDENTIAL_RECOVERY'
                ? 'DONGIL_CREDENTIAL_INVALID'
                : 'DONGIL_REGISTRATION_CHECK_FAILED',
          },
          { id: 'MACHINE_TYPE', status: 'SKIPPED' },
        );
        return {
          data: {
            serverUrl: normalized,
            reachable: true,
            latencyMs: Date.now() - startedAt,
            stages,
          },
        };
      }
      stages.push(
        registration.registrationStatus === 'APPROVED' &&
          registration.credentialReady
          ? { id: 'REGISTRATION', status: 'PASSED' }
          : {
              id: 'REGISTRATION',
              status: 'FAILED',
              code: 'DONGIL_REGISTRATION_NOT_READY',
            },
      );
      if (this.hasMachineTypeMismatch(registration.assignedMachineTypeCode)) {
        stages.push({
          id: 'MACHINE_TYPE',
          status: 'FAILED',
          code: 'DONGIL_MACHINE_TYPE_MISMATCH',
        });
      } else {
        stages.push({ id: 'MACHINE_TYPE', status: 'PASSED' });
      }
    } else {
      stages.push(
        { id: 'REGISTRATION', status: 'SKIPPED' },
        { id: 'MACHINE_TYPE', status: 'SKIPPED' },
      );
    }
    return {
      data: {
        serverUrl: normalized,
        reachable: true,
        latencyMs: Date.now() - startedAt,
        stages,
      },
    };
  }

  async configure(dto: BootstrapDongilSyncDto) {
    return this.persistConfiguration(dto);
  }

  async saveConfiguration(dto: BootstrapDongilSyncDto, actorId: string) {
    return this.persistConfiguration(dto, actorId);
  }

  private async persistConfiguration(
    dto: BootstrapDongilSyncDto,
    actorId?: string,
  ) {
    const serverUrl = this.normalizeServerUrl(dto.serverUrl);
    const persist = async (client: Prisma.TransactionClient) => {
      const existing = await client.dongilSyncConfiguration.findUnique({
        where: { id: CONFIGURATION_ID },
      });
      const identityChanged =
        !existing ||
        existing.serverUrl !== serverUrl ||
        existing.machineId !== dto.machineId;
      const configuration = await client.dongilSyncConfiguration.upsert({
        where: { id: CONFIGURATION_ID },
        create: {
          id: CONFIGURATION_ID,
          serverUrl,
          machineId: dto.machineId,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          licenseStatus: dto.licenseStatus,
          autoConnectEnabled: false,
          configVersion: DONGIL_CONFIGURATION_VERSION,
        },
        update: {
          serverUrl,
          machineId: dto.machineId,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          licenseStatus: dto.licenseStatus,
          configVersion: DONGIL_CONFIGURATION_VERSION,
          ...(identityChanged
            ? {
                registrationStatus: null,
                assignedMachineTypeCode: null,
                autoConnectEnabled: false,
              }
            : {}),
        },
      });
      if (identityChanged) {
        await client.dongilSyncOutbox.updateMany({
          where: { status: DongilSyncOutboxStatus.BLOCKED_CONFIG },
          data: {
            status: DongilSyncOutboxStatus.PENDING,
            nextAttemptAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
      }
      if (actorId) {
        await client.auditLog.create({
          data: {
            actorId,
            action: 'dongil.config.update',
            target: CONFIGURATION_ID,
            details: {
              before: existing
                ? {
                    serverUrl: existing.serverUrl,
                    machineId: existing.machineId,
                    machineTypeCode: existing.machineTypeCode,
                    licenseStatus: existing.licenseStatus,
                    autoConnectEnabled: existing.autoConnectEnabled,
                  }
                : null,
              after: {
                serverUrl: configuration.serverUrl,
                machineId: configuration.machineId,
                machineTypeCode: configuration.machineTypeCode,
                licenseStatus: configuration.licenseStatus,
                autoConnectEnabled: configuration.autoConnectEnabled,
              },
              identityChanged,
            },
          },
        });
      }
      return { configuration, identityChanged };
    };
    const { configuration, identityChanged } = await this.prisma.$transaction(
      (transaction) => persist(transaction),
    );
    if (identityChanged) {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState = 'DISABLED';
    }
    this.lastErrorMessage = null;
    return {
      data: { serverUrl: configuration.serverUrl, state: this.connectionState },
    };
  }

  getRuntimeForHistorySync() {
    if (!this.runtime || this.connectionState !== 'ONLINE') return null;
    return {
      serverUrl: this.runtime.serverUrl,
      machineId: this.runtime.machineId,
      credential: this.runtime.credential,
    };
  }

  async resetConfiguration(actorId?: string) {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.dongilSyncConfiguration.findUnique({
        where: { id: CONFIGURATION_ID },
      });
      const configuration = await transaction.dongilSyncConfiguration.upsert({
        where: { id: CONFIGURATION_ID },
        create: {
          id: CONFIGURATION_ID,
          serverUrl: null,
          machineId: null,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          licenseStatus: null,
          autoConnectEnabled: false,
          configVersion: DONGIL_CONFIGURATION_VERSION,
          legacyEnvImportedAt: new Date(),
        },
        update: {
          serverUrl: null,
          machineId: null,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          licenseStatus: null,
          assignedMachineTypeCode: null,
          registrationStatus: null,
          autoConnectEnabled: false,
          configVersion: DONGIL_CONFIGURATION_VERSION,
          legacyEnvImportedAt: existing?.legacyEnvImportedAt ?? new Date(),
          lastRegisteredAt: null,
          lastConfigSyncAt: null,
        },
      });
      await transaction.dongilProductAssignment.deleteMany();
      await transaction.dongilMachineInfo.deleteMany({
        where: { id: CONFIGURATION_ID },
      });
      if (actorId) {
        await transaction.auditLog.create({
          data: {
            actorId,
            action: 'dongil.config.reset',
            target: CONFIGURATION_ID,
            details: {
              before: existing
                ? {
                    serverUrl: existing.serverUrl,
                    machineId: existing.machineId,
                    machineTypeCode: existing.machineTypeCode,
                    licenseStatus: existing.licenseStatus,
                    assignedMachineTypeCode: existing.assignedMachineTypeCode,
                    registrationStatus: existing.registrationStatus,
                    autoConnectEnabled: existing.autoConnectEnabled,
                  }
                : null,
              after: {
                serverUrl: configuration.serverUrl,
                machineId: configuration.machineId,
                machineTypeCode: configuration.machineTypeCode,
                licenseStatus: configuration.licenseStatus,
                autoConnectEnabled: configuration.autoConnectEnabled,
              },
            },
          },
        });
      }
    });

    this.disconnectSocket();
    this.runtime = null;
    this.connectionState = 'DISABLED';
    this.lastConnectedAt = null;
    this.lastHeartbeatAckAt = null;
    this.lastErrorMessage = null;

    return { data: { state: this.connectionState } };
  }

  async disconnect() {
    this.disconnectSocket();
    this.runtime = null;
    this.connectionState = 'DISABLED';
    this.lastErrorMessage = null;
    await this.prisma.dongilSyncConfiguration.updateMany({
      where: { id: CONFIGURATION_ID },
      data: { autoConnectEnabled: false },
    });
    return { data: { state: this.connectionState } };
  }

  async requestRegistration(dto: BootstrapDongilSyncDto) {
    await this.configure(dto);
    if (dto.licenseStatus !== 'LICENSED') {
      this.connectionState = 'UNAUTHORIZED';
      return { data: { state: 'UNAUTHORIZED', registrationToken: null } };
    }
    const serverUrl = this.normalizeServerUrl(dto.serverUrl);
    const registration = await new DongilApiClient(serverUrl).register({
      machineId: dto.machineId,
      machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
      licenseStatus: dto.licenseStatus,
      appVersion: dto.appVersion,
    });
    const machineTypeMismatch = this.hasMachineTypeMismatch(
      registration.assignedMachineTypeCode,
    );
    const state: DongilConnectionState = machineTypeMismatch
      ? 'MACHINE_TYPE_MISMATCH'
      : registration.registrationStatus === 'APPROVED'
        ? registration.requiresCredentialRecovery
          ? 'NEEDS_CREDENTIAL_RECOVERY'
          : 'REGISTRATION_APPROVED'
        : registration.registrationStatus === 'REJECTED'
          ? 'REGISTRATION_REJECTED'
          : 'REGISTRATION_PENDING';
    if (machineTypeMismatch) {
      this.disconnectSocket();
      this.runtime = null;
    }
    this.connectionState = state;
    this.lastErrorMessage = machineTypeMismatch
      ? this.describeMachineTypeMismatch(registration.assignedMachineTypeCode)
      : null;
    await this.prisma.dongilSyncConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: {
        registrationStatus: registration.registrationStatus,
        assignedMachineTypeCode: registration.assignedMachineTypeCode,
        lastRegisteredAt: new Date(),
        autoConnectEnabled: false,
      },
    });
    return { data: { ...registration, state } };
  }

  async refreshRegistrationStatus(dto: RegistrationStatusDto) {
    const serverUrl = this.normalizeServerUrl(dto.serverUrl);
    const registration = await new DongilApiClient(
      serverUrl,
    ).getRegistrationStatus(dto.machineId, dto.registrationToken);
    await this.persistMachineInfo({
      serverUrl,
      machineId: dto.machineId,
      registration,
    });
    const machineTypeMismatch = this.hasMachineTypeMismatch(
      registration.assignedMachineTypeCode,
    );
    const state: DongilConnectionState = machineTypeMismatch
      ? 'MACHINE_TYPE_MISMATCH'
      : registration.registrationStatus === 'APPROVED'
        ? registration.credentialReady
          ? 'REGISTRATION_APPROVED'
          : 'NEEDS_CREDENTIAL_RECOVERY'
        : registration.registrationStatus === 'REJECTED'
          ? 'REGISTRATION_REJECTED'
          : 'REGISTRATION_PENDING';
    if (state !== 'REGISTRATION_APPROVED') {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState = state;
    } else if (this.connectionState !== 'ONLINE') {
      this.connectionState = state;
    }
    this.lastErrorMessage = machineTypeMismatch
      ? this.describeMachineTypeMismatch(registration.assignedMachineTypeCode)
      : null;
    await this.prisma.dongilSyncConfiguration.updateMany({
      where: { id: CONFIGURATION_ID, serverUrl, machineId: dto.machineId },
      data: {
        registrationStatus: registration.registrationStatus,
        assignedMachineTypeCode: registration.assignedMachineTypeCode,
        ...(state === 'REGISTRATION_APPROVED'
          ? {}
          : { autoConnectEnabled: false }),
      },
    });
    return { data: { ...registration, state } };
  }

  async enqueueCapture(
    transaction: Prisma.TransactionClient,
    input: {
      localResultId: string;
      productCode: string;
      productName?: string;
      result: 'OK' | 'NG';
      okCount: number;
      ngCount: number;
      localSessionId: string;
      inspectedAt: Date;
    },
  ) {
    await transaction.dongilSyncOutbox.create({
      data: {
        localResultId: input.localResultId,
        productCode: input.productCode,
        productName: input.productName?.trim() || input.productCode,
        profileVersion: null,
        modelVersion: null,
        result: input.result,
        okCount: input.okCount,
        ngCount: input.ngCount,
        localSessionId: input.localSessionId,
        inspectedAt: input.inspectedAt,
        status: DongilSyncOutboxStatus.PENDING,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  private async performBootstrap(dto: BootstrapDongilSyncDto) {
    const serverUrl = this.normalizeServerUrl(dto.serverUrl);
    await this.configure(dto);

    if (dto.licenseStatus !== 'LICENSED') {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState = 'UNAUTHORIZED';
      return { data: { state: 'UNAUTHORIZED' } };
    }

    const client = new DongilApiClient(serverUrl);
    const credential = dto.credential?.trim();
    if (!credential) {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState = 'REGISTRATION_PENDING';
      return { data: { state: 'REGISTRATION_PENDING' } };
    }

    const registration = await client.getRegistrationStatus(
      dto.machineId,
      credential,
    );
    await this.persistMachineInfo({
      serverUrl,
      machineId: dto.machineId,
      registration,
    });
    if (this.hasMachineTypeMismatch(registration.assignedMachineTypeCode)) {
      return this.blockMachineTypeMismatch(
        registration.assignedMachineTypeCode,
        registration.registrationStatus,
      );
    }
    if (
      registration.registrationStatus !== 'APPROVED' ||
      !registration.credentialReady
    ) {
      this.disconnectSocket();
      this.runtime = null;
      this.connectionState =
        registration.registrationStatus === 'REJECTED'
          ? 'REGISTRATION_REJECTED'
          : registration.registrationStatus === 'APPROVED'
            ? 'NEEDS_CREDENTIAL_RECOVERY'
            : 'REGISTRATION_PENDING';
      await this.prisma.dongilSyncConfiguration.update({
        where: { id: CONFIGURATION_ID },
        data: {
          registrationStatus: registration.registrationStatus,
          assignedMachineTypeCode: registration.assignedMachineTypeCode,
          autoConnectEnabled: false,
        },
      });
      return { data: { state: this.connectionState, ...registration } };
    }

    const config: DongilMachineConfig = await client.getCurrentConfig(
      dto.machineId,
      credential,
    );
    if (this.hasMachineTypeMismatch(config.assignedMachineType.code)) {
      return this.blockMachineTypeMismatch(
        config.assignedMachineType.code,
        'APPROVED',
      );
    }
    await this.persistAssignments(config);
    this.runtime = {
      serverUrl,
      machineId: dto.machineId,
      machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
      licenseStatus: dto.licenseStatus,
      appVersion: dto.appVersion,
      credential,
    };
    await this.prisma.dongilSyncConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: {
        assignedMachineTypeCode: config.assignedMachineType.code,
        registrationStatus: 'APPROVED',
        // Preserve the reconnect intent. Data delivery resumes only after the
        // socket acceptance path refreshes registration and machine type.
        autoConnectEnabled: true,
        lastRegisteredAt: new Date(),
        lastConfigSyncAt: new Date(),
      },
    });
    await this.prisma.dongilSyncOutbox.updateMany({
      where: {
        status: DongilSyncOutboxStatus.BLOCKED_CONFIG,
        lastErrorCode: CREDENTIAL_RECOVERY_ERROR_CODE,
      },
      data: {
        status: DongilSyncOutboxStatus.PENDING,
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    this.connectSocket();
    return {
      data: {
        state: 'READY',
        assignedMachineTypeCode: config.assignedMachineType.code,
        assignmentCount: config.assignments.length,
      },
    };
  }

  private hasMachineTypeMismatch(assignedMachineTypeCode: string) {
    return assignedMachineTypeCode !== LOCAL_DONGIL_MACHINE_TYPE_CODE;
  }

  private describeMachineTypeMismatch(assignedMachineTypeCode: string) {
    return `Local machine type ${LOCAL_DONGIL_MACHINE_TYPE_CODE} does not match Dongil Server assignment ${assignedMachineTypeCode}.`;
  }

  private async blockMachineTypeMismatch(
    assignedMachineTypeCode: string,
    registrationStatus: DongilRegistrationStatus['registrationStatus'] = 'APPROVED',
  ) {
    const message = this.describeMachineTypeMismatch(assignedMachineTypeCode);
    this.disconnectSocket();
    this.runtime = null;
    this.connectionState = 'MACHINE_TYPE_MISMATCH';
    this.lastErrorMessage = message;
    this.logger.warn(message);
    await this.prisma.dongilSyncConfiguration.updateMany({
      where: { id: CONFIGURATION_ID },
      data: {
        machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
        assignedMachineTypeCode,
        registrationStatus,
        autoConnectEnabled: false,
      },
    });
    return {
      data: {
        state: 'MACHINE_TYPE_MISMATCH' as const,
        assignedMachineTypeCode,
      },
    };
  }

  private async persistMachineInfo(input: {
    serverUrl: string;
    machineId: string;
    registration: DongilRegistrationStatus;
  }) {
    const existing = await this.prisma.dongilMachineInfo.findUnique({
      where: { id: CONFIGURATION_ID },
    });
    const next = {
      serverUrl: input.serverUrl,
      machineId: input.machineId,
      displayName: input.registration.displayName,
      isActive: input.registration.isActive,
      factoryName: input.registration.factoryName,
      lineName: input.registration.lineName,
      stationName: input.registration.stationName,
    };
    const changed =
      !existing ||
      existing.serverUrl !== next.serverUrl ||
      existing.machineId !== next.machineId ||
      existing.displayName !== next.displayName ||
      existing.isActive !== next.isActive ||
      existing.factoryName !== next.factoryName ||
      existing.lineName !== next.lineName ||
      existing.stationName !== next.stationName;

    if (!changed) return;

    await this.prisma.dongilMachineInfo.upsert({
      where: { id: CONFIGURATION_ID },
      create: {
        id: CONFIGURATION_ID,
        ...next,
        lastSyncedAt: new Date(),
      },
      update: {
        ...next,
        lastSyncedAt: new Date(),
      },
    });
  }

  private async persistAssignments(config: DongilMachineConfig) {
    const productCodes = config.assignments.map(
      (assignment) => assignment.product.code,
    );
    await this.prisma.$transaction(async (transaction) => {
      await transaction.dongilProductAssignment.deleteMany({
        where:
          productCodes.length > 0
            ? { productCode: { notIn: productCodes } }
            : {},
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
    socket.on(
      'server:accepted',
      (payload: {
        assignedMachineTypeCode?: unknown;
        heartbeatIntervalMs?: unknown;
      }) => {
        void this.handleSocketAccepted(socket, runtime, payload).catch(
          (error: unknown) => {
            void this.handleSocketValidationFailure(socket, error);
          },
        );
      },
    );
    socket.on('server:heartbeat-ack', (payload: unknown) => {
      const heartbeat = payload as {
        assignedMachineTypeCode?: unknown;
        machineTypeMismatch?: unknown;
      } | null;
      const assignedMachineTypeCode =
        typeof heartbeat?.assignedMachineTypeCode === 'string'
          ? heartbeat.assignedMachineTypeCode
          : null;
      if (
        heartbeat?.machineTypeMismatch === true ||
        (assignedMachineTypeCode !== null &&
          this.hasMachineTypeMismatch(assignedMachineTypeCode))
      ) {
        void this.blockMachineTypeMismatch(
          assignedMachineTypeCode ?? 'UNKNOWN',
        ).catch((error: unknown) => {
          this.logger.error(
            `Could not persist Dongil machine type mismatch: ${describeError(error)}`,
          );
        });
        return;
      }
      this.connectionState = 'ONLINE';
      this.lastHeartbeatAckAt = new Date();
      this.lastErrorMessage = null;
    });
    socket.on('server:registration-updated', (payload: unknown) => {
      const update = payload as { assignedMachineTypeCode?: unknown } | null;
      if (typeof update?.assignedMachineTypeCode !== 'string') return;
      if (this.hasMachineTypeMismatch(update.assignedMachineTypeCode)) {
        void this.blockMachineTypeMismatch(
          update.assignedMachineTypeCode,
        ).catch((error: unknown) => {
          this.logger.error(
            `Could not persist Dongil registration type mismatch: ${describeError(error)}`,
          );
        });
        return;
      }
      void this.handleSocketAccepted(socket, runtime, {
        assignedMachineTypeCode: update.assignedMachineTypeCode,
      }).catch((error: unknown) => {
        void this.handleSocketValidationFailure(socket, error);
      });
    });
    socket.on(
      'server:rejected',
      (payload: { code?: unknown; message?: unknown }) => {
        const code = typeof payload?.code === 'string' ? payload.code : null;
        this.connectionState =
          code === 'MACHINE_CREDENTIAL_INVALID'
            ? 'NEEDS_CREDENTIAL_RECOVERY'
            : 'ERROR';
        this.lastErrorMessage =
          typeof payload?.message === 'string'
            ? payload.message
            : 'Dongil Server rejected the socket.';
        if (code === 'MACHINE_CREDENTIAL_INVALID') {
          void this.enterCredentialRecovery(
            this.lastErrorMessage ?? 'Dongil machine credential is invalid.',
          ).catch((error: unknown) => {
            this.logger.error(
              `Could not persist Dongil credential recovery state: ${describeError(error)}`,
            );
          });
        }
      },
    );
    socket.on('disconnect', () => {
      this.clearHeartbeat();
      if (
        this.runtime &&
        ![
          'ERROR',
          'MACHINE_TYPE_MISMATCH',
          'NEEDS_CREDENTIAL_RECOVERY',
        ].includes(this.connectionState)
      ) {
        this.connectionState = 'RETRYING';
      }
    });
    socket.on('connect_error', (error: Error) => {
      if (
        [
          'ERROR',
          'MACHINE_TYPE_MISMATCH',
          'NEEDS_CREDENTIAL_RECOVERY',
        ].includes(this.connectionState)
      ) {
        return;
      }
      this.connectionState = 'RETRYING';
      this.lastErrorMessage = error.message;
      this.logger.warn(`Dongil WebSocket connection failed: ${error.message}`);
    });
  }

  private async handleSocketAccepted(
    socket: Socket,
    runtime: RuntimeConfiguration,
    payload: {
      assignedMachineTypeCode?: unknown;
      heartbeatIntervalMs?: unknown;
    },
  ) {
    const assignedMachineTypeCode =
      typeof payload?.assignedMachineTypeCode === 'string'
        ? payload.assignedMachineTypeCode
        : null;
    if (!assignedMachineTypeCode) {
      this.connectionState = 'ERROR';
      this.lastErrorMessage =
        'Dongil Server acceptance response is missing the assigned machine type.';
      await this.prisma.dongilSyncConfiguration.updateMany({
        where: { id: CONFIGURATION_ID },
        data: { autoConnectEnabled: false },
      });
      if (this.socket === socket) {
        this.disconnectSocket();
        this.runtime = null;
      }
      return;
    }
    if (this.hasMachineTypeMismatch(assignedMachineTypeCode)) {
      await this.blockMachineTypeMismatch(assignedMachineTypeCode);
      return;
    }

    const client = new DongilApiClient(runtime.serverUrl);
    const registration = await client.getRegistrationStatus(
      runtime.machineId,
      runtime.credential,
    );
    if (this.socket !== socket || this.runtime !== runtime) return;
    await this.persistMachineInfo({
      serverUrl: runtime.serverUrl,
      machineId: runtime.machineId,
      registration,
    });
    if (this.hasMachineTypeMismatch(registration.assignedMachineTypeCode)) {
      await this.blockMachineTypeMismatch(
        registration.assignedMachineTypeCode,
        registration.registrationStatus,
      );
      return;
    }
    if (
      registration.registrationStatus !== 'APPROVED' ||
      !registration.credentialReady
    ) {
      this.connectionState =
        registration.registrationStatus === 'REJECTED'
          ? 'REGISTRATION_REJECTED'
          : registration.registrationStatus === 'APPROVED'
            ? 'NEEDS_CREDENTIAL_RECOVERY'
            : 'REGISTRATION_PENDING';
      this.lastErrorMessage =
        this.connectionState === 'NEEDS_CREDENTIAL_RECOVERY'
          ? 'Dongil machine credential recovery is required.'
          : null;
      await this.prisma.dongilSyncConfiguration.updateMany({
        where: { id: CONFIGURATION_ID },
        data: {
          registrationStatus: registration.registrationStatus,
          assignedMachineTypeCode: registration.assignedMachineTypeCode,
          autoConnectEnabled: false,
        },
      });
      if (this.socket === socket) {
        this.disconnectSocket();
        this.runtime = null;
      }
      return;
    }

    const config = await client.getCurrentConfig(
      runtime.machineId,
      runtime.credential,
    );
    if (this.socket !== socket || this.runtime !== runtime) return;
    if (this.hasMachineTypeMismatch(config.assignedMachineType.code)) {
      await this.blockMachineTypeMismatch(
        config.assignedMachineType.code,
        'APPROVED',
      );
      return;
    }
    await this.persistAssignments(config);
    if (this.socket !== socket || this.runtime !== runtime) return;
    await this.prisma.dongilSyncConfiguration.updateMany({
      where: { id: CONFIGURATION_ID },
      data: {
        registrationStatus: 'APPROVED',
        assignedMachineTypeCode: config.assignedMachineType.code,
        autoConnectEnabled: true,
        lastConfigSyncAt: new Date(),
      },
    });
    if (this.socket !== socket || this.runtime !== runtime) return;

    this.connectionState = 'ONLINE';
    this.lastConnectedAt = new Date();
    this.lastErrorMessage = null;
    socket.emit('machine:hello', {
      machineTypeCode: runtime.machineTypeCode,
      licenseStatus: runtime.licenseStatus,
      appVersion: runtime.appVersion,
    });
    const interval =
      typeof payload?.heartbeatIntervalMs === 'number' &&
      payload.heartbeatIntervalMs >= 1_000
        ? payload.heartbeatIntervalMs
        : DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.startHeartbeat(interval);
    void this.flushOutbox();
  }

  private async handleSocketValidationFailure(socket: Socket, error: unknown) {
    if (this.socket !== socket) return;
    const classification = classifyDongilFailure(error);
    const message = describeError(error);
    const diagnostic =
      error instanceof DongilApiError
        ? {
            correlationId: error.correlationId,
            path: error.path,
            status: error.status,
            code: error.code,
          }
        : { type: error instanceof Error ? error.name : 'UnknownError' };
    this.logger.warn(
      `[dongil.socket.validation.failed] ${JSON.stringify({ classification, ...diagnostic })}`,
    );
    if (classification === 'CREDENTIAL_RECOVERY') {
      await this.enterCredentialRecovery(message);
      return;
    }
    if (classification === 'PERMANENT') {
      this.connectionState = 'ERROR';
      this.lastErrorMessage = message;
      await this.prisma.dongilSyncConfiguration.updateMany({
        where: { id: CONFIGURATION_ID },
        data: { autoConnectEnabled: false },
      });
      if (this.socket === socket) {
        this.disconnectSocket();
        this.runtime = null;
      }
      return;
    }

    this.connectionState = 'RETRYING';
    this.lastErrorMessage = message;
    this.clearHeartbeat();
    socket.disconnect();
    if (this.socketValidationRetryTimer) {
      clearTimeout(this.socketValidationRetryTimer);
    }
    this.socketValidationRetryTimer = setTimeout(() => {
      this.socketValidationRetryTimer = null;
      if (this.socket === socket && this.runtime) socket.connect();
    }, 2_000);
  }

  private async enterCredentialRecovery(message: string) {
    this.connectionState = 'NEEDS_CREDENTIAL_RECOVERY';
    this.lastErrorMessage = message;
    this.disconnectSocket();
    this.runtime = null;
    await this.prisma.dongilSyncConfiguration.updateMany({
      where: { id: CONFIGURATION_ID },
      data: { autoConnectEnabled: false },
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
    const runtime = this.runtime;
    if (this.workerRunning || !runtime || this.connectionState !== 'ONLINE') {
      return;
    }
    if (!(await this.acquireOutboxWorkerLease())) return;
    try {
      const historyRun = await this.prisma.dongilHistorySyncRun.findFirst({
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
        select: { id: true },
      });
      if (historyRun) return;
      this.workerRunning = true;
      const rows = await this.prisma.dongilSyncOutbox.findMany({
        where: {
          status: {
            in: [DongilSyncOutboxStatus.PENDING, DongilSyncOutboxStatus.FAILED],
          },
          nextAttemptAt: { lte: new Date() },
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
      const client = new DongilApiClient(runtime.serverUrl);
      const washingRows = rows.filter(
        (row) => row.okCount !== null && row.ngCount !== null,
      );
      const legacyRows = rows.filter(
        (row) => row.okCount === null || row.ngCount === null,
      );
      if (washingRows.length > 0) {
        const keepRunning = await this.sendOutboxGroup(washingRows, () =>
          client.sendWashingBatch(runtime.machineId, runtime.credential, {
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
          client.sendBatch(runtime.machineId, runtime.credential, {
            localBatchId: randomUUID(),
            items: legacyRows.map((row) => this.toResultPayload(row)),
          }),
        );
      }
    } finally {
      this.workerRunning = false;
      await this.releaseOutboxWorkerLease();
    }
  }

  private toResultPayload(row: {
    localResultId: string;
    productCode: string;
    productName: string | null;
    result: string;
    localSessionId: string | null;
    inspectedAt: Date;
  }) {
    return {
      localResultId: row.localResultId,
      productCode: row.productCode,
      productName: row.productName ?? row.productCode,
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
      const outcomes = new Map(
        response.items.map((item) => [item.localResultId, item]),
      );
      for (const row of rows) {
        await this.applyOutcome(
          row.id,
          row.attemptCount,
          outcomes.get(row.localResultId),
        );
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Dongil batch request failed';
      const code =
        error instanceof DongilApiError
          ? error.code
          : 'DONGIL_SERVER_UNAVAILABLE';
      const classification = classifyDongilFailure(error);
      this.logger.warn(
        `[dongil.outbox.batch.failed] ${JSON.stringify({
          classification,
          itemCount: rows.length,
          firstLocalResultId: rows[0]?.localResultId ?? null,
          lastLocalResultId: rows.at(-1)?.localResultId ?? null,
          code,
          ...(error instanceof DongilApiError
            ? {
                correlationId: error.correlationId,
                path: error.path,
                status: error.status,
              }
            : {}),
        })}`,
      );
      if (classification === 'RETRYABLE') {
        await this.markBatchFailed(
          rows.map((row) => row.id),
          rows[0]?.attemptCount ?? 0,
          code,
          message,
        );
      } else {
        await this.markBatchBlocked(
          rows.map((row) => row.id),
          classification === 'CREDENTIAL_RECOVERY'
            ? CREDENTIAL_RECOVERY_ERROR_CODE
            : code,
          message,
        );
      }
      if (classification === 'CREDENTIAL_RECOVERY') {
        await this.enterCredentialRecovery(message);
        return false;
      }
      return true;
    }
  }

  private async applyOutcome(
    id: string,
    attemptCount: number,
    outcome?: DongilBatchItem,
  ) {
    if (
      outcome?.disposition === 'ACCEPTED' ||
      outcome?.disposition === 'REPLAYED'
    ) {
      await this.prisma.dongilSyncOutbox.update({
        where: { id },
        data: {
          status: DongilSyncOutboxStatus.SENT,
          deliveryDisposition:
            outcome.disposition === 'ACCEPTED'
              ? DongilDeliveryDisposition.ACCEPTED
              : DongilDeliveryDisposition.REPLAYED,
          attemptCount: { increment: 1 },
          sentAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      return;
    }
    const code = outcome?.error?.code || 'DONGIL_ITEM_FAILED';
    await this.prisma.dongilSyncOutbox.update({
      where: { id },
      data: {
        status: DongilSyncOutboxStatus.FAILED,
        attemptCount: { increment: 1 },
        nextAttemptAt: this.nextRetryAt(attemptCount + 1),
        lastErrorCode: code,
        lastErrorMessage:
          outcome?.error?.message || 'Dongil Server rejected the item.',
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

  private async markBatchBlocked(ids: string[], code: string, message: string) {
    await this.prisma.dongilSyncOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: DongilSyncOutboxStatus.BLOCKED_CONFIG,
        attemptCount: { increment: 1 },
        lastErrorCode: code,
        lastErrorMessage: message.slice(0, 500),
      },
    });
  }

  private nextRetryAt(attempt: number) {
    const base = Math.min(5_000 * 2 ** Math.min(attempt, 7), 10 * 60_000);
    return new Date(Date.now() + base + Math.floor(Math.random() * 2_000));
  }

  private async acquireOutboxWorkerLease() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OUTBOX_WORKER_LEASE_MS);
    const result = await this.prisma.dongilSyncWorkerLease.updateMany({
      where: {
        id: OUTBOX_WORKER_LEASE_ID,
        OR: [
          { expiresAt: null },
          { expiresAt: { lte: now } },
          { ownerId: this.workerLeaseOwnerId },
        ],
      },
      data: { ownerId: this.workerLeaseOwnerId, expiresAt },
    });
    return result.count === 1;
  }

  private async releaseOutboxWorkerLease() {
    await this.prisma.dongilSyncWorkerLease.updateMany({
      where: { id: OUTBOX_WORKER_LEASE_ID, ownerId: this.workerLeaseOwnerId },
      data: { ownerId: null, expiresAt: null },
    });
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private disconnectSocket() {
    this.clearHeartbeat();
    if (this.socketValidationRetryTimer) {
      clearTimeout(this.socketValidationRetryTimer);
      this.socketValidationRetryTimer = null;
    }
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.socketIdentityKey = null;
  }

  private async importLegacyConfiguration() {
    const existing = await this.prisma.dongilSyncConfiguration.findUnique({
      where: { id: CONFIGURATION_ID },
    });
    if (existing?.serverUrl) {
      try {
        const normalized = this.normalizeServerUrl(existing.serverUrl);
        await this.prisma.dongilSyncConfiguration.update({
          where: { id: CONFIGURATION_ID },
          data: {
            serverUrl: normalized,
            machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
            configVersion: DONGIL_CONFIGURATION_VERSION,
          },
        });
      } catch {
        this.lastErrorMessage =
          'Dongil database configuration contains an invalid server URL.';
        this.logger.warn(
          'Dongil database configuration contains an invalid server URL; legacy env import was skipped.',
        );
      }
      return;
    }
    if (existing?.legacyEnvImportedAt) return;

    const legacyValue = process.env.DONGIL_SERVER_URL?.trim();
    if (!legacyValue) return;

    let serverUrl: string;
    try {
      serverUrl = this.normalizeServerUrl(legacyValue);
    } catch {
      this.lastErrorMessage =
        'Legacy Dongil Server URL is invalid and was not imported.';
      this.logger.warn(
        'Legacy Dongil Server URL is invalid and was not imported.',
      );
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      const importedAt = new Date();
      const configuration = await transaction.dongilSyncConfiguration.upsert({
        where: { id: CONFIGURATION_ID },
        create: {
          id: CONFIGURATION_ID,
          serverUrl,
          machineId: null,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          licenseStatus: null,
          autoConnectEnabled: false,
          configVersion: DONGIL_CONFIGURATION_VERSION,
          legacyEnvImportedAt: importedAt,
        },
        update: {
          serverUrl,
          machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
          configVersion: DONGIL_CONFIGURATION_VERSION,
          legacyEnvImportedAt: importedAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: 'dongil.config.migrate-env',
          target: CONFIGURATION_ID,
          details: {
            before: existing
              ? {
                  serverUrl: existing.serverUrl,
                  machineTypeCode: existing.machineTypeCode,
                  configVersion: existing.configVersion,
                }
              : null,
            after: {
              serverUrl: configuration.serverUrl,
              machineTypeCode: configuration.machineTypeCode,
              configVersion: configuration.configVersion,
            },
          },
        },
      });
    });
    this.logger.log(
      'Imported legacy Dongil Server configuration into the database.',
    );
  }

  private normalizeServerUrl(value: string): string {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      throw new Error(
        'Dongil Server URL must use http or https and include a hostname.',
      );
    }
    if (url.username || url.password) {
      throw new Error('Dongil Server URL must not contain credentials.');
    }
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
      throw new Error('Dongil Server URL must not contain a path or query.');
    }
    return `${url.protocol}//${url.host}`;
  }

  private getConnectionErrorCode() {
    if (this.connectionState === 'MACHINE_TYPE_MISMATCH') {
      return 'DONGIL_MACHINE_TYPE_MISMATCH';
    }
    if (this.connectionState === 'NEEDS_CREDENTIAL_RECOVERY') {
      return CREDENTIAL_RECOVERY_ERROR_CODE;
    }
    if (this.connectionState === 'RETRYING') {
      return 'DONGIL_SERVER_UNAVAILABLE';
    }
    if (
      this.lastErrorMessage?.includes('configuration contains an invalid') ||
      this.lastErrorMessage?.includes('URL is invalid')
    ) {
      return 'DONGIL_CONFIGURATION_INVALID';
    }
    return 'DONGIL_CONNECTION_ERROR';
  }

  private getMachineRuntimeStatus(): { state: MachineRuntimeState } {
    try {
      const service = this.moduleRef.get(MachineRuntimeService, {
        strict: false,
      });
      return service.getStatus().data;
    } catch {
      return { state: 'inactive' };
    }
  }
}
