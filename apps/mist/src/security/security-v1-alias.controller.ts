import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Security } from '@app/shared-data';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import { DeleteSecuritySourceDto } from './dto/delete-security-source.dto';
import { InitSecurityDto } from './dto/init-security.dto';
import { SecurityService } from './security.service';

@ApiTags('securities v1')
@Controller('v1')
@UseFilters(AllExceptionsFilter)
export class SecurityV1AliasController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('securities')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize a new security' })
  @ApiResponse({
    status: 201,
    description: 'Security successfully initialized',
    type: Security,
  })
  @ApiResponse({ status: 409, description: 'Security already exists' })
  async initializeSecurity(
    @Body() initSecurityDto: InitSecurityDto,
  ): Promise<Security> {
    return await this.securityService.initializeSecurity(initSecurityDto);
  }

  @Get('securities')
  @ApiOperation({ summary: 'Get all active securities' })
  @ApiResponse({
    status: 200,
    description: 'List of all active securities',
    type: [Security],
  })
  async getAllSecurities(): Promise<Security[]> {
    return await this.securityService.findAll();
  }

  @Get('securities/:code')
  @ApiOperation({ summary: 'Get security by code' })
  @ApiParam({
    name: 'code',
    description:
      'Canonical security code; provider-formatted inputs are normalized',
    example: '600519',
  })
  @ApiResponse({ status: 200, description: 'Security found', type: Security })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async findSecurityByCode(@Param('code') code: string): Promise<Security> {
    return await this.securityService.findSecurityByCode(code);
  }

  @Post('security-sources')
  @ApiOperation({
    summary: 'Add or update data source for an existing security',
  })
  @ApiResponse({
    status: 200,
    description: 'Source successfully updated',
    type: Security,
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async addSecuritySource(
    @Body() addSecuritySourceDto: AddSecuritySourceDto,
  ): Promise<Security> {
    return await this.securityService.addSecuritySource(addSecuritySourceDto);
  }

  @Delete('security-sources')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a security source configuration' })
  @ApiResponse({ status: 200, description: 'Source configuration deleted' })
  @ApiResponse({ status: 404, description: 'Source configuration not found' })
  async deleteSecuritySource(
    @Body() dto: DeleteSecuritySourceDto,
  ): Promise<void> {
    await this.securityService.deleteSecuritySource(dto.id, dto.securityId);
  }

  @Get('securities/:code/sources')
  @ApiOperation({ summary: 'Get source configuration for a security' })
  @ApiParam({
    name: 'code',
    description:
      'Canonical security code; provider-formatted inputs are normalized',
    example: '600519',
  })
  @ApiResponse({
    status: 200,
    description: 'Source configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async getSecuritySources(@Param('code') code: string) {
    return await this.securityService.getSecuritySources(code);
  }

  @Put('securities/:code/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a security' })
  @ApiParam({
    name: 'code',
    description:
      'Canonical security code to deactivate; provider-formatted inputs are normalized',
    example: '600519',
  })
  @ApiResponse({
    status: 200,
    description: 'Security successfully deactivated',
  })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async deactivateSecurity(@Param('code') code: string): Promise<void> {
    await this.securityService.deactivateSecurity(code);
  }

  @Put('securities/:code/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a deactivated security' })
  @ApiParam({
    name: 'code',
    description:
      'Canonical security code to activate; provider-formatted inputs are normalized',
    example: '600519',
  })
  @ApiResponse({ status: 200, description: 'Security successfully activated' })
  @ApiResponse({ status: 404, description: 'Security not found' })
  async activateSecurity(@Param('code') code: string): Promise<void> {
    await this.securityService.activateSecurity(code);
  }
}
