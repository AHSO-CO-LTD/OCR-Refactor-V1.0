import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WindowsKeyboardService } from './windows-keyboard.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UsersController],
  providers: [
    UsersService,
    WindowsKeyboardService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
