import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { StartInspectionDto } from './dto/start-inspection.dto';
import { InspectionsService } from './inspections.service';

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @ApiOperation({
    summary: 'Start an inspection job and run the first OCR scan',
  })
  @Post('start')
  @RequirePermissions(PERMISSIONS.INSPECTION_START)
  startInspection(
    @Body() dto: StartInspectionDto,
    @CurrentUser() user: { id: string; username: string; role: string },
  ) {
    return this.inspectionsService.startInspection(dto, user);
  }

  @ApiOperation({ summary: 'Get the current running inspection job' })
  @Get('current')
  @RequireAnyPermission(
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.INSPECTION_STOP,
    PERMISSIONS.INSPECTION_OVERRIDE,
  )
  getCurrentInspection() {
    return this.inspectionsService.getCurrentInspection();
  }

  @ApiOperation({ summary: 'Stop an inspection job' })
  @Post(':jobId/stop')
  @RequirePermissions(PERMISSIONS.INSPECTION_STOP)
  stopInspection(@Param('jobId') jobId: string) {
    return this.inspectionsService.stopInspection(jobId);
  }
}
