import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // debug logging only outside production — it adds noticeable overhead per request
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug'],
  });

  // ---- Security ----
  app.use(
    helmet({
      // The API serves user-uploaded files from /uploads. crossOriginResourcePolicy
      // defaults to 'same-origin', which would block the frontend (a different
      // origin in every deployment here) from rendering any of them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // ---- Static: user uploads ----
  // Served by the app for local/single-node deployments. With the S3 driver
  // these URLs point at the bucket/CDN instead and this route goes unused.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    // Uploaded content must never be executed or sniffed into something
    // executable by the browser, and should be downloaded rather than rendered
    // inline where the type is ambiguous.
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  // ---- CORS ----
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || [
      'http://localhost:3001',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  });

  // ---- Validation ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---- Swagger / OpenAPI ----
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Flow API')
    .setDescription(
      'Flow – Enterprise SaaS Project Management Platform API\n\n' +
      '**Authentication**: Include `Authorization: Bearer <token>` header.\n' +
      '**Multi-Tenancy**: Include `x-organization-id` header for org-scoped endpoints.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-organization-id', in: 'header' }, 'organization')
    .addTag('Authentication', 'Register, login, 2FA, OAuth, sessions')
    .addTag('Users', 'User management')
    .addTag('Organizations', 'Multi-tenant organization management')
    .addTag('Teams', 'Team management')
    .addTag('Clients (CRM)', 'Client relationship management')
    .addTag('Leads', 'Lead pipeline management')
    .addTag('Projects', 'Project management')
    .addTag('Tasks', 'Task management with Kanban support')
    .addTag('Time Tracking', 'Time tracking and productivity')
    .addTag('Quotations', 'Quotation builder')
    .addTag('Invoices', 'Invoice management')
    .addTag('Payments', 'Payment tracking')
    .addTag('Expenses', 'Expense management')
    .addTag('HR', 'Human resources')
    .addTag('Documents', 'Document management')
    .addTag('Notifications', 'Notification system')
    .addTag('Analytics', 'Business analytics and dashboards')
    .addTag('Search', 'Global search')
    .addTag('AI Assistant', 'AI-powered automation')
    .addTag('Audit Logs', 'Activity audit trail')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Flow API Documentation',
  });

  // ---- Start ----
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Flow API is running on: http://localhost:${port}`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`🔌 WebSocket endpoint: ws://localhost:${port}/ws`);
}

bootstrap();
