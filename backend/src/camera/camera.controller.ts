import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireAnyPermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraProfileDto } from '../products/dto/product-profile.dto';
import { GrabCameraFrameDto } from './dto/grab-camera-frame.dto';
import { UpdateCameraFrameRateDto } from './dto/update-camera-frame-rate.dto';

@ApiTags('camera')
@ApiBearerAuth()
@Controller('camera')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CameraController {
  constructor(private readonly deviceToolService: DeviceToolService) {}

  @ApiOperation({ summary: 'Get camera runtime status from the Device Tool' })
  @Get('status')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  getStatus() {
    return this.deviceToolService.getCameraStatus();
  }

  @ApiOperation({ summary: 'List camera devices from the Device Tool' })
  @Get('devices')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  listDevices() {
    return this.deviceToolService.listCameraDevices();
  }

  @ApiOperation({
    summary: 'Get actual camera frame rate from the Device Tool',
  })
  @Get('frame-rate')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  getFrameRate() {
    return this.deviceToolService.getCameraFrameRate();
  }

  @ApiOperation({ summary: 'Update camera acquisition frame rate' })
  @Patch('frame-rate')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE)
  updateFrameRate(@Body() dto: UpdateCameraFrameRateDto) {
    return this.deviceToolService.updateCameraFrameRate(dto.fps);
  }

  @ApiOperation({ summary: 'Connect camera using a product camera profile' })
  @Post('connect')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  async connect(@Body() dto: CameraProfileDto) {
    await this.deviceToolService.ensureCameraPreviewReady(dto);
    return this.deviceToolService.getCameraStatus();
  }

  @ApiOperation({ summary: 'Grab one camera frame from the Device Tool' })
  @Post('grab')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  grab(@Body() dto: GrabCameraFrameDto) {
    return this.deviceToolService.grabCameraFrame(dto);
  }
}
