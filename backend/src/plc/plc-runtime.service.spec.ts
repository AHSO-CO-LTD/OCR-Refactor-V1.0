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
    sleepTimeSeconds: 300,
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

  it('maps logical M outputs and clears outputs before disconnecting on shutdown', async () => {
    const prisma = {
      plcConfig: {
        findUnique: jest.fn().mockResolvedValue(config),
      },
    } as unknown as PrismaService;
    const writeBoolean = jest.fn().mockResolvedValue({});
    const disconnect = jest.fn().mockResolvedValue(null);
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
      8294,
      false,
    );
    expect(writeBoolean).toHaveBeenNthCalledWith(
      4,
      config.ipAddress,
      8295,
      false,
    );
    expect(disconnect).toHaveBeenCalledWith(config.ipAddress);
    expect(
      events.some(
        (event) => event.type === 'status' && event.state === 'disconnected',
      ),
    ).toBe(false);
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
      writeBoolean,
      pulse,
    } as unknown as PlcToolClient;
    const service = new PlcRuntimeService(prisma, toolClient);

    await service.connect();
    await service.setFixedOutput('cameraPower', true);
    await service.setFixedOutput('okResult', true);
    await service.pulseError();

    expect(watchBoolean).not.toHaveBeenCalled();
    expect(writeBoolean).not.toHaveBeenCalled();
    expect(pulse).not.toHaveBeenCalled();
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
      sleepTimeSeconds: config.sleepTimeSeconds,
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
