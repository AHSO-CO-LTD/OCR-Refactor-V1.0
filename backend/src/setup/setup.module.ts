import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
