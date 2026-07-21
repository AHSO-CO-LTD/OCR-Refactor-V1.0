import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import {
  ExecuteCustomPlcKeyDto,
  SetPlcBooleanDto,
  UpdatePlcConfigDto,
} from './dto/plc-config.dto';
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

  @Put('outputs/ok-result')
  @RequirePermissions(PERMISSIONS.PLC_OPERATE)
  setOkResult(@Body() dto: SetPlcBooleanDto) {
    return this.plcRuntime.setFixedOutput('okResult', dto.enabled);
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
  )
  @ApiOperation({ summary: 'Get PLC-driven machine runtime state' })
  getMachineStatus() {
    return this.machineRuntime.getStatus();
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
}
