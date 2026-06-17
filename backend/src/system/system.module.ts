import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SystemController],
  providers: [SystemService, JwtAuthGuard],
})
export class SystemModule {}
