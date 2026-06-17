import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { DeviceToolModule } from '../device-tool/device-tool.module';
import { UsersModule } from '../users/users.module';
import { CameraController } from './camera.controller';
import { CameraStreamGateway } from './camera-stream.gateway';

@Module({
  imports: [JwtModule.register({}), UsersModule, DeviceToolModule],
  controllers: [CameraController],
  providers: [CameraStreamGateway, JwtAuthGuard, PermissionsGuard],
  exports: [CameraStreamGateway],
})
export class CameraModule {}
