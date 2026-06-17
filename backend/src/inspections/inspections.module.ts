import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { DeviceToolModule } from '../device-tool/device-tool.module';
import { UsersModule } from '../users/users.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, DeviceToolModule],
  controllers: [InspectionsController],
  providers: [InspectionsService, JwtAuthGuard, PermissionsGuard],
})
export class InspectionsModule {}
