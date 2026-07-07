import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RunStrategyScanDto } from '../dto/run-strategy-scan.dto';
import { StrategyScanService } from '../scanner/strategy-scan.service';

@ApiTags('strategy scans v1')
@Controller('v1/strategy-scans')
export class StrategyScanController {
  constructor(private readonly strategyScanService: StrategyScanService) {}

  @Post('run')
  async runScan(@Body() dto: RunStrategyScanDto) {
    return await this.strategyScanService.runScan(dto);
  }
}
