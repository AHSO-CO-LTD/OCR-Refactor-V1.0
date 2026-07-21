import { ModuleRef } from '@nestjs/core';
import { LineSessionEndReason } from '@prisma/client';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { MachineOperationModeDto } from './dto/machine-runtime.dto';
import { MachineRuntimeService } from './machine-runtime.service';
import { PlcRuntimeEvent, PlcRuntimeService } from './plc-runtime.service';

describe('MachineRuntimeService', () => {
  let service: MachineRuntimeService;
  let emitPlcEvent: (event: PlcRuntimeEvent) => void;
  let inspections: {
    beginInspectionSession: jest.Mock;
    captureAndLatchRunningInspection: jest.Mock;
    captureRunningFrame: jest.Mock;
    clearLatestRunningInspection: jest.Mock;
    getCurrentInspection: jest.Mock;
    latchLatestRunningInspection: jest.Mock;
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
    pulseOkResult: jest.Mock;
    setFixedOutput: jest.Mock;
  };

  beforeEach(() => {
    inspections = {
      beginInspectionSession: jest.fn().mockResolvedValue({
        data: { jobId: 'resumed-job' },
      }),
      captureAndLatchRunningInspection: jest
        .fn()
        .mockResolvedValue(latchedInspection('OK')),
      captureRunningFrame: jest.fn().mockResolvedValue({
        data: runtimeFrame(),
      }),
      clearLatestRunningInspection: jest.fn(),
      getCurrentInspection: jest.fn().mockResolvedValue({ data: null }),
      latchLatestRunningInspection: jest
        .fn()
        .mockResolvedValue(latchedInspection('OK')),
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
      pulseOkResult: jest.fn().mockResolvedValue({ data: {} }),
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

  it('defaults to automatic mode with real-time AI enabled', () => {
    expect(service.getStatus().data).toMatchObject({
      operationMode: MachineOperationModeDto.auto,
      liveCameraEnabled: true,
      realtimeAiEnabled: true,
    });
  });

  it('pulses the PLC only when a PLC-triggered inspection is NG', async () => {
    inspections.latchLatestRunningInspection.mockResolvedValueOnce(
      latchedInspection('NG'),
    );
    enableAutoAi(service);
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(inspections.latchLatestRunningInspection).toHaveBeenCalledTimes(1);
    expect(plcRuntime.pulseError).toHaveBeenCalledTimes(1);
    expect(plcRuntime.pulseOkResult).not.toHaveBeenCalled();
    expect(service.getStatus().data.lastPlcInspectionSequence).toBe(1);
    expect(service.getStatus().data.liveInspectionSequence).toBeGreaterThan(0);

    await service.notifyManualLatch();
    await settleAsyncWork();
    expect(plcRuntime.pulseError).toHaveBeenCalledTimes(1);
  });

  it('pulses the PLC once when a PLC-triggered inspection is OK', async () => {
    enableAutoAi(service);
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(plcRuntime.pulseOkResult).toHaveBeenCalledTimes(1);
    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('never pulses PLC outputs for a manual Grab latch', async () => {
    service.updateControls({
      mode: MachineOperationModeDto.manual,
      realtimeAiEnabled: true,
    });
    await service.startOperation();

    const response = await service.grabManually();

    expect(response.data.action).toBe('latched');
    expect(inspections.latchLatestRunningInspection).toHaveBeenCalledTimes(1);
    expect(plcRuntime.pulseOkResult).not.toHaveBeenCalled();
    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('disables the manual Grab path in automatic mode', async () => {
    enableAutoAi(service);
    await service.startOperation();

    const response = await service.grabManually();

    expect(response.data.action).toBe('ignored');
    expect(inspections.latchLatestRunningInspection).not.toHaveBeenCalled();
    expect(inspections.captureAndLatchRunningInspection).not.toHaveBeenCalled();
  });

  it('captures only when AI is off and live camera is off', async () => {
    service.updateControls({
      mode: MachineOperationModeDto.manual,
      liveCameraEnabled: false,
      realtimeAiEnabled: false,
    });
    await service.startOperation();

    const response = await service.grabManually();

    expect(response.data.action).toBe('captured');
    expect(response.data.cameraFrameSequence).toBe(1);
    expect(inspections.captureRunningFrame).toHaveBeenCalledTimes(1);
    expect(inspections.latchLatestRunningInspection).not.toHaveBeenCalled();
    expect(plcRuntime.pulseOkResult).not.toHaveBeenCalled();
    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('uses capture, inspection, latch, and PLC pulse in auto with live off and AI on', async () => {
    service.updateControls({
      mode: MachineOperationModeDto.auto,
      liveCameraEnabled: false,
      realtimeAiEnabled: true,
    });
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(inspections.captureAndLatchRunningInspection).toHaveBeenCalledTimes(
      1,
    );
    expect(service.getStatus().data.cameraFrameSequence).toBe(1);
    expect(plcRuntime.pulseOkResult).toHaveBeenCalledTimes(1);
  });

  it('captures without inspection or PLC pulse in auto with live and AI off', async () => {
    service.updateControls({
      mode: MachineOperationModeDto.auto,
      liveCameraEnabled: false,
      realtimeAiEnabled: false,
    });
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(inspections.captureRunningFrame).toHaveBeenCalledTimes(1);
    expect(inspections.captureAndLatchRunningInspection).not.toHaveBeenCalled();
    expect(plcRuntime.pulseOkResult).not.toHaveBeenCalled();
    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('does not latch or pulse an UNKNOWN result', async () => {
    inspections.latchLatestRunningInspection.mockResolvedValueOnce({
      ...latchedInspection('UNKNOWN'),
      latched: false,
    });
    enableAutoAi(service);
    await service.startOperation();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(service.getStatus().data.lastPlcInspectionSequence).toBe(0);
    expect(plcRuntime.pulseOkResult).not.toHaveBeenCalled();
    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
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

  it('exposes but does not execute PLC capture triggers in manual mode', async () => {
    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(service.getStatus().data).toMatchObject({
      state: 'inactive',
      captureTriggerSequence: 1,
    });
    expect(service.getStatus().data.lastCaptureTriggerAt).not.toBeNull();
    expect(inspections.latchLatestRunningInspection).not.toHaveBeenCalled();
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
    service.updateControls({
      mode: MachineOperationModeDto.manual,
      liveCameraEnabled: false,
      realtimeAiEnabled: false,
    });
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
      'cameraLight',
      false,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      3,
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
      4,
      'cameraPower',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      5,
      'cameraLight',
      true,
    );
    expect(plcRuntime.setFixedOutput).toHaveBeenNthCalledWith(
      6,
      'waitingChecking',
      true,
    );
    expect(inspections.beginInspectionSession).toHaveBeenCalledWith(
      { productId: 'product-1' },
      { id: 'operator-1', username: 'plc-resume', role: 'operator' },
    );
    expect(inspections.verifyRunningInspectionCameraFrame).toHaveBeenCalled();
    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      operationMode: MachineOperationModeDto.auto,
      liveCameraEnabled: true,
      realtimeAiEnabled: true,
    });
  });

  it('restores automatic live AI controls after capture-timeout resume', async () => {
    await service.startOperation();
    service.updateControls({
      mode: MachineOperationModeDto.manual,
      liveCameraEnabled: false,
      realtimeAiEnabled: false,
    });

    await service['stopForCaptureTimeout']();
    expect(service.getStatus().data.state).toBe('idle_capture_timeout');

    await service.resumeCaptureTimeout();

    expect(service.getStatus().data).toMatchObject({
      state: 'running',
      operationMode: MachineOperationModeDto.auto,
      liveCameraEnabled: true,
      realtimeAiEnabled: true,
    });
  });

  it('does not pulse NG when no ROI was recognized', async () => {
    inspections.latchLatestRunningInspection.mockResolvedValueOnce({
      ...latchedInspection('NG'),
      data: { lastResult: { result: 'NG' }, quantity: 0 },
    });
    enableAutoAi(service);
    await service.startOperation();
    plcRuntime.pulseError.mockClear();

    emitPlcEvent(signal('captureTrigger'));
    await settleAsyncWork();

    expect(plcRuntime.pulseError).not.toHaveBeenCalled();
  });

  it('cancels an active capture before running the PLC stop sequence', async () => {
    inspections.latchLatestRunningInspection.mockImplementationOnce(
      (abortSignal: AbortSignal) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    enableAutoAi(service);
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

function enableAutoAi(service: MachineRuntimeService) {
  service.updateControls({
    mode: MachineOperationModeDto.auto,
    realtimeAiEnabled: true,
  });
}

function runtimeFrame() {
  return {
    jobId: 'job-1',
    productId: 'product-1',
    imageBase64: Buffer.from('frame').toString('base64'),
    width: 1500,
    height: 500,
    capturedAt: new Date().toISOString(),
  };
}

function latchedInspection(result: 'OK' | 'NG' | 'UNKNOWN') {
  return {
    data: {
      jobId: 'job-1',
      productId: 'product-1',
      lastResult: { result },
      quantity: result === 'UNKNOWN' ? 0 : 1,
    },
    frame: runtimeFrame(),
    latched: result !== 'UNKNOWN',
  };
}
