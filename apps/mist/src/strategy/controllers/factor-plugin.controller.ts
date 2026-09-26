import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import {
  factorPluginRegistry,
  ensureStandardPluginsRegistered,
  type FactorCategory,
} from '@app/strategy';
import { FactorPluginVo } from '../vo/factor-plugin.vo';

@ApiTags('factors v1')
@Controller('v1/factors')
export class FactorPluginController {
  constructor() {
    ensureStandardPluginsRegistered();
  }

  @Get('plugins')
  @ApiEnvelopeResponse({ status: 200, type: FactorPluginVo, isArray: true })
  listPlugins(@Query('category') category?: FactorCategory): FactorPluginVo[] {
    ensureStandardPluginsRegistered();
    const plugins = factorPluginRegistry.listByCategory(category);

    return plugins.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      version: p.version,
      description: p.description,
      paramSchema: p.paramSchema,
    }));
  }
}
