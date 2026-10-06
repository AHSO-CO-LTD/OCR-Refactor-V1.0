import { Global, Module } from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';

@Global()
@Module({
  providers: [AuthSessionService],
  exports: [AuthSessionService],
})
export class AuthSessionModule {}
