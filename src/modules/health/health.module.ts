// ================ HEALTH MODULE ================
//
// Load balancers, ECS/Cloud Run and Kubernetes all need an unauthenticated
// endpoint to decide whether an instance should receive traffic or be
// restarted. There wasn't one, so any orchestrator would have had to guess
// from TCP connect alone (which stays "up" even when Mongo is unreachable).
//
// Two endpoints, deliberately different:
//   GET /health        liveness  — is the process itself alive? Never touches
//                                  dependencies, so a Mongo blip doesn't cause
//                                  an infinite restart loop.
//   GET /health/ready  readiness — can it actually serve requests? Pings Mongo
//                                  and Redis; 503 pulls the instance out of the
//                                  LB pool without killing it.
import {
  Module,
  Injectable,
  Controller,
  Get,
  Logger,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { Public } from '../../common/decorators';

type DependencyStatus = 'up' | 'down';

interface ReadinessReport {
  status: 'ok' | 'error';
  uptimeSeconds: number;
  version: string;
  checks: Record<string, { status: DependencyStatus; error?: string }>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessReport> {
    const [mongo, redis] = await Promise.all([
      this.checkMongo(),
      this.checkRedis(),
    ]);

    const checks = { mongo, redis };
    const allUp = Object.values(checks).every((c) => c.status === 'up');

    return {
      status: allUp ? 'ok' : 'error',
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '1.0.0',
      checks,
    };
  }

  private async checkMongo(): Promise<{ status: DependencyStatus; error?: string }> {
    try {
      // Cheapest possible round-trip that still proves the connection works.
      await this.prisma.$runCommandRaw({ ping: 1 });
      return { status: 'up' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Readiness: MongoDB check failed — ${message}`);
      return { status: 'down', error: message };
    }
  }

  private async checkRedis(): Promise<{ status: DependencyStatus; error?: string }> {
    try {
      const client = this.redis.getClient();
      if (!client) return { status: 'down', error: 'client not initialised' };
      await client.ping();
      return { status: 'up' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Readiness: Redis check failed — ${message}`);
      return { status: 'down', error: message };
    }
  }
}

@ApiTags('Health')
@Controller('health')
// Probes run every few seconds per instance; they must never consume the
// caller's rate-limit budget or start returning 429 under normal operation.
@SkipThrottle()
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — process is running' })
  liveness() {
    return this.service.liveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — dependencies reachable' })
  @ApiResponse({ status: 200, description: 'All dependencies healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies unavailable' })
  async readiness(@Res({ passthrough: true }) res: Response) {
    const report = await this.service.readiness();

    // Orchestrators key off the status code, not the body — a readiness probe
    // that always returns 200 is useless. `passthrough: true` lets us set the
    // code while still returning the body normally through the interceptors,
    // so the caller gets the per-dependency detail alongside the 503.
    if (report.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
