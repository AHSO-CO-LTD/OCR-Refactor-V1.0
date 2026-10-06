import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DongleCheckerService } from './dongle-checker.service';
import { DongleCheckCoordinatorService } from './dongle-check-coordinator.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SystemController],
  providers: [
    SystemService,
    DongleCheckerService,
    DongleCheckCoordinatorService,
    JwtAuthGuard,
  ],
  exports: [SystemService],
})
export class SystemModule {}
