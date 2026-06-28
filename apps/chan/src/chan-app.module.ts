import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { chanEnvSchema } from '@app/config';
import { ChanModule } from '../../mist/src/chan/chan.module';
import * as path from 'path';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          `.env.${process.env.NODE_ENV || 'development'}`,
        ),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ChanModule,
  ],
  controllers: [HealthController],
})
export class ChanAppModule {}
