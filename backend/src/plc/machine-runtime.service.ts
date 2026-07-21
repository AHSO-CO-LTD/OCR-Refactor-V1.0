import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LineSessionEndReason } from '@prisma/client';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { InspectionsService } from '../inspections/inspections.service';
import {
  MachineOperationModeDto,
  UpdateMachineRuntimeControlsDto,
} from './dto/machine-runtime.dto';
import { PlcRuntimeEvent, PlcRuntimeService } from './plc-runtime.service';

const DEFAULT_CAMERA_RESTORE_TIMEOUT_MS = 60 * 1000;
const CAMERA_RETRY_INTERVAL_MS = 2000;
const CONTINUOUS_DETECTION_DELAY_MS = 25;
const PLC_RESULT_HOLD_MS = 2000;

export type MachineRuntimeState =
  | 'inactive'
  | 'running'
  | 'stopping'
  | 'idle_machine_stop'
  | 'idle_capture_timeout'
  | 'resuming'
  | 'waiting_camera'
  | 'restart_required'
  | 'error';

type MachineIdleReason = 'machine_stop' | 'capture_timeout' | null;

type MachineRuntimeStep = {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  message: string;
  at: string;
};

type ResumeSessionContext = {
  productId: string;
  operatorId: string;
};

type MachineOperationMode = 'manual' | 'auto';
type MachineTriggerSource = 'manual' | 'plc';
type MachineTriggerAction = 'ignored' | 'captured' | 'latched' | 'unknown';
type MachineRuntimeFrame = {
  jobId: string;
  productId: string;
  imageBase64: string;
  width: number;
  height: number;
  capturedAt: string;
};

@Injectable()
export class MachineRuntimeService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MachineRuntimeService.name);
  private inspectionsService!: InspectionsService;
  private unsubscribePlc: (() => void) | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private state: MachineRuntimeState = 'inactive';
  private idleReason: MachineIdleReason = null;
  private steps: MachineRuntimeStep[] = [];
  private message: string | null = null;
  private countdownSeconds: number | null = null;
  private lastActivityAt: string | null = null;
  private sleepTimeSeconds = 300;
  private plcOffline = false;
  private plcErrorMessage: string | null = null;
  private stepsBeforePlcOffline: MachineRuntimeStep[] | null = null;
  private updatedAt = new Date().toISOString();
  private lastPlcInspection: unknown = null;
  private lastPlcInspectionSequence = 0;
  private captureTriggerSequence = 0;
  private lastCaptureTriggerAt: string | null = null;
  private captureInProgress = false;
  private captureAbortController: AbortController | null = null;
  private detectionAbortController: AbortController | null = null;
  private detectionTimer: NodeJS.Timeout | null = null;
  private detectionLoopActive = false;
  private resultIndicatorTimer: NodeJS.Timeout | null = null;
  private latestLiveInspection: unknown = null;
  private liveInspectionSequence = 0;
  private liveInspectionError: string | null = null;
  private plcEventQueue: Promise<void> = Promise.resolve();
  private stopRequested = false;
  private destroyed = false;
  private transitionSequence = 0;
  private resumeSessionContext: ResumeSessionContext | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private operationMode: MachineOperationMode = 'auto';
  private liveCameraEnabled = true;
  private realtimeAiEnabled = true;
  private latestFrame: MachineRuntimeFrame | null = null;
  private cameraFrameSequence = 0;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly deviceToolService: DeviceToolService,
    private readonly plcRuntime: PlcRuntimeService,
  ) {}

  onApplicationBootstrap() {
    this.inspectionsService = this.moduleRef.get(InspectionsService, {
      strict: false,
    });
    this.unsubscribePlc = this.plcRuntime.subscribe((event) => {
      if (
        event.type === 'signal' &&
        event.value === true &&
        event.key === 'stopTrigger'
      ) {
        this.stopRequested = true;
        this.captureAbortController?.abort();
        this.stopContinuousDetection();
      }
      this.enqueuePlcEvent(event);
    });
    setTimeout(() => void this.restorePersistedOperation(), 0);
  }

  onModuleDestroy() {
    return this.shutdownApplication();
  }

  shutdownApplication() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.performApplicationShutdown();
    return this.shutdownPromise;
  }

  private async performApplicationShutdown() {
    this.unsubscribePlc?.();
    this.unsubscribePlc = null;
    this.clearInactivityTimer();
    this.clearCountdownTimer();
    this.clearResultIndicatorTimer();
    this.captureAbortController?.abort();
    this.captureAbortController = null;
    this.stopContinuousDetection();
    this.destroyed = true;
    this.transitionSequence += 1;
    await this.inspectionsService
      ?.stopCurrentInspection(LineSessionEndReason.app_shutdown)
      .catch((error) => {
        this.logger.error(
          `Could not close the active line session during shutdown: ${this.errorMessage(error)}`,
        );
      });
  }

  getStatus() {
    return {
      data: {
        state: this.state,
        idleReason: this.idleReason,
        steps: this.steps,
        message: this.message,
        countdownSeconds: this.countdownSeconds,
        lastActivityAt: this.lastActivityAt,
        sleepTimeSeconds: this.sleepTimeSeconds,
        plcOffline: this.plcOffline,
        plcErrorMessage: this.plcErrorMessage,
        updatedAt: this.updatedAt,
        canManualResume: this.state === 'idle_capture_timeout',
        restartRequired: this.state === 'restart_required',
        lastPlcInspection: this.lastPlcInspection,
        lastPlcInspectionSequence: this.lastPlcInspectionSequence,
        captureTriggerSequence: this.captureTriggerSequence,
        lastCaptureTriggerAt: this.lastCaptureTriggerAt,
        latestLiveInspection: this.latestLiveInspection,
        liveInspectionSequence: this.liveInspectionSequence,
        liveInspectionError: this.liveInspectionError,
        operationMode: this.operationMode,
        liveCameraEnabled: this.liveCameraEnabled,
        realtimeAiEnabled: this.realtimeAiEnabled,
        cameraFrameSequence: this.cameraFrameSequence,
      },
    };
  }

  getLatestFrame() {
    return {
      data: this.latestFrame
        ? { sequence: this.cameraFrameSequence, frame: this.latestFrame }
        : null,
    };
  }

  updateControls(dto: UpdateMachineRuntimeControlsDto) {
    if (dto.mode) {
      this.operationMode =
        dto.mode === MachineOperationModeDto.auto ? 'auto' : 'manual';
    }
    if (typeof dto.liveCameraEnabled === 'boolean') {
      this.liveCameraEnabled = dto.liveCameraEnabled;
    }
    if (typeof dto.realtimeAiEnabled === 'boolean') {
      this.realtimeAiEnabled = dto.realtimeAiEnabled;
    }

    this.reconcileContinuousDetection();
    this.touch();
    return this.getStatus();
  }

  async startOperation() {
    if (
      this.state === 'stopping' ||
      this.state === 'resuming' ||
      this.state === 'waiting_camera'
    ) {
      throw new BadRequestException('Machine transition is in progress');
    }
    if (this.state === 'idle_machine_stop') {
      throw new BadRequestException(
        'Machine stop requires the PLC start signal before operation can resume',
      );
    }
    if (this.state === 'idle_capture_timeout') {
      throw new BadRequestException(
        'Use the resume flow after the five-minute capture timeout',
      );
    }
    if (this.state === 'restart_required') {
      throw new BadRequestException('Application restart is required');
    }

    if (this.state === 'running') {
      this.reconcileContinuousDetection();
      await this.recordActivity();
      return this.getStatus();
    }

    await this.resumeOperation(true);
    return this.getStatus();
  }

  async notifyManualLatch() {
    if (this.state === 'running') await this.recordActivity();
    return this.getStatus();
  }

  async grabManually() {
    const result = await this.executeTrigger('manual');
    return {
      data: {
        ...this.getStatus().data,
        action: result.action,
        inspection: result.inspection,
      },
    };
  }

  async stopOperation() {
    this.transitionSequence += 1;
    this.captureAbortController?.abort();
    this.stopContinuousDetection();
    this.clearInactivityTimer();
    this.clearCountdownTimer();
    this.steps = [];
    this.message = null;
    this.idleReason = null;
    this.countdownSeconds = null;
    this.setState('inactive');
    await this.clearResultIndicators().catch(() => undefined);
    return this.getStatus();
  }

  async resumeCaptureTimeout() {
    if (this.state !== 'idle_capture_timeout') {
      throw new BadRequestException(
        'Manual resume is only available after the five-minute capture timeout',
      );
    }
    await this.resumeOperation(false, true);
    return this.getStatus();
  }

  async reconnectPlc() {
    if (this.state === 'stopping') {
      throw new BadRequestException('Machine stop is in progress');
    }

    const previousState = this.state;
    const sequence = ++this.transitionSequence;
    this.steps = [
      this.step('plc', 'pending', 'Kết nối lại PLC.'),
      this.step('power', 'pending', 'Cấp nguồn camera.'),
      this.step('light', 'pending', 'Bật đèn soi camera.'),
    ];
    this.message = null;
    this.setState('resuming');
    let activeStep: 'plc' | 'power' | 'light' = 'plc';

    try {
      await this.plcRuntime.ensureConnected();
      this.updateStep('plc', 'done');
      if (sequence !== this.transitionSequence) return this.getStatus();

      activeStep = 'power';
      await this.plcRuntime.setFixedOutput('cameraPower', true);
      this.updateStep('power', 'done');
      if (sequence !== this.transitionSequence) return this.getStatus();

      activeStep = 'light';
      await this.plcRuntime.setFixedOutput('cameraLight', true);
      this.updateStep('light', 'done');

      activeStep = 'plc';
      const runtimeStatus = await this.plcRuntime.getRuntimeStatus();
      if (!runtimeStatus.data.connected) {
        throw new Error(
          runtimeStatus.data.lastError ?? 'PLC connection was lost',
        );
      }
      this.plcOffline = false;
      this.plcErrorMessage = null;
      this.message = null;

      if (previousState === 'running') {
        this.setState('running');
        await this.showWaitingCheckingIndicator();
        await this.recordActivity();
        return this.getStatus();
      }

      this.state = 'inactive';
      await this.resumeOperation(
        false,
        previousState === 'idle_machine_stop' ||
          previousState === 'idle_capture_timeout',
      );
      return this.getStatus();
    } catch (error) {
      const message = this.errorMessage(error);
      this.plcOffline = true;
      this.plcErrorMessage = message;
      this.message = message;
      if (activeStep === 'plc') {
        this.steps = this.steps.map((step) =>
          step.id === 'power' || step.id === 'light'
            ? { ...step, status: 'pending' as const }
            : step,
        );
      }
      this.updateStep(activeStep, 'failed', message);
      this.setState(previousState === 'running' ? 'running' : previousState);
      throw error;
    }
  }

  private enqueuePlcEvent(event: PlcRuntimeEvent) {
    const next = this.plcEventQueue.then(async () => {
      if (!this.destroyed) await this.handlePlcEvent(event);
    });
    this.plcEventQueue = next.catch((error) => {
      this.logger.error(
        `PLC machine event failed: ${this.errorMessage(error)}`,
      );
    });
  }

  private async restorePersistedOperation() {
    try {
      const current = await this.inspectionsService.getCurrentInspection();
      if (!current.data || this.destroyed) return;
      await this.plcEventQueue;
      if (this.state !== 'inactive' || this.destroyed) return;
      await this.resumeOperation(true);
    } catch (error) {
      if (this.destroyed) return;
      this.message = this.errorMessage(error);
      this.setState('error');
      this.logger.error(`Machine runtime recovery failed: ${this.message}`);
    }
  }

  private async handlePlcEvent(event: PlcRuntimeEvent) {
    if (event.type === 'status' && event.state === 'connected') {
      const previousPlcError = this.plcErrorMessage;
      this.plcOffline = false;
      this.plcErrorMessage = null;
      if (previousPlcError && this.message === previousPlcError) {
        this.message = null;
      }
      if (this.stepsBeforePlcOffline) {
        if (this.state !== 'resuming') {
          this.steps = this.stepsBeforePlcOffline;
        }
        this.stepsBeforePlcOffline = null;
      }
      this.touch();
      return;
    }

    if (
      event.type === 'error' ||
      (event.type === 'status' &&
        (event.state === 'disconnected' ||
          event.state === 'reconnecting' ||
          event.state === 'error'))
    ) {
      if (!this.plcOffline) {
        this.stepsBeforePlcOffline = this.steps.map((step) => ({ ...step }));
      }
      this.plcOffline = true;
      this.plcErrorMessage = event.message ?? 'PLC is not connected';
      this.message = this.plcErrorMessage;
      this.steps = [this.step('plc', 'failed', this.plcErrorMessage)];
      this.touch();
      return;
    }

    if (event.type !== 'signal' || event.value !== true || !event.key) return;

    if (event.key === 'captureTrigger') {
      this.captureTriggerSequence += 1;
      this.lastCaptureTriggerAt = event.at;
      this.touch();
    }

    if (event.key === 'stopTrigger') {
      this.stopRequested = false;
      await this.stopForMachineSignal();
      return;
    }

    if (event.key === 'startTrigger') {
      if (this.state === 'idle_machine_stop') {
        await this.resumeOperation(true, true);
      } else if (this.state === 'idle_capture_timeout') {
        await this.resumeOperation(false, true);
      }
      return;
    }

    if (event.key === 'captureTrigger') {
      if (this.operationMode !== 'auto') return;
      if (this.state === 'idle_capture_timeout') {
        await this.resumeOperation(false, true);
        return;
      }
      if (this.state === 'running' && !this.stopRequested) {
        await this.captureFromPlc();
      }
    }
  }

  private async captureFromPlc() {
    await this.executeTrigger('plc');
  }

  private async executeTrigger(source: MachineTriggerSource): Promise<{
    action: MachineTriggerAction;
    inspection: unknown;
  }> {
    if (
      this.captureInProgress ||
      this.state !== 'running' ||
      this.stopRequested ||
      (source === 'plc' && this.operationMode !== 'auto') ||
      (source === 'manual' && this.operationMode !== 'manual')
    ) {
      return { action: 'ignored', inspection: null };
    }

    if (!this.realtimeAiEnabled && this.liveCameraEnabled) {
      return { action: 'ignored', inspection: null };
    }

    this.captureInProgress = true;
    const abortController = new AbortController();
    this.captureAbortController = abortController;
    try {
      if (!this.realtimeAiEnabled) {
        const response = await this.inspectionsService.captureRunningFrame(
          abortController.signal,
        );
        if (abortController.signal.aborted || this.stopRequested) {
          return { action: 'ignored', inspection: null };
        }
        this.storeLatestFrame(response.data);
        await this.recordActivity();
        return { action: 'captured', inspection: null };
      }

      const response = this.liveCameraEnabled
        ? await this.inspectionsService.latchLatestRunningInspection(
            abortController.signal,
          )
        : await this.inspectionsService.captureAndLatchRunningInspection(
            abortController.signal,
          );
      if (abortController.signal.aborted || this.stopRequested) {
        return { action: 'ignored', inspection: null };
      }
      if (!this.liveCameraEnabled) this.storeLatestFrame(response.frame);
      await this.recordActivity();

      if (!response.latched) {
        return { action: 'unknown', inspection: null };
      }

      if (source === 'plc') {
        this.lastPlcInspection = response.data;
        this.lastPlcInspectionSequence += 1;
        this.touch();
        await this.showPulsedResultIndicator(
          response.data.lastResult?.result,
          response.data.quantity,
        ).catch((error) => {
          this.logger.error(
            `PLC result pulse failed: ${this.errorMessage(error)}`,
          );
        });
      }

      return { action: 'latched', inspection: response.data };
    } catch (error) {
      if (abortController.signal.aborted) {
        return { action: 'ignored', inspection: null };
      }
      this.message = this.errorMessage(error);
      this.touch();
      this.logger.error(`${source} capture failed: ${this.message}`);
      throw error;
    } finally {
      if (this.captureAbortController === abortController) {
        this.captureAbortController = null;
      }
      this.captureInProgress = false;
    }
  }

  private storeLatestFrame(frame: MachineRuntimeFrame) {
    this.latestFrame = frame;
    this.cameraFrameSequence += 1;
    this.touch();
  }

  private reconcileContinuousDetection() {
    if (
      this.state === 'running' &&
      this.liveCameraEnabled &&
      this.realtimeAiEnabled
    ) {
      this.startContinuousDetection();
      return;
    }

    this.stopContinuousDetection();
  }

  private startContinuousDetection() {
    if (this.detectionLoopActive || this.destroyed) return;
    this.detectionLoopActive = true;
    void this.runContinuousDetection();
  }

  private stopContinuousDetection() {
    this.detectionLoopActive = false;
    if (this.detectionTimer) clearTimeout(this.detectionTimer);
    this.detectionTimer = null;
    this.detectionAbortController?.abort();
    this.detectionAbortController = null;
    this.inspectionsService?.clearLatestRunningInspection();
    this.latestLiveInspection = null;
    this.liveInspectionError = null;
    this.touch();
  }

  private async runContinuousDetection() {
    if (
      !this.detectionLoopActive ||
      this.destroyed ||
      this.state !== 'running'
    ) {
      return;
    }

    const abortController = new AbortController();
    this.detectionAbortController = abortController;
    let nextDelayMs = CONTINUOUS_DETECTION_DELAY_MS;

    try {
      const response =
        await this.inspectionsService.refreshLatestRunningInspection(
          abortController.signal,
        );
      if (
        abortController.signal.aborted ||
        !this.detectionLoopActive ||
        this.state !== 'running'
      ) {
        return;
      }
      this.latestLiveInspection = response.data;
      this.liveInspectionSequence += 1;
      this.liveInspectionError = null;
      this.touch();
    } catch (error) {
      if (abortController.signal.aborted || !this.detectionLoopActive) return;
      const message = this.errorMessage(error);
      if (message !== this.liveInspectionError) {
        this.logger.error(`Continuous detection failed: ${message}`);
      }
      this.liveInspectionError = message;
      this.touch();
      nextDelayMs = CAMERA_RETRY_INTERVAL_MS;
    } finally {
      if (this.detectionAbortController === abortController) {
        this.detectionAbortController = null;
      }
      if (
        this.detectionLoopActive &&
        !this.destroyed &&
        this.state === 'running'
      ) {
        this.detectionTimer = setTimeout(
          () => void this.runContinuousDetection(),
          nextDelayMs,
        );
      }
    }
  }

  private async stopForMachineSignal() {
    if (this.state === 'stopping' || this.state === 'idle_machine_stop') return;
    this.captureAbortController?.abort();
    this.stopContinuousDetection();
    const sequence = ++this.transitionSequence;
    this.clearInactivityTimer();
    this.clearCountdownTimer();
    this.idleReason = 'machine_stop';
    this.message = null;
    this.steps = [
      this.step('session', 'pending', 'Kết thúc session Line hiện tại.'),
      this.step('signal', 'done', 'Đã nhận tín hiệu dừng máy từ PLC.'),
      this.step('camera', 'pending', 'Ngắt kết nối camera.'),
      this.step('outputs', 'pending', 'Tắt đèn soi và nguồn camera.'),
      this.step('idle', 'pending', 'Chuyển ứng dụng về trạng thái nghỉ.'),
    ];
    this.setState('stopping');

    await this.runTransitionStep('session', async () => {
      const stopped = await this.inspectionsService.stopCurrentInspection(
        LineSessionEndReason.plc_stop,
      );
      this.resumeSessionContext = stopped.data
        ? {
            productId: stopped.data.productId,
            operatorId: stopped.data.operatorId,
          }
        : null;
    });
    if (sequence !== this.transitionSequence) return;

    await this.runTransitionStep('camera', async () => {
      await this.deviceToolService.stopCameraOcr().catch(() => undefined);
      await this.deviceToolService.disconnectCamera();
    });
    if (sequence !== this.transitionSequence) return;

    await this.runTransitionStep('outputs', async () => {
      await this.clearResultIndicators();
      await this.plcRuntime.setFixedOutput('cameraLight', false);
      await this.plcRuntime.setFixedOutput('cameraPower', false);
    });
    if (sequence !== this.transitionSequence) return;

    this.updateStep(
      'idle',
      'done',
      'Đã tắt camera và đèn. Ứng dụng đang nghỉ.',
    );
    this.setState('idle_machine_stop');
  }

  private async stopForCaptureTimeout() {
    if (this.state !== 'running') return;
    this.stopContinuousDetection();
    const sequence = ++this.transitionSequence;
    this.clearInactivityTimer();
    this.idleReason = 'capture_timeout';
    this.message = null;
    this.steps = [
      this.step(
        'timeout',
        'done',
        'Đã hết SleepTime không nhận tín hiệu chốt.',
      ),
      this.step('camera', 'pending', 'Ngắt kết nối camera.'),
      this.step('light', 'pending', 'Tắt đèn soi. Giữ nguyên nguồn camera.'),
      this.step('idle', 'pending', 'Chuyển ứng dụng về trạng thái nghỉ.'),
    ];
    this.setState('stopping');

    await this.runTransitionStep('camera', async () => {
      await this.deviceToolService.stopCameraOcr().catch(() => undefined);
      await this.deviceToolService.disconnectCamera();
    });
    if (sequence !== this.transitionSequence) return;

    await this.runTransitionStep('light', async () => {
      await this.clearResultIndicators();
      await this.plcRuntime.setFixedOutput('cameraLight', false);
    });
    if (sequence !== this.transitionSequence) return;

    this.updateStep(
      'idle',
      'done',
      'Ứng dụng đang nghỉ; nguồn camera vẫn bật.',
    );
    this.setState('idle_capture_timeout');
  }

  private async resumeOperation(
    restoreCameraPower: boolean,
    restoreDefaultControls = false,
  ) {
    if (
      this.state === 'resuming' ||
      this.state === 'waiting_camera' ||
      this.state === 'running'
    ) {
      return;
    }

    if (restoreDefaultControls) this.restoreDefaultRuntimeControls();
    const sequence = ++this.transitionSequence;
    this.clearInactivityTimer();
    this.clearCountdownTimer();
    this.message = null;
    this.steps = [
      this.step('plc', 'pending', 'Kết nối PLC.'),
      this.step(
        'power',
        restoreCameraPower ? 'pending' : 'done',
        restoreCameraPower
          ? 'Cấp nguồn camera.'
          : 'Nguồn camera vẫn được giữ bật.',
      ),
      this.step('light', 'pending', 'Bật đèn soi camera.'),
      this.step('camera', 'pending', 'Kết nối camera và chờ frame thực tế.'),
      this.step('running', 'pending', 'Tiếp tục vận hành.'),
    ];
    this.setState('resuming');

    const plcReady = await this.runTransitionStep('plc', () =>
      this.plcRuntime.ensureConnected().then(() => undefined),
    );
    this.plcOffline = !plcReady;
    this.plcErrorMessage = plcReady ? null : this.message;
    if (sequence !== this.transitionSequence) return;

    if (restoreCameraPower && plcReady) {
      const powerReady = await this.runTransitionStep('power', () =>
        this.plcRuntime
          .setFixedOutput('cameraPower', true)
          .then(() => undefined),
      );
      if (!powerReady) {
        this.plcOffline = true;
        this.plcErrorMessage = this.message;
      }
      if (sequence !== this.transitionSequence) return;
    } else if (restoreCameraPower) {
      this.updateStep(
        'power',
        'done',
        'Bỏ qua điều khiển nguồn vì PLC chưa kết nối.',
      );
    }

    if (plcReady) {
      const lightReady = await this.runTransitionStep('light', () =>
        this.plcRuntime
          .setFixedOutput('cameraLight', true)
          .then(() => undefined),
      );
      if (!lightReady) {
        this.plcOffline = true;
        this.plcErrorMessage = this.message;
      }
    } else {
      this.updateStep(
        'light',
        'done',
        'Bỏ qua điều khiển đèn vì PLC chưa kết nối.',
      );
    }
    if (sequence !== this.transitionSequence) return;

    if (this.resumeSessionContext) {
      try {
        await this.inspectionsService.beginInspectionSession(
          { productId: this.resumeSessionContext.productId },
          {
            id: this.resumeSessionContext.operatorId,
            username: 'plc-resume',
            role: 'operator',
          },
        );
        this.resumeSessionContext = null;
      } catch (error) {
        this.message = this.errorMessage(error);
        this.updateStep('camera', 'failed', this.message);
        this.setState('error');
        return;
      }
    }

    this.setState('waiting_camera');
    const restored = await this.waitForCameraFrame(sequence);
    if (!restored || sequence !== this.transitionSequence) return;

    this.updateStep(
      'running',
      'done',
      'Camera đã có frame. Tiếp tục vận hành.',
    );
    this.idleReason = null;
    this.setState('running');
    this.reconcileContinuousDetection();
    if (plcReady) {
      await this.showWaitingCheckingIndicator().catch((error) => {
        this.logger.error(
          `PLC waiting indicator update failed: ${this.errorMessage(error)}`,
        );
      });
    }
    if (this.plcOffline) this.message = this.plcErrorMessage;
    await this.recordActivity();
  }

  private restoreDefaultRuntimeControls() {
    this.operationMode = 'auto';
    this.liveCameraEnabled = true;
    this.realtimeAiEnabled = true;
    this.touch();
  }

  private async waitForCameraFrame(sequence: number) {
    const timeoutMs = DEFAULT_CAMERA_RESTORE_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    this.countdownSeconds = Math.ceil(timeoutMs / 1000);
    this.updateStep('camera', 'running', 'Đang kết nối camera và chờ frame...');
    this.countdownTimer = setInterval(() => {
      this.countdownSeconds = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000),
      );
      this.touch();
    }, 1000);

    while (Date.now() < deadline && sequence === this.transitionSequence) {
      try {
        await this.inspectionsService.verifyRunningInspectionCameraFrame();
        this.clearCountdownTimer();
        this.countdownSeconds = null;
        this.updateStep(
          'camera',
          'done',
          'Đã kết nối camera và nhận được frame.',
        );
        return true;
      } catch (error) {
        this.message = this.errorMessage(error);
        await this.delay(CAMERA_RETRY_INTERVAL_MS);
      }
    }

    this.clearCountdownTimer();
    this.countdownSeconds = 0;
    this.updateStep(
      'camera',
      'failed',
      'Không kết nối được camera trong 60 giây.',
    );
    this.message =
      'Không thể nhận frame từ camera. Cần khởi động lại ứng dụng.';
    this.setState('restart_required');
    return false;
  }

  private async recordActivity() {
    this.lastActivityAt = new Date().toISOString();
    this.touch();
    this.clearInactivityTimer();
    if (this.state !== 'running') return;
    const timeoutMs = await this.plcRuntime
      .getSleepTimeMilliseconds()
      .catch(() => this.sleepTimeSeconds * 1000);
    this.sleepTimeSeconds = Math.max(1, Math.round(timeoutMs / 1000));
    this.inactivityTimer = setTimeout(() => {
      void this.stopForCaptureTimeout();
    }, timeoutMs);
  }

  private async runTransitionStep(id: string, operation: () => Promise<void>) {
    this.updateStep(id, 'running');
    try {
      await operation();
      this.updateStep(id, 'done');
      return true;
    } catch (error) {
      const message = this.errorMessage(error);
      this.updateStep(id, 'failed', message);
      this.message = message;
      this.logger.error(`Machine transition step ${id} failed: ${message}`);
      return false;
    }
  }

  private step(
    id: string,
    status: MachineRuntimeStep['status'],
    message: string,
  ): MachineRuntimeStep {
    return { id, status, message, at: new Date().toISOString() };
  }

  private updateStep(
    id: string,
    status: MachineRuntimeStep['status'],
    message?: string,
  ) {
    this.steps = this.steps.map((step) =>
      step.id === id
        ? {
            ...step,
            status,
            message: message ?? step.message,
            at: new Date().toISOString(),
          }
        : step,
    );
    this.touch();
  }

  private setState(state: MachineRuntimeState) {
    this.state = state;
    this.touch();
  }

  private touch() {
    this.updatedAt = new Date().toISOString();
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = null;
  }

  private clearCountdownTimer() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  private clearResultIndicatorTimer() {
    if (this.resultIndicatorTimer) clearTimeout(this.resultIndicatorTimer);
    this.resultIndicatorTimer = null;
  }

  private async clearResultIndicators() {
    this.clearResultIndicatorTimer();
    await this.plcRuntime.setFixedOutput('waitingChecking', false);
  }

  private async showWaitingCheckingIndicator() {
    this.clearResultIndicatorTimer();
    await this.plcRuntime.setFixedOutput('waitingChecking', true);
  }

  private async showPulsedResultIndicator(
    result: string | undefined,
    recognizedQuantity: number,
  ) {
    this.clearResultIndicatorTimer();
    await this.plcRuntime.setFixedOutput('waitingChecking', false);
    if (result === 'OK') {
      await this.plcRuntime.pulseOkResult();
    } else if (result === 'NG' && recognizedQuantity > 0) {
      await this.plcRuntime.pulseError();
    }
    this.resultIndicatorTimer = setTimeout(() => {
      this.resultIndicatorTimer = null;
      if (this.state !== 'running' || this.destroyed) return;
      void this.showWaitingCheckingIndicator().catch((error) => {
        this.logger.error(
          `PLC waiting indicator restore failed: ${this.errorMessage(error)}`,
        );
      });
    }, PLC_RESULT_HOLD_MS);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
