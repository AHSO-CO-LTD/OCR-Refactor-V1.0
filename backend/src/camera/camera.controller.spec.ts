import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraController } from './camera.controller';

describe('CameraController disconnect', () => {
  const disconnectCamera = jest.fn().mockResolvedValue({ success: true });
  const disconnectCameraByUser = jest.fn().mockResolvedValue({ success: true });
  const getCameraStatus = jest.fn().mockResolvedValue({
    success: true,
    data: { connected: false },
  });
  const controller = new CameraController(
    {
      disconnectCamera,
      disconnectCameraByUser,
      getCameraStatus,
    } as unknown as DeviceToolService,
    {} as PrismaService,
  );

  beforeEach(() => {
    disconnectCamera.mockClear();
    disconnectCameraByUser.mockClear();
    getCameraStatus.mockClear();
  });

  it('suppresses automatic reconnect only for a manual UI disconnect', async () => {
    await controller.disconnect({ manualDisconnect: true });

    expect(disconnectCameraByUser).toHaveBeenCalledTimes(1);
    expect(disconnectCamera).not.toHaveBeenCalled();
  });

  it('keeps internal cleanup disconnects eligible for later auto reconnect', async () => {
    await controller.disconnect();

    expect(disconnectCamera).toHaveBeenCalledTimes(1);
    expect(disconnectCameraByUser).not.toHaveBeenCalled();
  });
});
