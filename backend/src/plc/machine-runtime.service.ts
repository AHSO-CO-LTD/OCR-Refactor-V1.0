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
  MachineTestResultDto,
  PulseMachineTestResultDto,
  UpdateMachineInactivitySettingsDto,
  UpdateMachineStopSettingsDto,
  UpdateMachineRuntimeControlsDto,
  UpdateMachineTestModeDto,
  UpdateMachineTestOutputDto,
} from './dto/machine-runtime.dto';
import { PlcRuntimeEvent, PlcRuntimeService } from './plc-runtime.service';

const DEFAULT_CAMERA_RESTORE_TIMEOUT_MS = 60 * 1000;
const CAMERA_RETRY_INTERVAL_MS = 2000;
const CAMERA_DISCONNECT_POWER_DELAY_MS = 5_000;
const CONTINUOUS_DETECTION_DELAY_MS = 25;
const TEST_MODE_LEASE_TTL_MS = 15_000;

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

type MachineOperationMode = 'manual' | 'auto';
type MachineTriggerSource = 'manual' | 'plc';
type MachineTriggerAction = 'ignored' | 'captured' | 'latched' | 'unknown';
type MachineTestModeLease = {
  expiresAt: number;
  outputEnabled: boolean;
};
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
  private stopTimer: NodeJS.Timeout | null = null;
  private stopCountdownTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private state: MachineRuntimeState = 'inactive';
  private idleReason: MachineIdleReason = null;
  private steps: MachineRuntimeStep[] = [];
  private message: string | null = null;
  private countdownSeconds: number | null = null;
  private stopCountdownSeconds: number | null = null;
  private lastActivityAt: string | null = null;
  private inactivityTimeoutEnabled = true;
  private sleepTimeSeconds = 300;
  private stopDelaySeconds = 5;
  private powerOffCameraOnStop = true;
  private inactivityRevision = 0;
  private stopRevision = 0;
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
  private cameraRestoreAbortController: AbortController | null = null;
  private detectionAbortController: AbortController | null = null;
  private detectionTimer: NodeJS.Timeout | null = null;
  private detectionLoopActive = false;
  private latestLiveInspection: unknown = null;
  private liveInspectionSequence = 0;
  private liveInspectionError: string | null = null;
  private plcEventQueue: Promise<void> = Promise.resolve();
  private stopRequested = false;
  private destroyed = false;
  private transitionSequence = 0;
  private shutdownPromise: Promise<void> | null = null;
  private operationMode: MachineOperationMode = 'auto';
  private liveCameraEnabled = true;
  private realtimeAiEnabled = true;
  private latestFrame: MachineRuntimeFrame | null = null;
  private cameraFrameSequence = 0;
  private readonly testModeLeases = new Map<string, MachineTestModeLease>();

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
        event.key === 'captureTrigger' &&
        this.state === 'running'
      ) {
        void this.recordActivity();
      }
      if (
        event.type === 'signal' &&
        event.value === true &&
        event.key === 'stopTrigger'
      ) {
        void this.scheduleMachineStop().catch((error) => {
          this.logger.error(
            `PLC stop scheduling failed: ${this.errorMessage(error)}`,
          );
        });
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
    this.clearStopTimer();
    this.clearCountdownTimer();
    this.captureAbortController?.abort();
    this.captureAbortController = null;
    this.cameraRestoreAbortController?.abort();
    this.cameraRestoreAbortController = null;
    this.stopContinuousDetection();
    this.testModeLeases.clear();
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
        stopCountdownSeconds: this.stopCountdownSeconds,
        lastActivityAt: this.lastActivityAt,
        inactivityTimeoutEnabled: this.inactivityTimeoutEnabled,
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
        testModeActive: this.hasActiveTestModeLease(),
        testOutputEnabled: this.hasEnabledTestOutput(),
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

  async getInactivitySettings() {
    const response = await this.plcRuntime.getMachineInactivitySettings();
    this.inactivityTimeoutEnabled = response.data.enabled;
    this.sleepTimeSeconds = response.data.timeoutSeconds;
    return response;
  }

  async updateInactivitySettings(dto: UpdateMachineInactivitySettingsDto) {
    const response = await this.plcRuntime.updateMachineInactivitySettings(dto);
    this.inactivityTimeoutEnabled = response.data.enabled;
    this.sleepTimeSeconds = response.data.timeoutSeconds;
    if (this.state === 'running') {
      await this.recordActivity();
    }
    return response;
  }

  async getStopSettings() {
    const response = await this.plcRuntime.getMachineStopSettings();
    this.stopDelaySeconds = response.data.delaySeconds;
    this.powerOffCameraOnStop = response.data.powerOffCameraOnStop ?? true;
    return response;
  }

  async updateStopSettings(dto: UpdateMachineStopSettingsDto) {
    const response = await this.plcRuntime.updateMachineStopSettings(dto);
    this.stopDelaySeconds = response.data.delaySeconds;
    this.powerOffCameraOnStop = response.data.powerOffCameraOnStop ?? true;
    return response;
  }

  async notifyUserActivity() {
    if (this.state === 'running') {
      await this.recordActivity();
    }
    return this.getStatus();
  }

  async updateTestMode(dto: UpdateMachineTestModeDto) {
    this.pruneExpiredTestModeLeases(false);
    const existingLease = this.testModeLeases.get(dto.clientId);
    let leaseMembershipChanged = false;
    if (dto.active) {
      this.testModeLeases.set(dto.clientId, {
        expiresAt: Date.now() + TEST_MODE_LEASE_TTL_MS,
        outputEnabled: existingLease?.outputEnabled ?? false,
      });
      leaseMembershipChanged = !existingLease;
    } else if (existingLease) {
      this.testModeLeases.delete(dto.clientId);
      leaseMembershipChanged = true;
    }
    if (leaseMembershipChanged) {
      await this.setWaitingCheckingIndicator(
        this.desiredWaitingCheckingState(),
      ).catch((error) => {
        this.logger.warn(
          `PLC test waiting indicator synchronization failed: ${this.errorMessage(error)}`,
        );
      });
    }
    this.touch();
    return this.getStatus();
  }

  updateTestOutput(dto: UpdateMachineTestOutputDto) {
    const lease = this.getActiveTestModeLease(dto.clientId);
    if (!lease) {
      throw new BadRequestException('PLC test session is not active');
    }

    if (lease.outputEnabled !== dto.enabled) {
      lease.outputEnabled = dto.enabled;
      lease.expiresAt = Date.now() + TEST_MODE_LEASE_TTL_MS;
    }
    this.touch();
    return this.getStatus();
  }

  async pulseTestResult(dto: PulseMachineTestResultDto) {
    const lease = this.getActiveTestModeLease(dto.clientId);
    if (!lease) {
      throw new BadRequestException('PLC test session is not active');
    }
    if (!lease.outputEnabled) {
      throw new BadRequestException('PLC test output is not enabled');
    }

    lease.expiresAt = Date.now() + TEST_MODE_LEASE_TTL_MS;
    await this.showPulsedTestResultIndicator(dto.result);

    return {
      data: {
        pulsed: true,
        result: dto.result,
      },
    };
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
      if (!this.plcOffline) {
        await this.syncWaitingCheckingIndicator().catch((error) => {
          this.logger.error(
            `PLC waiting indicator resynchronization failed: ${this.errorMessage(error)}`,
          );
        });
      }
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
    if (this.state === 'running') {
      await this.recordActivity();
    }
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
    this.clearStopTimer();
    this.transitionSequence += 1;
    this.captureAbortController?.abort();
    this.cameraRestoreAbortController?.abort();
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
        await this.syncWaitingCheckingIndicator();
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
      if (this.hasActiveTestModeLease()) {
        await this.syncWaitingCheckingIndicator().catch((error) => {
          this.logger.error(
            `PLC test waiting indicator reconnect synchronization failed: ${this.errorMessage(error)}`,
          );
        });
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
      if (this.hasActiveTestModeLease()) return;
    }

    if (event.key === 'stopTrigger') {
      return;
    }

    if (event.key === 'startTrigger') {
      this.clearStopTimer();
      this.stopRequested = false;
      if (this.state === 'idle_machine_stop') {
        await this.resumeOperation(this.powerOffCameraOnStop, true);
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

  private async scheduleMachineStop() {
    if (
      this.stopTimer ||
      this.state === 'stopping' ||
      this.state === 'idle_machine_stop'
    ) {
      return;
    }

    const revision = ++this.stopRevision;
    const settings = await this.plcRuntime
      .getMachineStopSettings()
      .then((response) => response.data)
      .catch(() => ({
        delaySeconds: this.stopDelaySeconds,
        powerOffCameraOnStop: this.powerOffCameraOnStop,
      }));
    if (revision !== this.stopRevision || this.state !== 'running') return;

    this.stopDelaySeconds = Math.max(0, settings.delaySeconds);
    this.powerOffCameraOnStop = settings.powerOffCameraOnStop ?? true;
    const delayMs = this.stopDelaySeconds * 1000;
    if (delayMs === 0) {
      this.clearStopCountdown();
      this.executeScheduledMachineStop(revision);
      return;
    }

    const stopDeadline = Date.now() + delayMs;
    this.stopCountdownSeconds = this.stopDelaySeconds;
    this.stopCountdownTimer = setInterval(() => {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((stopDeadline - Date.now()) / 1000),
      );
      if (remainingSeconds === this.stopCountdownSeconds) return;
      this.stopCountdownSeconds = remainingSeconds;
      this.touch();
    }, 250);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.clearStopCountdown();
      this.executeScheduledMachineStop(revision);
    }, delayMs);
    this.touch();
  }

  private executeScheduledMachineStop(revision: number) {
    if (revision !== this.stopRevision || this.state !== 'running') return;
    this.stopRequested = true;
    this.captureAbortController?.abort();
    this.cameraRestoreAbortController?.abort();
    this.stopContinuousDetection();
    const next = this.plcEventQueue.then(async () => {
      if (!this.destroyed) await this.stopForMachineSignal();
    });
    this.plcEventQueue = next.catch((error) => {
      this.logger.error(
        `PLC stop transition failed: ${this.errorMessage(error)}`,
      );
    });
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
      this.step('session', 'done', 'Giữ nguyên session Line hiện tại.'),
      this.step('signal', 'done', 'Đã nhận tín hiệu dừng máy từ PLC.'),
      this.step(
        'camera',
        'pending',
        this.powerOffCameraOnStop
          ? 'Ngắt kết nối camera và chờ 5 giây trước khi tắt nguồn.'
          : 'Ngắt kết nối camera.',
      ),
      this.step(
        'outputs',
        'pending',
        this.powerOffCameraOnStop
          ? 'Tắt đèn soi và nguồn camera.'
          : 'Tắt đèn soi; giữ nguyên nguồn camera.',
      ),
      this.step('idle', 'pending', 'Chuyển ứng dụng về trạng thái nghỉ.'),
    ];
    this.setState('stopping');

    await this.runTransitionStep('camera', async () => {
      await this.deviceToolService.stopCameraOcr().catch(() => undefined);
      await this.deviceToolService.disconnectCamera();
      if (this.powerOffCameraOnStop) {
        await this.delay(CAMERA_DISCONNECT_POWER_DELAY_MS);
      }
    });
    if (sequence !== this.transitionSequence) return;

    await this.runTransitionStep('outputs', async () => {
      await this.clearResultIndicators();
      await this.plcRuntime.setFixedOutput('cameraLight', false);
      if (this.powerOffCameraOnStop) {
        await this.plcRuntime.setFixedOutput('cameraPower', false);
      }
    });
    if (sequence !== this.transitionSequence) return;

    this.updateStep(
      'idle',
      'done',
      this.powerOffCameraOnStop
        ? 'Đã tắt camera và đèn. Ứng dụng đang nghỉ.'
        : 'Đã ngắt camera và tắt đèn. Nguồn camera vẫn bật.',
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

    this.setState('waiting_camera');
    const restored = await this.waitForCameraFrame(sequence);
    if (!restored || sequence !== this.transitionSequence) {
      if (
        sequence === this.transitionSequence &&
        this.getStatus().data.state === 'waiting_camera' &&
        !this.stopRequested &&
        !this.destroyed
      ) {
        void this.continueWaitingForCameraFrame(sequence, plcReady);
      }
      return;
    }
    await this.completeCameraRestore(sequence, plcReady);
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
    const abortController = new AbortController();
    this.cameraRestoreAbortController?.abort();
    this.cameraRestoreAbortController = abortController;
    let attempts = 0;
    try {
      this.countdownSeconds = Math.ceil(timeoutMs / 1000);
      this.updateStep(
        'camera',
        'running',
        'Đang kết nối camera và chờ frame...',
      );
      this.countdownTimer = setInterval(() => {
        this.countdownSeconds = Math.max(
          0,
          Math.ceil((deadline - Date.now()) / 1000),
        );
        this.touch();
      }, 1000);

      while (
        Date.now() < deadline &&
        sequence === this.transitionSequence &&
        !this.destroyed &&
        !this.stopRequested &&
        !abortController.signal.aborted
      ) {
        attempts += 1;
        try {
          await this.inspectionsService.verifyRunningInspectionCameraFrame(
            abortController.signal,
          );
          this.clearCountdownTimer();
          this.countdownSeconds = null;
          this.message = null;
          this.updateStep(
            'camera',
            'done',
            'Đã kết nối camera và nhận được frame.',
          );
          return true;
        } catch (error) {
          if (
            abortController.signal.aborted ||
            this.stopRequested ||
            sequence !== this.transitionSequence
          ) {
            break;
          }
          this.message = this.errorMessage(error);
          if (attempts === 1 || attempts % 5 === 0) {
            this.logger.warn(
              `Camera restore attempt ${attempts} failed: ${this.message}`,
            );
          }
          await this.delay(CAMERA_RETRY_INTERVAL_MS);
        }
      }

      this.clearCountdownTimer();
      this.countdownSeconds = null;
      if (
        sequence === this.transitionSequence &&
        !this.destroyed &&
        !this.stopRequested &&
        !abortController.signal.aborted
      ) {
        this.updateStep(
          'camera',
          'running',
          'Camera chưa trả frame sau 60 giây. Hệ thống vẫn đang tự động thử lại.',
        );
      }
      return false;
    } finally {
      if (this.cameraRestoreAbortController === abortController) {
        this.cameraRestoreAbortController = null;
      }
    }
  }

  private async continueWaitingForCameraFrame(
    sequence: number,
    plcReady: boolean,
  ) {
    const abortController = new AbortController();
    this.cameraRestoreAbortController?.abort();
    this.cameraRestoreAbortController = abortController;
    let attempts = 0;

    try {
      while (
        sequence === this.transitionSequence &&
        this.state === 'waiting_camera' &&
        !this.destroyed &&
        !this.stopRequested &&
        !abortController.signal.aborted
      ) {
        attempts += 1;
        try {
          await this.inspectionsService.verifyRunningInspectionCameraFrame(
            abortController.signal,
          );
          this.message = null;
          this.updateStep(
            'camera',
            'done',
            'Đã kết nối camera và nhận được frame.',
          );
          await this.completeCameraRestore(sequence, plcReady);
          return;
        } catch (error) {
          if (
            abortController.signal.aborted ||
            this.stopRequested ||
            sequence !== this.transitionSequence
          ) {
            return;
          }
          this.message = this.errorMessage(error);
          if (attempts === 1 || attempts % 5 === 0) {
            this.logger.warn(
              `Extended camera restore attempt ${attempts} failed: ${this.message}`,
            );
          }
          await this.delay(CAMERA_RETRY_INTERVAL_MS);
        }
      }
    } finally {
      if (this.cameraRestoreAbortController === abortController) {
        this.cameraRestoreAbortController = null;
      }
    }
  }

  private async completeCameraRestore(sequence: number, plcReady: boolean) {
    if (
      sequence !== this.transitionSequence ||
      this.destroyed ||
      this.stopRequested
    ) {
      return;
    }

    this.updateStep(
      'running',
      'done',
      'Camera đã có frame. Tiếp tục vận hành.',
    );
    this.idleReason = null;
    this.setState('running');
    this.reconcileContinuousDetection();
    if (plcReady) {
      await this.syncWaitingCheckingIndicator().catch((error) => {
        this.logger.error(
          `PLC waiting indicator update failed: ${this.errorMessage(error)}`,
        );
      });
    }
    if (this.plcOffline) this.message = this.plcErrorMessage;
    await this.recordActivity();
  }

  private async recordActivity() {
    const activityRevision = ++this.inactivityRevision;
    this.lastActivityAt = new Date().toISOString();
    this.touch();
    this.clearInactivityTimer(false);
    if (this.state !== 'running') return;
    const settings = await this.plcRuntime
      .getMachineInactivitySettings()
      .then((response) => response.data)
      .catch(() => ({
        enabled: this.inactivityTimeoutEnabled,
        timeoutSeconds: this.sleepTimeSeconds,
      }));
    if (
      activityRevision !== this.inactivityRevision ||
      this.state !== 'running'
    ) {
      return;
    }
    this.inactivityTimeoutEnabled = settings.enabled;
    this.sleepTimeSeconds = Math.max(1, settings.timeoutSeconds);
    if (!this.inactivityTimeoutEnabled) return;
    const timeoutMs = this.sleepTimeSeconds * 1000;
    this.inactivityTimer = setTimeout(() => {
      if (
        activityRevision !== this.inactivityRevision ||
        !this.inactivityTimeoutEnabled
      ) {
        return;
      }
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

  private clearInactivityTimer(invalidatePendingActivity = true) {
    if (invalidatePendingActivity) this.inactivityRevision += 1;
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = null;
  }

  private clearStopTimer() {
    this.stopRevision += 1;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.clearStopCountdown();
  }

  private clearStopCountdown() {
    if (this.stopCountdownTimer) clearInterval(this.stopCountdownTimer);
    this.stopCountdownTimer = null;
    if (this.stopCountdownSeconds !== null) {
      this.stopCountdownSeconds = null;
      this.touch();
    }
  }

  private clearCountdownTimer() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  private hasActiveTestModeLease(clientId?: string) {
    this.pruneExpiredTestModeLeases();
    if (clientId) return this.testModeLeases.has(clientId);
    return this.testModeLeases.size > 0;
  }

  private getActiveTestModeLease(clientId: string) {
    this.pruneExpiredTestModeLeases();
    return this.testModeLeases.get(clientId) ?? null;
  }

  private hasEnabledTestOutput() {
    this.pruneExpiredTestModeLeases();
    return [...this.testModeLeases.values()].some(
      (lease) => lease.outputEnabled,
    );
  }

  private desiredWaitingCheckingState() {
    if (this.testModeLeases.size > 0) {
      return true;
    }
    return this.state === 'running';
  }

  private pruneExpiredTestModeLeases(syncIndicator = true) {
    const now = Date.now();
    let changed = false;
    for (const [clientId, lease] of this.testModeLeases) {
      if (lease.expiresAt <= now) {
        this.testModeLeases.delete(clientId);
        changed = true;
      }
    }
    if (changed && syncIndicator) {
      void this.syncWaitingCheckingIndicator(false).catch((error) => {
        this.logger.error(
          `PLC waiting indicator recovery failed: ${this.errorMessage(error)}`,
        );
      });
    }
  }

  private async clearResultIndicators() {
    await this.plcRuntime.setFixedOutput('waitingChecking', false);
  }

  private async setWaitingCheckingIndicator(enabled: boolean) {
    await this.plcRuntime.setFixedOutput('waitingChecking', enabled);
  }

  private async syncWaitingCheckingIndicator(pruneExpired = true) {
    if (pruneExpired) this.pruneExpiredTestModeLeases(false);
    await this.setWaitingCheckingIndicator(this.desiredWaitingCheckingState());
  }

  private async showPulsedResultIndicator(
    result: string | undefined,
    recognizedQuantity: number,
  ) {
    if (result !== 'OK' && !(result === 'NG' && recognizedQuantity > 0)) {
      return;
    }

    await this.plcRuntime.setFixedOutput('waitingChecking', false);
    try {
      if (result === 'OK') {
        await this.plcRuntime.pulseOkResult();
      } else {
        await this.plcRuntime.pulseError();
      }
    } finally {
      if (!this.destroyed) {
        await this.syncWaitingCheckingIndicator().catch((error) => {
          this.logger.error(
            `PLC waiting indicator restore failed: ${this.errorMessage(error)}`,
          );
        });
      }
    }
  }

  private async showPulsedTestResultIndicator(result: MachineTestResultDto) {
    await this.plcRuntime.setFixedOutput('waitingChecking', false);
    try {
      if (result === MachineTestResultDto.OK) {
        await this.plcRuntime.pulseOkResult();
      } else {
        await this.plcRuntime.pulseError();
      }
    } finally {
      if (!this.destroyed) {
        await this.syncWaitingCheckingIndicator().catch((error) => {
          this.logger.error(
            `PLC test waiting indicator restore failed: ${this.errorMessage(error)}`,
          );
        });
      }
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
