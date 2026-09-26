import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { StrategyDefinition, StrategyVersion } from '@app/shared-data';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { StrategyDefinitionService } from '../services/strategy-definition.service';

@ApiTags('strategies v1')
@Controller('v1/strategies')
export class StrategyController {
  constructor(
    private readonly strategyDefinitionService: StrategyDefinitionService,
  ) {}

  @Post()
  @ApiEnvelopeResponse({ status: 201, type: StrategyDefinition })
  async create(@Body() dto: CreateStrategyDefinitionDto) {
    return await this.strategyDefinitionService.create(dto);
  }

  @Get()
  @ApiEnvelopeResponse({ status: 200, type: StrategyDefinition, isArray: true })
  async findAll() {
    return await this.strategyDefinitionService.findAll();
  }

  @Get(':id')
  @ApiEnvelopeResponse({ status: 200, type: StrategyDefinition })
  async findById(@Param('id') id: string) {
    return await this.strategyDefinitionService.findById(Number(id));
  }

  @Post(':id/enable')
  @ApiEnvelopeResponse({ status: 200, type: StrategyDefinition })
  async enable(@Param('id') id: string) {
    return await this.strategyDefinitionService.enable(Number(id));
  }

  @Post(':id/disable')
  @ApiEnvelopeResponse({ status: 200, type: StrategyDefinition })
  async disable(@Param('id') id: string) {
    return await this.strategyDefinitionService.disable(Number(id));
  }

  @Get(':id/versions')
  @ApiEnvelopeResponse({ status: 200, type: StrategyVersion, isArray: true })
  async listVersions(@Param('id') id: string) {
    return await this.strategyDefinitionService.listVersions(Number(id));
  }
}
