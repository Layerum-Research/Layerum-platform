import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function parseTrustProxy():
  | boolean
  | number
  | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    return false;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  return raw;
}

function parseAllowedOrigins() {
  const raw = (process.env.FRONTEND_ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(raw);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy());
  const allowedOrigins = parseAllowedOrigins();

  app.use(helmet());
  app.enableCors({
    origin: (origin, callback) => {
      // Server-to-server requests usually omit Origin and should be allowed.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'), false);
    },
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerEnabled = (process.env.NODE_ENV ?? 'development') !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Layerum API')
      .setDescription('Multi-tenant AI Knowledge Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Layerum API running on http://localhost:${port}`);
  if (swaggerEnabled) {
    console.log(`Swagger docs at http://localhost:${port}/api`);
  }
}
bootstrap();
