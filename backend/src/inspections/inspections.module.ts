import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { DeviceToolModule } from '../device-tool/device-tool.module';
import { DongilSyncModule } from '../dongil-sync/dongil-sync.module';
import { UsersModule } from '../users/users.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { LineOperationReportService } from './line-operation-report.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, DeviceToolModule, DongilSyncModule],
  controllers: [InspectionsController],
  providers: [
    InspectionsService,
    LineOperationReportService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [InspectionsService],
})
export class InspectionsModule {}
