import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersModule } from '../users/users.module';
import { DongilHistorySyncController } from './dongil-history-sync.controller';
import { DongilHistorySyncService } from './dongil-history-sync.service';
import { DongilSyncController } from './dongil-sync.controller';
import { DongilSyncService } from './dongil-sync.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [DongilSyncController, DongilHistorySyncController],
  providers: [
    DongilSyncService,
    DongilHistorySyncService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [DongilSyncService, DongilHistorySyncService],
})
export class DongilSyncModule {}
