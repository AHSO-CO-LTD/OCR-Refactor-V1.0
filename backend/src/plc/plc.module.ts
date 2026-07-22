import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersModule } from '../users/users.module';
import { DeviceToolModule } from '../device-tool/device-tool.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { MachineRuntimeService } from './machine-runtime.service';
import { PlcController } from './plc.controller';
import { PlcRuntimeService } from './plc-runtime.service';
import { PlcToolClient } from './plc-tool.client';
import { PlcInternalController } from './plc-internal.controller';

@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    DeviceToolModule,
    InspectionsModule,
  ],
  controllers: [PlcController, PlcInternalController],
  providers: [
    PlcToolClient,
    PlcRuntimeService,
    MachineRuntimeService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [PlcRuntimeService, MachineRuntimeService],
})
export class PlcModule {}
