import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SystemModule } from '../system/system.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RememberedLoginController } from './remembered-login.controller';
import { RememberedLoginService } from './remembered-login.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, SystemModule],
  controllers: [AuthController, RememberedLoginController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PermissionsGuard,
    RememberedLoginService,
  ],
  exports: [RememberedLoginService],
})
export class AuthModule {}
