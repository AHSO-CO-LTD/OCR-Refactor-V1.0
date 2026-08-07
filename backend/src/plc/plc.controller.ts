import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import {
  ExecuteCustomPlcKeyDto,
  SetPlcBooleanDto,
  UpdatePlcConfigDto,
} from './dto/plc-config.dto';
import {
  PulseMachineTestResultDto,
  UpdateMachineInactivitySettingsDto,
  UpdateMachineStopSettingsDto,
  UpdateMachineRuntimeControlsDto,
  UpdateMachineTestModeDto,
  UpdateMachineTestOutputDto,
} from './dto/machine-runtime.dto';
import {
  PlcSimulatorSessionDto,
  PlcSimulatorSignalDto,
} from './dto/plc-simulator.dto';
import { PlcRuntimeService } from './plc-runtime.service';
import { MachineRuntimeService } from './machine-runtime.service';

@ApiTags('plc')
@ApiBearerAuth()
@Controller('plc')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlcController {
  constructor(
    private readonly plcRuntime: PlcRuntimeService,
    private readonly machineRuntime: MachineRuntimeService,
  ) {}

  @Get('config')
  @RequirePermissions(PERMISSIONS.PLC_MANAGE)
  @ApiOperation({ summary: 'Get machine PLC configuration' })
  getConfig() {
    return this.plcRuntime.getConfig();
  }

  @Put('config')
  @RequirePermissions(PERMISSIONS.PLC_MANAGE)
  @ApiOperation({ summary: 'Save required and custom PLC key mappings' })
  saveConfig(@Body() dto: UpdatePlcConfigDto) {
    return this.plcRuntime.saveConfig(dto);
  }

  @Get('status')
  @RequireAnyPermission(PERMISSIONS.PLC_MANAGE, PERMISSIONS.PLC_OPERATE)
  getStatus() {
    return this.plcRuntime.getRuntimeStatus();
  }

  @Post('connect')
  @RequireAnyPermission(PERMISSIONS.PLC_MANAGE, PERMISSIONS.PLC_OPERATE)
  connect() {
    return this.plcRuntime.connect();
  }

  @Post('disconnect')
  @RequireAnyPermission(PERMISSIONS.PLC_MANAGE, PERMISSIONS.PLC_OPERATE)
  disconnect() {
    return this.plcRuntime.disconnect();
  }

  @Post('simulator/enable')
  @ApiOperation({ summary: 'Enable the in-memory PLC simulator for dev only' })
  async enableSimulator(
    @Body() dto: PlcSimulatorSessionDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertDev(user);
    return this.plcRuntime.enableSimulator(dto.clientId);
  }

  @Post('simulator/heartbeat')
  @ApiOperation({ summary: 'Refresh the active dev PLC simulator lease' })
  heartbeatSimulator(
    @Body() dto: PlcSimulatorSessionDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertDev(user);
    return this.plcRuntime.heartbeatSimulator(dto.clientId);
  }

  @Post('simulator/disable')
  @ApiOperation({ summary: 'Disable the active dev PLC simulator' })
  disableSimulator(
    @Body() dto: PlcSimulatorSessionDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertDev(user);
    return this.plcRuntime.disableSimulator(dto.clientId);
  }

  @Post('simulator/signal')
  @ApiOperation({ summary: 'Emit a PLC-to-app signal from the dev simulator' })
  emitSimulatorSignal(
    @Body() dto: PlcSimulatorSignalDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertDev(user);
    return this.plcRuntime.emitSimulatorSignal(dto.clientId, dto.key);
  }

  @Put('outputs/camera-power')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  setCameraPower(@Body() dto: SetPlcBooleanDto) {
    return this.plcRuntime.setFixedOutput('cameraPower', dto.enabled);
  }

  @Put('outputs/camera-light')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  setCameraLight(@Body() dto: SetPlcBooleanDto) {
    return this.plcRuntime.setFixedOutput('cameraLight', dto.enabled);
  }

  @Post('outputs/ok-pulse')
  @RequireAnyPermission(PERMISSIONS.PLC_MANAGE, PERMISSIONS.PLC_OPERATE)
  pulseOkResult() {
    return this.plcRuntime.pulseOkResult();
  }

  @Put('outputs/waiting-checking')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  setWaitingChecking(@Body() dto: SetPlcBooleanDto) {
    return this.plcRuntime.setFixedOutput('waitingChecking', dto.enabled);
  }

  @Post('outputs/error-pulse')
  @RequireAnyPermission(PERMISSIONS.PLC_MANAGE, PERMISSIONS.PLC_OPERATE)
  pulseError() {
    return this.plcRuntime.pulseError();
  }

  @Post('custom-keys/:id/execute')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  executeCustomKey(
    @Param('id') id: string,
    @Body() dto: ExecuteCustomPlcKeyDto,
  ) {
    return this.plcRuntime.executeCustomKey(id, dto);
  }

  @Get('machine/status')
  @RequireAnyPermission(
    PERMISSIONS.PLC_MANAGE,
    PERMISSIONS.PLC_OPERATE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.CAMERA_MANAGE,
  )
  @ApiOperation({ summary: 'Get PLC-driven machine runtime state' })
  getMachineStatus() {
    return this.machineRuntime.getStatus();
  }

  @Get('machine/inactivity-settings')
  @ApiOperation({ summary: 'Get automatic machine inactivity settings' })
  getMachineInactivitySettings(
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertCanManageInactivitySettings(user);
    return this.machineRuntime.getInactivitySettings();
  }

  @Put('machine/inactivity-settings')
  @ApiOperation({ summary: 'Update automatic machine inactivity settings' })
  updateMachineInactivitySettings(
    @Body() dto: UpdateMachineInactivitySettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertCanManageInactivitySettings(user);
    return this.machineRuntime.updateInactivitySettings(dto);
  }

  @Get('machine/stop-settings')
  @ApiOperation({ summary: 'Get PLC stop delay settings' })
  getMachineStopSettings(@CurrentUser() user: AuthenticatedRequest['user']) {
    this.assertCanManageMachineStopSettings(user);
    return this.machineRuntime.getStopSettings();
  }

  @Put('machine/stop-settings')
  @ApiOperation({ summary: 'Update PLC stop delay settings' })
  updateMachineStopSettings(
    @Body() dto: UpdateMachineStopSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    this.assertCanManageMachineStopSettings(user);
    return this.machineRuntime.updateStopSettings(dto);
  }

  @Post('machine/activity')
  @ApiOperation({ summary: 'Record authenticated user activity in the app' })
  notifyMachineUserActivity() {
    return this.machineRuntime.notifyUserActivity();
  }

  @Get('machine/frame')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({ summary: 'Get the latest frame captured by machine runtime' })
  getMachineFrame() {
    return this.machineRuntime.getLatestFrame();
  }

  @Patch('machine/controls')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Set manual/auto, live camera, and real-time AI controls',
  })
  updateMachineControls(@Body() dto: UpdateMachineRuntimeControlsDto) {
    return this.machineRuntime.updateControls(dto);
  }

  @Patch('machine/test-mode')
  @RequireAnyPermission(
    PERMISSIONS.PLC_MANAGE,
    PERMISSIONS.PLC_OPERATE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.CAMERA_MANAGE,
  )
  @ApiOperation({ summary: 'Acquire or release an isolated PLC test session' })
  updateMachineTestMode(@Body() dto: UpdateMachineTestModeDto) {
    return this.machineRuntime.updateTestMode(dto);
  }

  @Patch('machine/test-output')
  @RequireAnyPermission(
    PERMISSIONS.PLC_MANAGE,
    PERMISSIONS.PLC_OPERATE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.CAMERA_MANAGE,
  )
  @ApiOperation({ summary: 'Enable or disable PLC outputs for a test session' })
  updateMachineTestOutput(@Body() dto: UpdateMachineTestOutputDto) {
    return this.machineRuntime.updateTestOutput(dto);
  }

  @Post('machine/test-result-pulse')
  @RequireAnyPermission(
    PERMISSIONS.PLC_MANAGE,
    PERMISSIONS.PLC_OPERATE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.CAMERA_MANAGE,
  )
  @ApiOperation({
    summary: 'Pulse an OK or NG result from an active test session',
  })
  pulseMachineTestResult(@Body() dto: PulseMachineTestResultDto) {
    return this.machineRuntime.pulseTestResult(dto);
  }

  @Post('machine/start')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Power camera, enable light, verify a frame, and start operation',
  })
  startMachineOperation() {
    return this.machineRuntime.startOperation();
  }

  @Post('machine/stop')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Mark a manually stopped inspection line as inactive',
  })
  stopMachineOperation() {
    return this.machineRuntime.stopOperation();
  }

  @Post('machine/manual-latch')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Record a manual app latch without writing back to PLC',
  })
  notifyManualLatch() {
    return this.machineRuntime.notifyManualLatch();
  }

  @Post('machine/grab')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Run the manual Grab action without emitting a PLC result pulse',
  })
  grabManually() {
    return this.machineRuntime.grabManually();
  }

  @Post('machine/resume')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Resume manually after the configured PLC capture SleepTime',
  })
  resumeMachineOperation() {
    return this.machineRuntime.resumeCaptureTimeout();
  }

  @Post('machine/reconnect-plc')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  @ApiOperation({
    summary: 'Reconnect PLC and synchronize camera power and light outputs',
  })
  reconnectMachinePlc() {
    return this.machineRuntime.reconnectPlc();
  }

  private assertDev(user: AuthenticatedRequest['user']) {
    if (user.role !== 'dev') {
      throw new ForbiddenException('PLC simulator is available to dev only');
    }
  }

  private assertCanManageInactivitySettings(
    user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'admin' && user.role !== 'dev') {
      throw new ForbiddenException(
        'Only admin or dev can manage machine inactivity settings',
      );
    }
  }

  private assertCanManageMachineStopSettings(
    user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'admin' && user.role !== 'dev') {
      throw new ForbiddenException(
        'Only admin or dev can manage PLC stop delay settings',
      );
    }
  }
}
