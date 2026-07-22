import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { PlcKeyOperation } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ExecuteCustomPlcKeyDto,
  UpdatePlcConfigDto,
} from './dto/plc-config.dto';
import {
  PlcProtocolName,
  PlcToolClient,
  PlcWatchEvent,
} from './plc-tool.client';
import { toToolBooleanAddress } from './plc-address';

const PLC_CONFIG_ID = 'default';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECENT_EVENTS = 50;
const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 300;

type PlcConnectionState =
  | 'not_configured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type PlcRuntimeEvent = {
  type: 'status' | 'signal' | 'output' | 'error';
  at: string;
  key?: string;
  address?: number;
  toolAddress?: number;
  value?: boolean;
  source?: 'fixed' | 'custom';
  message?: string;
  state?: PlcConnectionState;
};

type WatchMapping = {
  key: string;
  address: number;
  toolAddress: number;
  source: 'fixed' | 'custom';
};

export type PlcFixedOutputKey =
  | 'cameraPower'
  | 'cameraLight'
  | 'waitingChecking';

export type PlcStartupSignalCheck = {
  id: string;
  label?: string;
  status: 'done' | 'failed' | 'skipped';
  error?: string;
};

@Injectable()
export class PlcRuntimeService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PlcRuntimeService.name);
  private readonly eventBus = new EventEmitter();
  private state: PlcConnectionState = 'disconnected';
  private connectedProtocol: PlcProtocolName | null = null;
  private connectedHost: string | null = null;
  private lastError: string | null = null;
  private cameraPowerCommand: boolean | null = null;
  private cameraLightCommand: boolean | null = null;
  private waitingCheckingCommand: boolean | null = null;
  private readonly fixedOutputRevision: Record<PlcFixedOutputKey, number> = {
    cameraPower: 0,
    cameraLight: 0,
    waitingChecking: 0,
  };
  private recentEvents: PlcRuntimeEvent[] = [];
  private watcherControllers: AbortController[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalDisconnect = false;
  private ioQueue: Promise<unknown> = Promise.resolve();
  private connectPromise: Promise<unknown> | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolClient: PlcToolClient,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => {
      void this.loadConfig().then((config) => {
        if (!config) return;
        void this.connect().catch((error) => {
          this.lastError = this.errorMessage(error);
          this.scheduleReconnect();
        });
      });
    }, 0);
  }

  onModuleDestroy() {
    return this.shutdownOutputsAndDisconnect();
  }

  shutdownOutputsAndDisconnect() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown() {
    this.intentionalDisconnect = true;
    this.cancelReconnect();
    this.stopWatchers();
    const config = await this.loadConfig().catch(() => null);
    const host = this.connectedHost ?? config?.ipAddress ?? null;

    if (config && host) {
      const outputs = [
        {
          key: 'cameraLight' as const,
          address: config.cameraLightAddress,
        },
        {
          key: 'cameraPower' as const,
          address: config.cameraPowerAddress,
        },
        {
          key: 'waitingChecking' as const,
          address: config.waitingCheckingAddress,
        },
      ].filter(
        (output): output is { key: PlcFixedOutputKey; address: number } =>
          output.address !== null,
      );

      for (const output of outputs) {
        const toolAddress = toToolBooleanAddress(
          config.protocol,
          output.address,
        );
        await this.enqueue(() =>
          this.toolClient.writeBoolean(host, toolAddress, false),
        ).catch((error) => {
          this.logger.warn(
            `PLC shutdown could not clear ${output.key}: ${this.errorMessage(error)}`,
          );
        });
      }

      await this.enqueue(() => this.toolClient.disconnect(host)).catch(
        (error) => {
          this.logger.warn(
            `PLC shutdown disconnect failed: ${this.errorMessage(error)}`,
          );
        },
      );
    }

    this.resetRuntime('disconnected', false);
  }

  subscribe(listener: (event: PlcRuntimeEvent) => void) {
    this.eventBus.on('event', listener);
    return () => this.eventBus.off('event', listener);
  }

  async getConfig() {
    const config = await this.loadConfig();
    return { data: config ? this.serializeConfig(config) : null };
  }

  async saveConfig(dto: UpdatePlcConfigDto) {
    this.validateMappings(dto);
    const customKeys = dto.customKeys.map((key) => ({
      name: key.name.trim(),
      address: key.address,
      operation: key.operation,
      enabled: key.enabled,
    }));

    await this.disconnect().catch(() => undefined);
    await this.prisma.$transaction(async (tx) => {
      await tx.plcConfig.upsert({
        where: { id: PLC_CONFIG_ID },
        create: {
          id: PLC_CONFIG_ID,
          ipAddress: dto.ipAddress,
          protocol: dto.protocol,
          port: dto.port,
          captureTriggerAddress: dto.captureTriggerAddress,
          stopTriggerAddress: dto.stopTriggerAddress,
          startTriggerAddress: dto.startTriggerAddress,
          cameraPowerAddress: dto.cameraPowerAddress,
          cameraLightAddress: dto.cameraLightAddress,
          errorPulseAddress: dto.errorPulseAddress,
          okResultAddress: dto.okResultAddress,
          waitingCheckingAddress: dto.waitingCheckingAddress,
          errorPulseDurationMs: dto.errorPulseDurationMs,
          okPulseDurationMs: dto.okPulseDurationMs,
        },
        update: {
          ipAddress: dto.ipAddress,
          protocol: dto.protocol,
          port: dto.port,
          captureTriggerAddress: dto.captureTriggerAddress,
          stopTriggerAddress: dto.stopTriggerAddress,
          startTriggerAddress: dto.startTriggerAddress,
          cameraPowerAddress: dto.cameraPowerAddress,
          cameraLightAddress: dto.cameraLightAddress,
          errorPulseAddress: dto.errorPulseAddress,
          okResultAddress: dto.okResultAddress,
          waitingCheckingAddress: dto.waitingCheckingAddress,
          errorPulseDurationMs: dto.errorPulseDurationMs,
          okPulseDurationMs: dto.okPulseDurationMs,
        },
      });
      await tx.plcCustomKey.deleteMany({ where: { configId: PLC_CONFIG_ID } });
      if (customKeys.length > 0) {
        await tx.plcCustomKey.createMany({
          data: customKeys.map((key) => ({ ...key, configId: PLC_CONFIG_ID })),
        });
      }
    });

    this.resetRuntime('disconnected');
    void this.connect().catch((error) => {
      this.logger.warn(
        `PLC reconnect after configuration save failed: ${this.errorMessage(error)}`,
      );
      this.scheduleReconnect();
    });
    return this.getConfig();
  }

  connect() {
    if (this.connectPromise) return this.connectPromise;
    const operation = this.performConnect();
    this.connectPromise = operation.finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async ensureConnected() {
    if (this.state === 'connected') return this.getRuntimeStatus();
    return this.connect();
  }

  async getMachineInactivitySettings() {
    const config = await this.loadConfig();
    return {
      data: {
        enabled: config?.inactivityTimeoutEnabled ?? true,
        timeoutSeconds:
          config?.sleepTimeSeconds ?? DEFAULT_INACTIVITY_TIMEOUT_SECONDS,
        configured: Boolean(config),
      },
    };
  }

  async updateMachineInactivitySettings(settings: {
    enabled: boolean;
    timeoutSeconds: number;
  }) {
    await this.requireConfig();
    const config = await this.prisma.plcConfig.update({
      where: { id: PLC_CONFIG_ID },
      data: {
        inactivityTimeoutEnabled: settings.enabled,
        sleepTimeSeconds: settings.timeoutSeconds,
      },
    });
    return {
      data: {
        enabled: config.inactivityTimeoutEnabled,
        timeoutSeconds: config.sleepTimeSeconds,
        configured: true,
      },
    };
  }

  private async performConnect() {
    const config = await this.requireConfig();
    this.intentionalDisconnect = false;
    this.cancelReconnect();
    this.stopWatchers();
    this.clearFixedOutputStates();
    this.setState('connecting');

    try {
      const status = await this.enqueue(() =>
        this.toolClient.connect(config.ipAddress, config.protocol, config.port),
      );
      this.connectedHost = config.ipAddress;
      this.connectedProtocol = status.driver;
      this.lastError = null;
      await this.syncFixedOutputStates(config);
      this.setState('connected');
      this.startWatchers(config);
      return this.createRuntimeStatus(config);
    } catch (error) {
      this.lastError = this.errorMessage(error);
      this.setState('error', this.lastError);
      throw error;
    }
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    this.cancelReconnect();
    this.stopWatchers();
    const host = this.connectedHost ?? (await this.loadConfig())?.ipAddress;
    if (host) {
      await this.enqueue(() => this.toolClient.disconnect(host)).catch(
        (error) => {
          this.logger.warn(
            `PLC disconnect failed: ${this.errorMessage(error)}`,
          );
        },
      );
    }
    this.resetRuntime('disconnected');
    return this.getRuntimeStatus();
  }

  async getRuntimeStatus() {
    const config = await this.loadConfig();
    if (!config) this.state = 'not_configured';

    if (this.state === 'connected' && this.connectedHost) {
      try {
        const toolStatus = await this.toolClient.status(this.connectedHost);
        if (toolStatus.state !== 'connected') {
          this.state = 'reconnecting';
          this.clearFixedOutputStates();
          this.scheduleReconnect();
        } else if (config) {
          await this.syncFixedOutputStates(config);
        }
      } catch (error) {
        this.lastError = this.errorMessage(error);
        this.state = 'reconnecting';
        this.clearFixedOutputStates();
        this.scheduleReconnect();
      }
    }

    return this.createRuntimeStatus(config);
  }

  private createRuntimeStatus(
    config: Awaited<ReturnType<typeof this.loadConfig>>,
  ) {
    return {
      data: {
        state: this.state,
        connected: this.state === 'connected',
        host: this.connectedHost ?? config?.ipAddress ?? null,
        protocol: this.connectedProtocol ?? config?.protocol ?? null,
        cameraPowerCommand: this.cameraPowerCommand,
        cameraLightCommand: this.cameraLightCommand,
        waitingCheckingCommand: this.waitingCheckingCommand,
        lastError: this.lastError,
        recentEvents: this.recentEvents,
      },
    };
  }

  async setFixedOutput(key: PlcFixedOutputKey, value: boolean) {
    const config = await this.requireConfig();
    const addressByKey: Record<PlcFixedOutputKey, number | null> = {
      cameraPower: config.cameraPowerAddress,
      cameraLight: config.cameraLightAddress,
      waitingChecking: config.waitingCheckingAddress,
    };
    const address = addressByKey[key];
    if (address === null) return this.getRuntimeStatus();
    if (this.state !== 'connected' || this.connectedHost !== config.ipAddress) {
      throw new BadRequestException('PLC is not connected');
    }
    const toolAddress = toToolBooleanAddress(config.protocol, address);
    await this.enqueue(() =>
      this.toolClient.writeBoolean(config.ipAddress, toolAddress, value),
    );
    this.fixedOutputRevision[key] += 1;
    if (key === 'cameraPower') this.cameraPowerCommand = value;
    if (key === 'cameraLight') this.cameraLightCommand = value;
    if (key === 'waitingChecking') this.waitingCheckingCommand = value;
    this.emit({
      type: 'output',
      key,
      address,
      toolAddress,
      value,
      source: 'fixed',
    });
    return this.getRuntimeStatus();
  }

  async pulseError() {
    const config = await this.requireConfig();
    return this.pulseFixedOutput(
      config,
      'errorPulse',
      config.errorPulseAddress,
      config.errorPulseDurationMs,
    );
  }

  async pulseOkResult() {
    const config = await this.requireConfig();
    return this.pulseFixedOutput(
      config,
      'okResult',
      config.okResultAddress,
      config.okPulseDurationMs,
    );
  }

  private async pulseFixedOutput(
    config: Awaited<ReturnType<typeof this.requireConfig>>,
    key: 'errorPulse' | 'okResult',
    address: number | null,
    durationMs: number,
  ) {
    if (address === null) return this.getRuntimeStatus();
    if (this.state !== 'connected' || this.connectedHost !== config.ipAddress) {
      throw new BadRequestException('PLC is not connected');
    }
    const toolAddress = toToolBooleanAddress(config.protocol, address);
    await this.enqueue(() =>
      this.toolClient.pulse(config.ipAddress, toolAddress, durationMs / 1000),
    );
    this.emit({
      type: 'output',
      key,
      address,
      toolAddress,
      value: true,
      source: 'fixed',
    });
    return this.getRuntimeStatus();
  }

  async testStartupSignals() {
    const config = await this.requireConnectedConfig();
    const checks: PlcStartupSignalCheck[] = [];

    await this.runStartupSignalCheck(
      checks,
      'ngResult',
      config.errorPulseAddress,
      () => this.pulseError().then(() => undefined),
    );
    await this.runStartupSignalCheck(
      checks,
      'okResult',
      config.okResultAddress,
      () => this.pulseOkResult().then(() => undefined),
    );
    await this.runStartupSignalCheck(
      checks,
      'waitingChecking',
      config.waitingCheckingAddress,
      () => this.pulseStartupFixedOutput('waitingChecking'),
    );

    const monitoredInputs = [
      ['captureTrigger', config.captureTriggerAddress],
      ['stopTrigger', config.stopTriggerAddress],
      ['startTrigger', config.startTriggerAddress],
    ] as const;

    for (const [id, address] of monitoredInputs) {
      checks.push({
        id,
        status: address === null ? 'skipped' : 'done',
      });
    }

    for (const key of config.customKeys) {
      checks.push({
        id: `custom:${key.id}`,
        label: key.name,
        status: 'skipped',
      });
    }

    return {
      data: {
        status: checks.some((check) => check.status !== 'skipped')
          ? ('done' as const)
          : ('skipped' as const),
        checks,
      },
    };
  }

  async executeCustomKey(id: string, dto: ExecuteCustomPlcKeyDto) {
    const config = await this.requireConnectedConfig();
    const key = config.customKeys.find(
      (item) => item.id === id && item.enabled,
    );
    if (!key) throw new NotFoundException('PLC custom key not found');
    if (key.operation === PlcKeyOperation.watch_boolean) {
      throw new BadRequestException('Watch keys are read-only');
    }
    const toolAddress = toToolBooleanAddress(config.protocol, key.address);
    if (key.operation === PlcKeyOperation.pulse) {
      await this.enqueue(() =>
        this.toolClient.pulse(
          config.ipAddress,
          toolAddress,
          config.errorPulseDurationMs / 1000,
        ),
      );
    } else {
      await this.enqueue(() =>
        this.toolClient.writeBoolean(config.ipAddress, toolAddress, dto.value),
      );
    }
    this.emit({
      type: 'output',
      key: key.name,
      address: key.address,
      toolAddress,
      value: key.operation === PlcKeyOperation.pulse ? true : dto.value,
      source: 'custom',
    });
    return this.getRuntimeStatus();
  }

  private async runStartupSignalCheck(
    checks: PlcStartupSignalCheck[],
    id: string,
    address: number | null,
    action: () => Promise<void>,
  ) {
    if (address === null) {
      checks.push({ id, status: 'skipped' });
      return;
    }

    try {
      await action();
      checks.push({ id, status: 'done' });
    } catch (error) {
      checks.push({
        id,
        status: 'failed',
        error: this.errorMessage(error),
      });
    }
  }

  private async pulseStartupFixedOutput(
    key: Extract<PlcFixedOutputKey, 'waitingChecking'>,
  ) {
    await this.setFixedOutput(key, true);
    const startupPulseRevision = this.fixedOutputRevision[key];
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      if (this.fixedOutputRevision[key] === startupPulseRevision) {
        await this.setFixedOutput(key, false);
      }
    }
  }

  private async syncFixedOutputStates(
    config: NonNullable<Awaited<ReturnType<typeof this.loadConfig>>>,
  ) {
    const outputs = [
      ['cameraPower', config.cameraPowerAddress],
      ['cameraLight', config.cameraLightAddress],
      ['waitingChecking', config.waitingCheckingAddress],
    ] as const;

    for (const [key, address] of outputs) {
      if (address === null) {
        this.setFixedOutputState(key, null);
        continue;
      }
      const toolAddress = toToolBooleanAddress(config.protocol, address);
      const response = await this.enqueue(() =>
        this.toolClient.readBoolean(config.ipAddress, toolAddress, 1),
      );
      const value = response.values[0];
      if (typeof value !== 'boolean') {
        throw new Error(`PLC returned no boolean value for ${key}`);
      }
      this.setFixedOutputState(key, value);
    }
  }

  private setFixedOutputState(key: PlcFixedOutputKey, value: boolean | null) {
    if (key === 'cameraPower') this.cameraPowerCommand = value;
    if (key === 'cameraLight') this.cameraLightCommand = value;
    if (key === 'waitingChecking') this.waitingCheckingCommand = value;
  }

  private clearFixedOutputStates() {
    this.cameraPowerCommand = null;
    this.cameraLightCommand = null;
    this.waitingCheckingCommand = null;
    this.fixedOutputRevision.cameraPower += 1;
    this.fixedOutputRevision.cameraLight += 1;
    this.fixedOutputRevision.waitingChecking += 1;
  }

  private startWatchers(
    config: Awaited<ReturnType<typeof this.requireConfig>>,
  ) {
    this.stopWatchers();
    const mappings = [
      {
        key: 'captureTrigger',
        address: config.captureTriggerAddress,
        toolAddress:
          config.captureTriggerAddress === null
            ? null
            : toToolBooleanAddress(
                config.protocol,
                config.captureTriggerAddress,
              ),
        source: 'fixed',
      },
      {
        key: 'stopTrigger',
        address: config.stopTriggerAddress,
        toolAddress:
          config.stopTriggerAddress === null
            ? null
            : toToolBooleanAddress(config.protocol, config.stopTriggerAddress),
        source: 'fixed',
      },
      {
        key: 'startTrigger',
        address: config.startTriggerAddress,
        toolAddress:
          config.startTriggerAddress === null
            ? null
            : toToolBooleanAddress(config.protocol, config.startTriggerAddress),
        source: 'fixed',
      },
      ...config.customKeys
        .filter(
          (key) =>
            key.enabled && key.operation === PlcKeyOperation.watch_boolean,
        )
        .map((key) => ({
          key: key.name,
          address: key.address,
          toolAddress: toToolBooleanAddress(config.protocol, key.address),
          source: 'custom' as const,
        })),
    ].filter(
      (mapping): mapping is WatchMapping =>
        mapping.address !== null && mapping.toolAddress !== null,
    );

    for (const group of this.groupContiguousMappings(mappings)) {
      const controller = new AbortController();
      this.watcherControllers.push(controller);
      void this.runWatcher(config.ipAddress, group, controller.signal);
    }
  }

  private async runWatcher(
    host: string,
    mappings: WatchMapping[],
    signal: AbortSignal,
  ) {
    const first = mappings[0].toolAddress;
    const last = mappings[mappings.length - 1].toolAddress;
    try {
      await this.toolClient.watchBoolean(
        host,
        first,
        last - first + 1,
        signal,
        (event) => this.handleWatchEvent(event, mappings),
      );
      if (!signal.aborted && !this.intentionalDisconnect) {
        throw new Error('PLC watch stream closed unexpectedly');
      }
    } catch (error) {
      if (signal.aborted || this.intentionalDisconnect) return;
      this.lastError = this.errorMessage(error);
      this.setState('reconnecting', this.lastError);
      this.scheduleReconnect();
    }
  }

  private handleWatchEvent(event: PlcWatchEvent, mappings: WatchMapping[]) {
    if (event.event === 'error') {
      this.lastError = event.error ?? 'PLC watch failed';
      this.setState('reconnecting', this.lastError);
      this.scheduleReconnect();
      return;
    }
    if (event.event !== 'change' || event.address === undefined) return;
    const matches = mappings.filter(
      (item) => item.toolAddress === event.address,
    );
    for (const mapping of matches) {
      this.emit({
        type: 'signal',
        key: mapping.key,
        address: mapping.address,
        toolAddress: mapping.toolAddress,
        value: Boolean(event.value),
        source: mapping.source,
      });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalDisconnect) return;
    this.stopWatchers();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((error) => {
        this.lastError = this.errorMessage(error);
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private groupContiguousMappings(mappings: WatchMapping[]) {
    const sorted = [...mappings].sort((a, b) => a.toolAddress - b.toolAddress);
    const groups: WatchMapping[][] = [];
    for (const mapping of sorted) {
      const group = groups.at(-1);
      if (!group || mapping.toolAddress > group.at(-1)!.toolAddress + 1) {
        groups.push([mapping]);
      } else {
        group.push(mapping);
      }
    }
    return groups;
  }

  private stopWatchers() {
    for (const controller of this.watcherControllers) controller.abort();
    this.watcherControllers = [];
  }

  private cancelReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setState(state: PlcConnectionState, message?: string) {
    this.state = state;
    this.emit({ type: message ? 'error' : 'status', state, message });
  }

  private emit(event: Omit<PlcRuntimeEvent, 'at'>) {
    const complete = { ...event, at: new Date().toISOString() };
    this.recentEvents = [complete, ...this.recentEvents].slice(
      0,
      MAX_RECENT_EVENTS,
    );
    this.eventBus.emit('event', complete);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.ioQueue.then(operation, operation);
    this.ioQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async loadConfig() {
    return this.prisma.plcConfig.findUnique({
      where: { id: PLC_CONFIG_ID },
      include: { customKeys: { orderBy: [{ name: 'asc' }] } },
    });
  }

  private async requireConfig() {
    const config = await this.loadConfig();
    if (!config) throw new BadRequestException('PLC configuration is required');
    return config;
  }

  private async requireConnectedConfig() {
    const config = await this.requireConfig();
    if (this.state !== 'connected' || this.connectedHost !== config.ipAddress) {
      throw new BadRequestException('PLC is not connected');
    }
    return config;
  }

  private serializeConfig(
    config: NonNullable<Awaited<ReturnType<typeof this.loadConfig>>>,
  ) {
    return {
      id: config.id,
      ipAddress: config.ipAddress,
      protocol: config.protocol,
      port: config.port,
      captureTriggerAddress: config.captureTriggerAddress,
      stopTriggerAddress: config.stopTriggerAddress,
      startTriggerAddress: config.startTriggerAddress,
      cameraPowerAddress: config.cameraPowerAddress,
      cameraLightAddress: config.cameraLightAddress,
      errorPulseAddress: config.errorPulseAddress,
      okResultAddress: config.okResultAddress,
      waitingCheckingAddress: config.waitingCheckingAddress,
      errorPulseDurationMs: config.errorPulseDurationMs,
      okPulseDurationMs: config.okPulseDurationMs,
      inactivityTimeoutEnabled: config.inactivityTimeoutEnabled,
      sleepTimeSeconds: config.sleepTimeSeconds,
      customKeys: config.customKeys,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private validateMappings(dto: UpdatePlcConfigDto) {
    const fixed = [
      dto.captureTriggerAddress,
      dto.stopTriggerAddress,
      dto.startTriggerAddress,
      dto.cameraPowerAddress,
      dto.cameraLightAddress,
      dto.errorPulseAddress,
      dto.okResultAddress,
      dto.waitingCheckingAddress,
    ].filter((address): address is number => address !== null);
    if (new Set(fixed).size !== fixed.length) {
      throw new BadRequestException('Required PLC addresses must be unique');
    }
    const names = dto.customKeys.map((key) => key.name.trim().toLowerCase());
    if (names.some((name) => !name)) {
      throw new BadRequestException('Custom PLC key name is required');
    }
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Custom PLC key names must be unique');
    }
  }

  private resetRuntime(state: PlcConnectionState, emitEvent = true) {
    this.state = state;
    this.connectedHost = null;
    this.connectedProtocol = null;
    this.clearFixedOutputStates();
    this.lastError = null;
    if (emitEvent) this.emit({ type: 'status', state });
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
