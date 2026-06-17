import { Module } from '@nestjs/common';
import { DeviceToolService } from './device-tool.service';

@Module({
  providers: [DeviceToolService],
  exports: [DeviceToolService],
})
export class DeviceToolModule {}
