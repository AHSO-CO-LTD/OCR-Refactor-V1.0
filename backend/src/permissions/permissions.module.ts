import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersModule } from '../users/users.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, JwtAuthGuard, PermissionsGuard],
})
export class PermissionsModule {}
