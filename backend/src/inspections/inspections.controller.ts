import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { CreateTestSessionReportDto } from './dto/create-test-session-report.dto';
import { UpdateLineResultSettingsDto } from './dto/line-result-settings.dto';
import { StartInspectionDto } from './dto/start-inspection.dto';
import { StopInspectionDto } from './dto/stop-inspection.dto';
import { TestInspectionImageDto } from './dto/test-inspection-image.dto';
import { InspectionsService } from './inspections.service';
import { LineOperationReportService } from './line-operation-report.service';

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly lineOperationReportService: LineOperationReportService,
  ) {}

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

  @ApiOperation({
    summary:
      'Open an inspection session for continuous detection and PLC result latching',
  })
  @Post('begin')
  @RequirePermissions(PERMISSIONS.INSPECTION_START)
  beginInspectionSession(
    @Body() dto: StartInspectionDto,
    @CurrentUser() user: { id: string; username: string; role: string },
  ) {
    return this.inspectionsService.beginInspectionSession(dto, user);
  }

  @ApiOperation({
    summary:
      'Run a test OCR scan against an uploaded image without saving logs',
  })
  @Post('test-image')
  @RequireAnyPermission(
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.CAMERA_MANAGE,
  )
  testImage(@Body() dto: TestInspectionImageDto) {
    return this.inspectionsService.testImage(dto);
  }

  @ApiOperation({
    summary:
      'Save a batch test session report with failed images and ROI details',
  })
  @Post('test-sessions')
  @RequireAnyPermission(
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.CAMERA_MANAGE,
  )
  createTestSessionReport(
    @Body() dto: CreateTestSessionReportDto,
    @CurrentUser() user: { id: string; username: string; role: string },
  ) {
    return this.inspectionsService.createTestSessionReport(dto, user);
  }

  @ApiOperation({ summary: 'List recent batch test session reports' })
  @Get('test-sessions')
  @RequireAnyPermission(
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.CAMERA_MANAGE,
  )
  listTestSessionReports(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.inspectionsService.listTestSessionReports(
      Number(limit) || 10,
      Number(page) || 1,
    );
  }

  @ApiOperation({ summary: 'Summarize latched Line results by date range' })
  @Get('line-reports/summary')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  getLineReportSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.lineOperationReportService.getSummary(from, to, groupBy);
  }

  @ApiOperation({ summary: 'Export latched Line results as XLSX' })
  @Get('line-reports/export')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  async exportLineReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    const buffer = await this.lineOperationReportService.exportWorkbook(
      from,
      to,
      groupBy,
    );
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="line-report-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx"`,
    });
  }

  @ApiOperation({ summary: 'Get line result save settings' })
  @Get('line-result-settings')
  @RequireAnyPermission(
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.SYSTEM_DEBUG,
  )
  getLineResultSettings() {
    return this.inspectionsService.getLineResultSettings();
  }

  @ApiOperation({ summary: 'Update line result save settings' })
  @Patch('line-result-settings')
  @RequireAnyPermission(
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.SYSTEM_DEBUG,
  )
  updateLineResultSettings(@Body() dto: UpdateLineResultSettingsDto) {
    return this.inspectionsService.updateLineResultSettings(dto);
  }

  @ApiOperation({ summary: 'Get the current running inspection job' })
  @Get('current')
  @RequireAnyPermission(
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.INSPECTION_STOP,
  )
  getCurrentInspection() {
    return this.inspectionsService.getCurrentInspection();
  }

  @ApiOperation({ summary: 'Stop an inspection job' })
  @Post(':jobId/stop')
  @RequirePermissions(PERMISSIONS.INSPECTION_STOP)
  stopInspection(
    @Param('jobId') jobId: string,
    @Body() dto?: StopInspectionDto,
  ) {
    return this.inspectionsService.stopInspection(jobId, dto?.endReason);
  }
}
