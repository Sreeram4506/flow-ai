import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';

// Auth
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

// Common
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor, TransformInterceptor } from './common/interceptors';
import { RolesGuard } from './common/guards';

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

// Infrastructure
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    // Core
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),

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

    // Infrastructure
    GatewayModule,
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
export class AppModule {}
