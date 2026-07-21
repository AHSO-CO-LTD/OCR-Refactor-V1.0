import { ModuleRef } from '@nestjs/core';
import { LineSessionEndReason } from '@prisma/client';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { MachineRuntimeService } from './machine-runtime.service';
import { PlcRuntimeEvent, PlcRuntimeService } from './plc-runtime.service';

describe('MachineRuntimeService', () => {
  let service: MachineRuntimeService;
  let emitPlcEvent: (event: PlcRuntimeEvent) => void;
  let inspections: {
    beginInspectionSession: jest.Mock;
    captureRunningInspectionFromPlc: jest.Mock;
    clearLatestRunningInspection: jest.Mock;
    getCurrentInspection: jest.Mock;
    refreshLatestRunningInspection: jest.Mock;
    stopCurrentInspection: jest.Mock;
    verifyRunningInspectionCameraFrame: jest.Mock;
  };
  let deviceTool: {
    stopCameraOcr: jest.Mock;
    disconnectCamera: jest.Mock;
  };
  let plcRuntime: {
    subscribe: jest.Mock;
    ensureConnected: jest.Mock;
    getRuntimeStatus: jest.Mock;
    getSleepTimeMilliseconds: jest.Mock;
    pulseError: jest.Mock;
    setFixedOutput: jest.Mock;
  };

  beforeEach(() => {
    inspections = {
      beginInspectionSession: jest.fn().mockResolvedValue({
        data: { jobId: 'resumed-job' },
      }),
      captureRunningInspectionFromPlc: jest.fn().mockResolvedValue({
        data: { lastResult: { result: 'OK' }, quantity: 1 },
      }),
      clearLatestRunningInspection: jest.fn(),
      getCurrentInspection: jest.fn().mockResolvedValue({ data: null }),
      refreshLatestRunningInspection: jest.fn().mockResolvedValue({
        data: {
          productId: 'product-1',
          lastResult: { result: 'OK' },
          quantity: 1,
        },
      }),
      stopCurrentInspection: jest.fn().mockResolvedValue({ data: null }),
      verifyRunningInspectionCameraFrame: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    deviceTool = {
      stopCameraOcr: jest.fn().mockResolvedValue({ success: true }),
      disconnectCamera: jest.fn().mockResolvedValue({ success: true }),
    };
    plcRuntime = {
      subscribe: jest.fn((listener: (event: PlcRuntimeEvent) => void) => {
        emitPlcEvent = listener;
        return jest.fn();
      }),
      ensureConnected: jest.fn().mockResolvedValue({ data: {} }),
      getRuntimeStatus: jest.fn().mockResolvedValue({
        data: { connected: true, lastError: null },
      }),
      getSleepTimeMilliseconds: jest.fn().mockResolvedValue(300_000),
      pulseError: jest.fn().mockResolvedValue({ data: {} }),
      setFixedOutput: jest.fn().mockResolvedValue({ data: {} }),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(inspections),
    } as unknown as ModuleRef;
    service = new MachineRuntimeService(
      moduleRef,
      deviceTool as unknown as DeviceToolService,
      plcRuntime as unknown as PlcRuntimeService,
    );
    service.onApplicationBootstrap();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('pulses the PLC only when a PLC-triggered inspection is NG', async () => {
    inspections.captureRunningInspectionFromPlc.mockResolvedValueOnce({
      data: { lastResult: { result: 'NG' }, quantity: 1 },
    });
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(inspections.captureRunningInspectionFromPlc).toHaveBeenCalledTimes(
      1,
    );
    expect(plcRuntime.pulseError).toHaveBeenCalledTimes(1);
    expect(service.getStatus().data.lastPlcInspectionSequence).toBe(1);
    expect(service.getStatus().data.liveInspectionSequence).toBeGreaterThan(0);

    await service.notifyManualLatch();
    await settleAsyncWork();
    expect(plcRuntime.pulseError).toHaveBeenCalledTimes(1);
  });

  it('keeps camera operation available when PLC is not configured', async () => {
    plcRuntime.ensureConnected.mockRejectedValueOnce(
      new Error('PLC configuration is required'),
    );

    await service.startOperation();
    await expect(service.startOperation()).resolves.toBeDefined();

    expect(inspections.verifyRunningInspectionCameraFrame).toHaveBeenCalled();
    expect(plcRuntime.setFixedOutput).not.toHaveBeenCalled();
    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      plcOffline: true,
      plcErrorMessage: 'PLC configuration is required',
    });
  });

  it('exposes capture triggers even without a running production operation', async () => {
    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(service.getStatus().data).toMatchObject({
      state: 'inactive',
      captureTriggerSequence: 1,
    });
    expect(service.getStatus().data.lastCaptureTriggerAt).not.toBeNull();
    expect(inspections.captureRunningInspectionFromPlc).not.toHaveBeenCalled();
  });

  it('reconnects PLC explicitly and synchronizes outputs while running', async () => {
    plcRuntime.ensureConnected.mockRejectedValueOnce(
      new Error('PLC configuration is required'),
    );
    await service.startOperation();

    await service.reconnectPlc();

    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      1,
      'cameraPower',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      2,
      'cameraLight',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      3,
      'okResult',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      4,
      'waitingChecking',
      true,
    );
    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      plcOffline: false,
      plcErrorMessage: null,
    });

    emitPlcEvent({
      type: 'error',
      at: new Date().toISOString(),
      state: 'reconnecting',
      message: 'PLC watch stream closed unexpectedly',
    });
    await settleAsyncWork();

    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      plcOffline: true,
      steps: [expect.objectContaining({ id: 'plc', status: 'failed' })],
    });

    emitPlcEvent({
      type: 'status',
      at: new Date().toISOString(),
      state: 'connected',
    });
    await settleAsyncWork();

    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      plcOffline: false,
      plcErrorMessage: null,
      message: null,
    });
  });

  it('does not report reconnect steps as completed when PLC drops immediately', async () => {
    plcRuntime.ensureConnected.mockRejectedValueOnce(
      new Error('PLC configuration is required'),
    );
    await service.startOperation();
    plcRuntime.getRuntimeStatus.mockResolvedValueOnce({
      data: { connected: false, lastError: 'PLC connection was lost' },
    });

    await expect(service.reconnectPlc()).rejects.toThrow(
      'PLC connection was lost',
    );

    expect(service.getStatus().data.steps).toEqual([
      expect.objectContaining({ id: 'plc', status: 'failed' }),
      expect.objectContaining({ id: 'power', status: 'pending' }),
      expect.objectContaining({ id: 'light', status: 'pending' }),
    ]);
  });

  it('turns off camera resources on PLC stop and restores them on PLC start', async () => {
    inspections.stopCurrentInspection.mockResolvedValueOnce({
      data: { productId: 'product-1', operatorId: 'operator-1' },
    });
    await service.startOperation();
    deviceTool.stopCameraOcr.mockClear();
    deviceTool.disconnectCamera.mockClear();
    plcRuntime.setFixedOutput.mockClear();

    emitPlcEvent(signal('stopTrigger'));
    await settleAsyncWork();

    expect(deviceTool.stopCameraOcr).toHaveBeenCalledTimes(1);
    expect(deviceTool.disconnectCamera).toHaveBeenCalledTimes(1);
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      1,
      'waitingChecking',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      2,
      'okResult',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      3,
      'cameraLight',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      4,
      'cameraPower',
      false,
    );
    expect(inspections.stopCurrentInspection).toHaveBeenCalledWith(
      LineSessionEndReason.plc_stop,
    );
    expect(service.getStatus().data.state).toBe('idle_machine_stop');

    emitPlcEvent(signal('startTrigger'));
    await settleAsyncWork();

    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      5,
      'cameraPower',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      6,
      'cameraLight',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      7,
      'okResult',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      8,
      'waitingChecking',
      true,
    );
    expect(inspections.beginInspectionSession).toHaveBeenCalledWith(
      { productId: 'product-1' },
      { id: 'operator-1', username: 'plc-resume', role: 'operator' },
    );
    expect(inspections.verifyRunningInspectionCameraFrame).toHaveBeenCalled();
    expect(service.getStatus().data.state).toBe('running');
  });

  it('does not pulse NG when no ROI was recognized', async () => {
    inspections.captureRunningInspectionFromPlc.mockResolvedValueOnce({
      data: { lastResult: { result: 'NG' }, quantity: 0 },
    });
    await service.startOperation();
    plcRuntime.pulseError.mockClear();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('cancels an active capture before running the PLC stop sequence', async () => {
    inspections.captureRunningInspectionFromPlc.mockImplementationOnce(
      (abortSignal: AbortSignal) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    await service.startOperation();
    deviceTool.disconnectCamera.mockClear();
    plcRuntime.setFixedOutput.mockClear();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();
    emitPlcEvent(signal('stopTrigger'));
    await settleAsyncWork();

    expect(deviceTool.disconnectCamera).toHaveBeenCalledTimes(1);
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      1,
      'waitingChecking',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      2,
      'okResult',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      3,
      'cameraLight',
      false,
    );
    expect(service.getStatus().data.state).toBe('idle_machine_stop');
  });

  it('automatically restores power, light, camera, and operation after restart', async () => {
    inspections.getCurrentInspection.mockResolvedValueOnce({
      data: { jobId: 'persisted-job' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await settleAsyncWork();

    expect(plcRuntime.ensureConnected).toHaveBeenCalled();
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      1,
      'cameraPower',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      2,
      'cameraLight',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      3,
      'okResult',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      4,
      'waitingChecking',
      true,
    );
    expect(inspections.verifyRunningInspectionCameraFrame).toHaveBeenCalled();
    expect(service.getStatus().data.state).toBe('running');
  });

  it('ends the active Line session when the application shuts down', async () => {
    await service.startOperation();

    await service.shutdownApplication();

    expect(inspections.stopCurrentInspection).toHaveBeenCalledWith(
      LineSessionEndReason.app_shutdown,
    );
  });
});

function signal(key: string): PlcRuntimeEvent {
  return {
    type: 'signal',
    at: new Date().toISOString(),
    key,
    value: true,
    source: 'fixed',
  };
}

async function settleAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
