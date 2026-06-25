import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CameraStreamGateway } from './camera/camera-stream.gateway';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configuredCorsOrigins = (
    process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localRendererOrigins = Array.from(
    { length: 100 },
    (_, index) => index + 3000,
  ).flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  const corsOrigins = Array.from(
    new Set([...configuredCorsOrigins, ...localRendererOrigins]),
  );
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: corsOrigins,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OCR Metal Core Washing API')
    .setDescription('Local REST API for OCR inspection desktop system.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.BACKEND_PORT ?? 4000;
  await app.listen(port);
  app.get(CameraStreamGateway).attach(app.getHttpServer());
}
bootstrap().catch((error) => {
  console.error('Failed to start API service', error);
  process.exit(1);
});
