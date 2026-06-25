import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireAnyPermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraProfileDto } from '../products/dto/product-profile.dto';
import { GrabCameraFrameDto } from './dto/grab-camera-frame.dto';
import { StartCameraAiDto } from './dto/start-camera-ai.dto';

@ApiTags('camera')
@ApiBearerAuth()
@Controller('camera')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CameraController {
  constructor(
    private readonly deviceToolService: DeviceToolService,
    private readonly prisma: PrismaService,
  ) {}

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

  @ApiOperation({
    summary: 'Get hardware camera setting ranges from the Device Tool',
  })
  @Get('ranges')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  getRanges() {
    return this.deviceToolService.getCameraRanges();
  }

  @ApiOperation({
    summary: 'Get camera hardware diagnostics from the Device Tool',
  })
  @Get('debug-info')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  getDebugInfo() {
    return this.deviceToolService.getCameraDebugInfo();
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

  @ApiOperation({ summary: 'Load product model and start camera OCR AI' })
  @Post('ai/start')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  async startAi(@Body() dto: StartCameraAiDto) {
    const product = await this.getActiveProductForAi(dto.productId);

    return this.deviceToolService.startCameraOcr({
      modelPath: product.modelPath,
      camera: product.camera,
      roiRegions: product.roiRegions,
      thresholdAccept: product.thresholdAccept,
      thresholdMns: product.thresholdMns,
    });
  }

  @ApiOperation({ summary: 'Stop camera OCR AI' })
  @Post('ai/stop')
  @RequireAnyPermission(PERMISSIONS.CAMERA_MANAGE, PERMISSIONS.INSPECTION_START)
  stopAi() {
    return this.deviceToolService.stopCameraOcr();
  }

  private async getActiveProductForAi(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        cameraConfig: true,
        roiRegions: { orderBy: { index: 'asc' } },
      },
    });

    if (!product || !product.active) {
      throw new NotFoundException('Active product not found');
    }

    if (!product.modelPath) {
      throw new BadRequestException('Product model path is required');
    }

    if (!product.cameraConfig) {
      throw new BadRequestException('Product camera config is required');
    }

    if (product.roiRegions.length === 0) {
      throw new BadRequestException('Product ROI regions are required');
    }

    return {
      modelPath: product.modelPath,
      thresholdAccept: Number(product.thresholdAccept),
      thresholdMns: Number(product.thresholdMns),
      camera: {
        sourceType: product.cameraConfig.sourceType,
        deviceName: product.cameraConfig.deviceName ?? undefined,
        rtspUrl: product.cameraConfig.rtspUrl ?? undefined,
        exposure: product.cameraConfig.exposure,
        imageWidth: product.cameraConfig.imageWidth,
        imageHeight: product.cameraConfig.imageHeight,
        offsetX: product.cameraConfig.offsetX,
        offsetY: product.cameraConfig.offsetY,
        zoomFactor: Number(product.cameraConfig.zoomFactor),
        previewPanX: Number(product.cameraConfig.previewPanX),
        previewPanY: Number(product.cameraConfig.previewPanY),
        previewRotation: Number(product.cameraConfig.previewRotation),
      },
      roiRegions: product.roiRegions.map((region) => ({
        index: region.index,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        rotation: Number(region.rotation),
      })),
    };
  }
}
