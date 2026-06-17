import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import { AppModule } from './app.module';
import { CameraStreamGateway } from './camera/camera-stream.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
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
  app.get(CameraStreamGateway).attach(app.getHttpServer() as Server);
}
bootstrap().catch((error) => {
  console.error('Failed to start API service', error);
  process.exit(1);
});
