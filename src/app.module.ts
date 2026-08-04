import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { CommonModule } from './common/common.module';

// Auth
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

// Common
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor, TransformInterceptor } from './common/interceptors';
import { RolesGuard } from './common/guards';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

// Feature Modules
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ClientsModule } from './modules/clients/clients.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HrModule } from './modules/hr/hr.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SearchModule } from './modules/search/search.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

// AI Agent Platform
import { BrandModule } from './modules/brand/brand.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { ContentModule } from './modules/content/content.module';
import { AgentSettingsModule } from './modules/agent-settings/agent-settings.module';
import { AgentsModule } from './modules/agents/agents.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';

// Infrastructure
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Core
    ConfigModule,
    DatabaseModule,
    CommonModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),

    // Job queues, backed by the Redis instance already used for caching,
    // rate limiting and login lockout.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),

    // Auth
    AuthModule,

    // Feature Modules
    UsersModule,
    OrganizationsModule,
    TeamsModule,
    ClientsModule,
    LeadsModule,
    ProjectsModule,
    TasksModule,
    TimeTrackingModule,
    QuotationsModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
    HrModule,
    DocumentsModule,
    NotificationsModule,
    AnalyticsModule,
    SearchModule,
    AiModule,
    AuditLogsModule,

    // AI Agent Platform
    BrandModule,
    ChannelsModule,
    ContentModule,
    AgentSettingsModule,
    AgentsModule,
    OrchestratorModule,

    // Infrastructure
    GatewayModule,
    HealthModule,
  ],
  providers: [
    // Global Exception Filter
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global JWT Auth Guard (all routes require auth by default)
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Global Roles Guard
    { provide: APP_GUARD, useClass: RolesGuard },

    // Rate Limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global Interceptors
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Applied to every route so that the correlation ID exists before any
    // guard, interceptor or filter runs and can reference it.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
