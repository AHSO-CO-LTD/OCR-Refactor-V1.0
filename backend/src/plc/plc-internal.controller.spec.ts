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
    };
    const inspections = {} as InspectionsService;
    const machineRuntime = {
      shutdownApplication: jest.fn().mockResolvedValue(undefined),
    };
    const plcRuntime = {
      shutdownOutputsAndDisconnect: jest.fn().mockResolvedValue(undefined),
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
});
