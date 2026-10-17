import { Module } from '@nestjs/common';
import { TimezoneService } from './timezone.service';

@Module({
  providers: [TimezoneService],
  exports: [TimezoneService],
})
export class TimezoneModule {}
