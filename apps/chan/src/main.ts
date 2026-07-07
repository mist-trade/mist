import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ChanAppModule } from './chan-app.module';
import { TransformInterceptor } from '../../mist/src/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../../mist/src/filters/all-exceptions.filter';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(ChanAppModule);

  // 缠论算法请求体可能较大（merge-k / bi 输入 K 线数组）
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // 全局管道：与 mist app 一致的参数校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const fieldErrors = errors.reduce(
          (acc, err) => {
            acc[err.property] = Object.values(err.constraints || {});
            return acc;
          },
          {} as Record<string, string[]>,
        );

        return new BadRequestException({
          message: 'VALIDATION_ERROR',
          errors: fieldErrors,
        });
      },
    }),
  );

  // 全局响应拦截器：统一 { success, data, ... } 响应格式（与 mist app 一致）
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 8008);
  console.log(`Chan application is running on: ${await app.getUrl()}`);
}
bootstrap();
