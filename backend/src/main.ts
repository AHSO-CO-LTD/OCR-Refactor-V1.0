import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CameraStreamGateway } from './camera/camera-stream.gateway';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const frontendPort = readPortEnv('FRONTEND_PORT', 3969);
  const frontendFallbackStart = readPortEnv(
    'FRONTEND_FALLBACK_PORT_START',
    frontendPort + 1,
  );
  const frontendFallbackEnd = readPortEnv(
    'FRONTEND_FALLBACK_PORT_END',
    frontendPort + 99,
  );
  const configuredCorsOrigins = (
    process.env.FRONTEND_ORIGIN ??
    `http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localRendererOrigins = Array.from(
    { length: Math.max(frontendFallbackEnd - frontendFallbackStart + 1, 0) },
    (_, index) => index + frontendFallbackStart,
  )
    .concat(frontendPort)
    .flatMap((port) => [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ]);
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

  const port = readPortEnv('BACKEND_PORT', 3979);
  await app.listen(port);
  app.get(CameraStreamGateway).attach(app.getHttpServer());
}
bootstrap().catch((error) => {
  console.error('Failed to start API service', error);
  process.exit(1);
});

function readPortEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const port = Number.parseInt(rawValue, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}
