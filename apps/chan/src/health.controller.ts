import { Controller, Get } from '@nestjs/common';

@Controller('app')
export class HealthController {
  @Get('hello')
  getHello(): string {
    return 'Hello World!';
  }
}
