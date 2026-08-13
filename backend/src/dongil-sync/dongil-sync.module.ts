import { Module } from '@nestjs/common';
import { DongilSyncController } from './dongil-sync.controller';
import { DongilSyncService } from './dongil-sync.service';

@Module({
  controllers: [DongilSyncController],
  providers: [DongilSyncService],
  exports: [DongilSyncService],
})
export class DongilSyncModule {}
