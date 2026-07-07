import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { UpdateStrategyDefinitionDto } from '../dto/update-strategy-definition.dto';
import { StrategyDefinitionService } from '../services/strategy-definition.service';

@ApiTags('strategies v1')
@Controller('v1/strategies')
export class StrategyController {
  constructor(
    private readonly strategyDefinitionService: StrategyDefinitionService,
  ) {}

  @Post()
  async create(@Body() dto: CreateStrategyDefinitionDto) {
    return await this.strategyDefinitionService.create(dto);
  }

  @Get()
  async findAll() {
    return await this.strategyDefinitionService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return await this.strategyDefinitionService.findById(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStrategyDefinitionDto,
  ) {
    return await this.strategyDefinitionService.update(Number(id), dto);
  }

  @Post(':id/enable')
  async enable(@Param('id') id: string) {
    return await this.strategyDefinitionService.enable(Number(id));
  }

  @Post(':id/disable')
  async disable(@Param('id') id: string) {
    return await this.strategyDefinitionService.disable(Number(id));
  }

  @Get(':id/versions')
  async listVersions(@Param('id') id: string) {
    return await this.strategyDefinitionService.listVersions(Number(id));
  }
}
