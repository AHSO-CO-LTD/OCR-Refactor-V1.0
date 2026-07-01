import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DeviceToolService } from './device-tool.service';

@Module({
  imports: [DatabaseModule],
  providers: [DeviceToolService],
  exports: [DeviceToolService],
})
export class DeviceToolModule {}
