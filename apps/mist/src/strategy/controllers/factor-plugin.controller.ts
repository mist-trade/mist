import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiOkResponse({ type: [FactorPluginVo] })
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
