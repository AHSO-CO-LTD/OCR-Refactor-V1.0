import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateInitialAdminDto } from './dto/create-initial-admin.dto';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @ApiOperation({ summary: 'Check whether first-run setup is required' })
  @Get('status')
  getStatus() {
    return this.setupService.getStatus();
  }

  @ApiOperation({ summary: 'Create the first customer admin account' })
  @Post('initial-admin')
  createInitialAdmin(@Body() dto: CreateInitialAdminDto) {
    return this.setupService.createInitialAdmin(dto);
  }
}
