import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { SecurityV1AliasController } from './security-v1-alias.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Security, SecuritySourceConfig])],
  controllers: [SecurityController, SecurityV1AliasController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
