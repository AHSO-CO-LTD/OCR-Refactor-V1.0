import { ConfigService } from '@nestjs/config';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { InspectionsService } from '../inspections/inspections.service';
import { MachineRuntimeService } from './machine-runtime.service';
import { PlcInternalController } from './plc-internal.controller';
import { PlcRuntimeService } from './plc-runtime.service';

describe('PlcInternalController', () => {
  const internalToken = 'desktop-token';

  function createController() {
    const configService = {
      get: jest.fn().mockReturnValue(internalToken),
    } as unknown as ConfigService;
    const deviceTool = {
      disconnectCamera: jest.fn().mockResolvedValue({ success: true }),
      stopCameraOcr: jest.fn().mockResolvedValue({ success: true }),
    };
    const inspections = {} as InspectionsService;
    const machineRuntime = {
      shutdownApplication: jest.fn().mockResolvedValue(undefined),
    };
    const plcRuntime = {
      disconnectForShutdown: jest.fn().mockResolvedValue(undefined),
      getRuntimeStatus: jest
        .fn()
        .mockResolvedValue({ data: { connected: false } }),
      shutdownCameraOutputs: jest.fn().mockResolvedValue(undefined),
      shutdownOutputsAndDisconnect: jest.fn().mockResolvedValue(undefined),
      shutdownRemainingOutputs: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PlcInternalController(
      configService,
      deviceTool as unknown as DeviceToolService,
      inspections,
      machineRuntime as unknown as MachineRuntimeService,
      plcRuntime as unknown as PlcRuntimeService,
    );

    return { controller, deviceTool, machineRuntime, plcRuntime };
  }

  it('cleans up camera, machine runtime, and PLC when startup is blocked', async () => {
    const { controller, deviceTool, machineRuntime, plcRuntime } =
      createController();

    await expect(
      controller.abortStartup(internalToken),
    ).resolves.toBeUndefined();

    expect(machineRuntime.shutdownApplication).toHaveBeenCalledTimes(1);
    expect(deviceTool.disconnectCamera).toHaveBeenCalledTimes(1);
    expect(plcRuntime.shutdownOutputsAndDisconnect).toHaveBeenCalledTimes(1);
  });

  it('attempts every cleanup action before surfacing a cleanup failure', async () => {
    const { controller, deviceTool, machineRuntime, plcRuntime } =
      createController();
    deviceTool.disconnectCamera.mockRejectedValueOnce(
      new Error('camera cleanup failed'),
    );

    await expect(controller.abortStartup(internalToken)).rejects.toThrow(
      'camera cleanup failed',
    );

    expect(machineRuntime.shutdownApplication).toHaveBeenCalledTimes(1);
    expect(deviceTool.disconnectCamera).toHaveBeenCalledTimes(1);
    expect(plcRuntime.shutdownOutputsAndDisconnect).toHaveBeenCalledTimes(1);
  });

  it('runs explicit hardware shutdown stages independently', async () => {
    const { controller, deviceTool, machineRuntime, plcRuntime } =
      createController();

    await controller.shutdownCamera(internalToken);
    expect(machineRuntime.shutdownApplication).toHaveBeenCalledTimes(1);
    expect(deviceTool.stopCameraOcr).toHaveBeenCalledTimes(1);
    expect(deviceTool.disconnectCamera).toHaveBeenCalledTimes(1);

    await controller.shutdownCameraOutputs(internalToken);
    expect(plcRuntime.shutdownCameraOutputs).toHaveBeenCalledTimes(1);

    await controller.shutdownRemainingSignals(internalToken);
    expect(plcRuntime.shutdownRemainingOutputs).toHaveBeenCalledTimes(1);

    await controller.shutdownPlc(internalToken);
    expect(plcRuntime.disconnectForShutdown).toHaveBeenCalledTimes(1);
  });

  it('reports whether the PLC is connected before hardware shutdown', async () => {
    const { controller, plcRuntime } = createController();

    await expect(controller.getShutdownPlan(internalToken)).resolves.toEqual({
      data: { plcConnected: false },
    });

    expect(plcRuntime.getRuntimeStatus).toHaveBeenCalledTimes(1);
  });
});
