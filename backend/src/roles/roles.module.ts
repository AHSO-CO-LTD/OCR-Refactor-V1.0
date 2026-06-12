import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersModule } from '../users/users.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [RolesController],
  providers: [RolesService, JwtAuthGuard, PermissionsGuard],
})
export class RolesModule {}
