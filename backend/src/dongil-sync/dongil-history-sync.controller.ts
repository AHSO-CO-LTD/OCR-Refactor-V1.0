import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import { DongilHistorySyncService } from './dongil-history-sync.service';

@ApiTags('dongil-history-sync')
@ApiBearerAuth()
@Controller('dongil-sync/history')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DongilHistorySyncController {
  constructor(private readonly historySync: DongilHistorySyncService) {}

  @Get('current')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW)
  current() {
    return this.historySync.getCurrent();
  }

  @Get('invalid')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW)
  invalid(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.historySync.listInvalid(Number(page), Number(limit));
  }

  @Post('start')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE)
  @ApiOperation({ summary: 'Create and start a durable Dongil history synchronization snapshot' })
  start(@CurrentUser() user: { id: string }) {
    return this.historySync.start(user.id);
  }

  @Post('pause')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE)
  pause() {
    return this.historySync.pause();
  }

  @Post('resume')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE)
  resume() {
    return this.historySync.resume();
  }

  @Post('cancel')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE)
  @ApiOperation({ summary: 'Cancel the active Dongil history synchronization run without deleting local results' })
  cancel() {
    return this.historySync.cancel();
  }

  @Post('retry-failures')
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE)
  retryFailures() {
    return this.historySync.retryFailures();
  }
}
