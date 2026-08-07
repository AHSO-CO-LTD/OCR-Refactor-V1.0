import { PlcKeyOperation, PlcProtocol } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PlcCustomKeyOperationDto } from './dto/plc-config.dto';
import { PlcRuntimeService } from './plc-runtime.service';
import { PlcToolClient } from './plc-tool.client';

describe('PlcRuntimeService', () => {
  const config = {
    id: 'default',
    ipAddress: '192.168.0.10',
    protocol: PlcProtocol.modbus_tcp,
    port: 502,
    captureTriggerAddress: 0,
    stopTriggerAddress: 1,
    startTriggerAddress: 2,
    cameraPowerAddress: 3,
    cameraLightAddress: 100,
    errorPulseAddress: 101,
    okResultAddress: 102,
    waitingCheckingAddress: 103,
    errorPulseDurationMs: 500,
    okPulseDurationMs: 750,
    inactivityTimeoutEnabled: true,
    sleepTimeSeconds: 300,
    stopDelaySeconds: 5,
    powerOffCameraOnStop: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    customKeys: [
      {
        id: 'custom-1',
        configId: 'default',
        name: 'customOutput',
        address: 10,
        operation: PlcKeyOperation.write_boolean,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  it('simulates PLC input and output without writing to physical hardware', async () => {
    jest.useFakeTimers();
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    } as unknown as PrismaService;
    const disconnect = jest.fn().mockResolvedValue(null);
    const writeBoolean = jest.fn();
    const toolClient = {
      disconnect,
      writeBoolean,
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);
    const events: Array<{
      id?: string;
      type: string;
      key?: string;
      value?: boolean;
    }> = [];
    service.subscribe((event) => events.push(event));

    await expect(service.enableSimulator('dev-client')).resolves.toMatchObject({
      data: {
        connected: true,
        host: 'PLC-SIMULATOR',
        simulatorActive: true,
      },
    });
    await service.setFixedOutput('cameraPower', true);
    await service.setFixedOutput('waitingChecking', true);
    await service.setFixedOutput('waitingChecking', false);
    await service.emitSimulatorSignal('dev-client', 'startTrigger');
    await jest.advanceTimersByTimeAsync(50);

    expect(writeBoolean).not.toHaveBeenCalled();
    const eventIds = events.map((event) => event.id);
    expect(eventIds.every(Boolean)).toBe(true);
    expect(new Set(eventIds).size).toBe(eventIds.length);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'output',
          key: 'cameraPower',
          value: true,
        }),
        expect.objectContaining({
          type: 'signal',
          key: 'startTrigger',
          value: true,
        }),
        expect.objectContaining({
          type: 'signal',
          key: 'startTrigger',
          value: false,
        }),
      ]),
    );
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      data: { simulatorActive: true, state: 'connected' },
    });

    await service.disableSimulator('dev-client');
    jest.useRealTimers();
  });

  it('maps logical M outputs and clears outputs before disconnecting on shutdown', async () => {
    const prisma = {
      plcConfig: {
        findUnique: jest.fn().mockResolvedValue(config),
      },
    } as unknown as PrismaService;
    const writeBoolean = jest.fn().mockResolvedValue({});
    const disconnect = jest.fn().mockResolvedValue(null);
    const readBoolean = jest
      .fn()
      .mockImplementation((_host: string, address: number) =>
        Promise.resolve({ address, values: [false] }),
      );
    const toolClient = {
      connect: jest.fn().mockResolvedValue({
        driver: 'modbus_tcp',
        state: 'connected',
      }),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      watchBoolean: jest.fn().mockImplementation(
        (
          _host: string,
          _address: number,
          _count: number,
          signal: AbortSignal,
        ) =>
          new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve());
          }),
      ),
      readBoolean,
      writeBoolean,
      disconnect,
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);
    const events: Array<{ type: string; state?: string }> = [];
    service.subscribe((event) => events.push(event));

    await service.connect();
    await service.setFixedOutput('cameraLight', true);
    expect(writeBoolean).toHaveBeenLastCalledWith(config.ipAddress, 8292, true);
    writeBoolean.mockClear();

    await service.shutdownOutputsAndDisconnect();

    expect(writeBoolean).toHaveBeenNthCalledWith(
      1,
      config.ipAddress,
      8292,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      2,
      config.ipAddress,
      8195,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      3,
      config.ipAddress,
      8295,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      4,
      config.ipAddress,
      8293,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      5,
      config.ipAddress,
      8294,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      6,
      config.ipAddress,
      8202,
      false,
    );
    expect(disconnect).toHaveBeenCalledWith(config.ipAddress);
    expect(
      events.some(
        (event) => event.type === 'status' && event.state === 'disconnected',
      ),
    ).toBe(false);
  });

  it('reads configured fixed output states after connect and status refresh', async () => {
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    } as unknown as PrismaService;
    const values = new Map<number, boolean>([
      [8195, true],
      [8292, false],
      [8295, false],
    ]);
    const readBoolean = jest
      .fn()
      .mockImplementation((_host: string, address: number) =>
        Promise.resolve({ address, values: [values.get(address) ?? false] }),
      );
    const toolClient = {
      connect: jest.fn().mockResolvedValue({
        driver: 'modbus_tcp',
        state: 'connected',
      }),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      readBoolean,
      watchBoolean: jest.fn().mockImplementation(() => new Promise(() => {})),
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    await expect(service.connect()).resolves.toMatchObject({
      data: {
        cameraPowerCommand: true,
        cameraLightCommand: false,
        waitingCheckingCommand: false,
      },
    });

    values.set(8195, false);
    values.set(8292, true);
    values.set(8295, true);

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      data: {
        cameraPowerCommand: false,
        cameraLightCommand: true,
        waitingCheckingCommand: true,
      },
    });
    expect(readBoolean).toHaveBeenCalledWith(config.ipAddress, 8195, 1);
    expect(readBoolean).toHaveBeenCalledWith(config.ipAddress, 8292, 1);
    expect(readBoolean).toHaveBeenCalledWith(config.ipAddress, 8295, 1);
  });

  it('skips fixed signals whose address is not configured', async () => {
    const optionalConfig = {
      ...config,
      captureTriggerAddress: null,
      stopTriggerAddress: null,
      startTriggerAddress: null,
      cameraPowerAddress: null,
      cameraLightAddress: null,
      errorPulseAddress: null,
      okResultAddress: null,
      waitingCheckingAddress: null,
      customKeys: [],
    };
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(optionalConfig) },
    } as unknown as PrismaService;
    const writeBoolean = jest.fn();
    const pulse = jest.fn();
    const readBoolean = jest.fn();
    const watchBoolean = jest
      .fn()
      .mockImplementation(() => new Promise(() => {}));
    const toolClient = {
      connect: jest.fn().mockResolvedValue({
        driver: 'modbus_tcp',
        state: 'connected',
      }),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      watchBoolean,
      readBoolean,
      writeBoolean,
      pulse,
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    await service.connect();
    await service.setFixedOutput('cameraPower', true);
    await service.pulseOkResult();
    await service.pulseError();
    const startupSignals = await service.testStartupSignals();

    expect(watchBoolean).not.toHaveBeenCalled();
    expect(readBoolean).not.toHaveBeenCalled();
    expect(writeBoolean).not.toHaveBeenCalled();
    expect(pulse).not.toHaveBeenCalled();
    expect(startupSignals).toEqual({
      data: {
        status: 'skipped',
        checks: [
          { id: 'ngResult', status: 'skipped' },
          { id: 'okResult', status: 'skipped' },
          { id: 'waitingChecking', status: 'skipped' },
          { id: 'captureTrigger', status: 'skipped' },
          { id: 'stopTrigger', status: 'skipped' },
          { id: 'startTrigger', status: 'skipped' },
        ],
      },
    });
  });

  it('tests configured fixed result signals and leaves custom outputs untouched', async () => {
    jest.useFakeTimers();
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    } as unknown as PrismaService;
    const writeBoolean = jest.fn().mockResolvedValue({});
    const pulse = jest.fn().mockResolvedValue({});
    const toolClient = {
      connect: jest.fn().mockResolvedValue({
        driver: 'modbus_tcp',
        state: 'connected',
      }),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      readBoolean: jest
        .fn()
        .mockImplementation((_host: string, address: number) =>
          Promise.resolve({ address, values: [false] }),
        ),
      watchBoolean: jest.fn().mockImplementation(() => new Promise(() => {})),
      writeBoolean,
      pulse,
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    try {
      await service.connect();
      const resultPromise = service.testStartupSignals();
      await jest.advanceTimersByTimeAsync(700);
      const result = await resultPromise;

      expect(pulse).toHaveBeenNthCalledWith(1, config.ipAddress, 8293, 0.5);
      expect(pulse).toHaveBeenNthCalledWith(2, config.ipAddress, 8294, 0.75);
      expect(writeBoolean).toHaveBeenNthCalledWith(
        1,
        config.ipAddress,
        8295,
        true,
      );
      expect(writeBoolean).toHaveBeenNthCalledWith(
        2,
        config.ipAddress,
        8295,
        false,
      );
      expect(result.data.checks).toContainEqual({
        id: 'custom:custom-1',
        label: 'customOutput',
        status: 'skipped',
      });
      expect(
        result.data.checks.filter((check) => check.status === 'failed'),
      ).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not let the startup signal test clear a newer waiting command', async () => {
    jest.useFakeTimers();
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    } as unknown as PrismaService;
    const writeBoolean = jest.fn().mockResolvedValue({});
    const toolClient = {
      connect: jest.fn().mockResolvedValue({
        driver: 'modbus_tcp',
        state: 'connected',
      }),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      readBoolean: jest
        .fn()
        .mockImplementation((_host: string, address: number) =>
          Promise.resolve({ address, values: [false] }),
        ),
      watchBoolean: jest.fn().mockImplementation(() => new Promise(() => {})),
      writeBoolean,
      pulse: jest.fn().mockResolvedValue({}),
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    try {
      await service.connect();
      const startupSignals = service.testStartupSignals();
      await jest.advanceTimersByTimeAsync(1);

      expect(writeBoolean).toHaveBeenLastCalledWith(
        config.ipAddress,
        8295,
        true,
      );

      await service.setFixedOutput('waitingChecking', true);
      await jest.advanceTimersByTimeAsync(400);
      await startupSignals;

      expect(writeBoolean).toHaveBeenCalledTimes(2);
      expect(writeBoolean).toHaveBeenNthCalledWith(
        2,
        config.ipAddress,
        8295,
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('automatically reconnects after saving PLC configuration', async () => {
    const transactionClient = {
      plcConfig: { upsert: jest.fn().mockResolvedValue(config) },
      plcCustomKey: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      plcConfig: { findUnique: jest.fn().mockResolvedValue(config) },
      $transaction: jest.fn(
        async (operation: (tx: typeof transactionClient) => Promise<void>) =>
          operation(transactionClient),
      ),
    } as unknown as PrismaService;
    const connect = jest.fn().mockResolvedValue({
      driver: 'modbus_tcp',
      state: 'connected',
    });
    const toolClient = {
      connect,
      disconnect: jest.fn().mockResolvedValue(null),
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
      readBoolean: jest
        .fn()
        .mockImplementation((_host: string, address: number) =>
          Promise.resolve({ address, values: [false] }),
        ),
      watchBoolean: jest.fn().mockImplementation(() => new Promise(() => {})),
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    await service.saveConfig({
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
      customKeys: config.customKeys.map((key) => ({
        name: key.name,
        address: key.address,
        operation: key.operation as PlcCustomKeyOperationDto,
        enabled: key.enabled,
      })),
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(connect).toHaveBeenCalledWith(
      config.ipAddress,
      config.protocol,
      config.port,
    );
    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      data: { connected: true, state: 'connected' },
    });
  });
});
