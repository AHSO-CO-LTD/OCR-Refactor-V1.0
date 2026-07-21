import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InspectionsService } from '../inspections/inspections.service';
import { StartupCameraDto } from './dto/startup-camera.dto';
import { PlcRuntimeService } from './plc-runtime.service';
import { MachineRuntimeService } from './machine-runtime.service';

@Controller('internal/plc-runtime')
export class PlcInternalController {
  constructor(
    private readonly configService: ConfigService,
    private readonly inspectionsService: InspectionsService,
    private readonly machineRuntime: MachineRuntimeService,
    private readonly plcRuntime: PlcRuntimeService,
  ) {}

  @Post('startup/plc')
  async checkStartupPlc(
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    const config = await this.plcRuntime.getConfig();
    if (!config.data) return { data: { status: 'skipped' as const } };
    await this.plcRuntime.ensureConnected();
    return { data: { status: 'done' as const } };
  }

  @Post('startup/camera-power')
  async enableStartupCameraPower(
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    const config = await this.plcRuntime.getConfig();
    if (!config.data || config.data.cameraPowerAddress === null) {
      return { data: { status: 'skipped' as const } };
    }
    await this.plcRuntime.setFixedOutput('cameraPower', true);
    return { data: { status: 'done' as const } };
  }

  @Post('startup/camera-light')
  async enableStartupCameraLight(
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    const config = await this.plcRuntime.getConfig();
    if (!config.data || config.data.cameraLightAddress === null) {
      return { data: { status: 'skipped' as const } };
    }
    await this.plcRuntime.setFixedOutput('cameraLight', true);
    return { data: { status: 'done' as const } };
  }

  @Post('startup/camera')
  async checkStartupCamera(
    @Body() dto: StartupCameraDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    const result = await this.inspectionsService.verifyStartupCameraFrame(
      dto.productId,
    );
    return { data: { status: 'done' as const, ...result.data } };
  }

  @Post('shutdown')
  @HttpCode(204)
  async shutdown(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);

    await this.machineRuntime.shutdownApplication();
    await this.plcRuntime.shutdownOutputsAndDisconnect();
  }

  private assertInternalToken(providedToken?: string) {
    const expectedToken = this.configService.get<string>(
      'DESKTOP_INTERNAL_TOKEN',
    );

    if (!expectedToken || providedToken !== expectedToken) {
      throw new ForbiddenException('Invalid desktop runtime token');
    }
  }
}
