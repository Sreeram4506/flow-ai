import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default('Flow'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  // 3001 is the port the Next.js app actually binds (frontend/package.json).
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),

  // JWT
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CALLBACK_URL: z.string().optional(),

  // Email
  SMTP_HOST: z.string().default('smtp.resend.com'),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default('resend'),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('noreply@flow.dev'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().default('flow-uploads'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1-mini'),
  OPENAI_VIDEO_MODEL: z.string().default('sora-2'),
  // Reasoning effort for the pipeline's text stages. Low by default because
  // the stages are mechanical and the pipeline makes 4-6 calls per post, so
  // latency compounds. Set to '' for non-reasoning models, which reject it.
  OPENAI_REASONING_EFFORT: z.enum(['', 'minimal', 'low', 'medium', 'high']).default('low'),

  // Which vendor backs the content pipeline's AI stages (research, image,
  // vision, video). Capability availability is per-key, not just per-vendor:
  // a free-tier Gemini key can do text but none of the other four.
  AI_PROVIDER: z.enum(['openai', 'gemini']).default('gemini'),
  // When both vendors have keys, fall through to the other one if the
  // preferred provider is out of credit or over its quota.
  AI_FAILOVER: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),
  // Text model used for research, parsing, prompt-building and captions.
  // Kept configurable because free-tier per-day quotas differ enormously
  // between models (gemini-3.6-flash allows 20/day; gemini-2.0-flash far more),
  // and because model ids get retired for new API keys without notice.
  TEXT_MODEL: z.string().default('gemini-2.0-flash'),

  // AI Agent Platform
  // 32+ chars, used for AES-256-GCM encryption of stored social/email OAuth
  // tokens. Required (no fallback) — a missing key must fail startup, not
  // silently encrypt every tenant's tokens with a guessable default.
  AGENT_ENCRYPTION_KEY: z.string().min(32),
  IMAGE_PROVIDER: z.enum(['gemini', 'openai', 'none']).default('gemini'),
  // Gemini-native image output. The older `imagen-3.0-*` models are retired for
  // API keys created after their cutoff, so they can't be the default any more
  // (ImageService still falls back to Imagen for older keys that have access).
  IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  VIDEO_MODEL: z.string().default('veo-3.1-fast-generate-preview'),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URL: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URL: z.string().optional(),
  PUBLIC_ASSETS_BASE_URL: z.string().optional(), // public base URL where generated images are hosted

  // 2FA
  TWO_FACTOR_APP_NAME: z.string().default('Flow'),

  // Rate Limiting
  THROTTLE_TTL: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(100),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3001,http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Invalid environment variables:', formatted);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export default () => {
  const env = validateEnv(process.env);
  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      name: env.APP_NAME,
      url: env.APP_URL,
      frontendUrl: env.FRONTEND_URL,
    },
    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    oauth: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackUrl: env.GOOGLE_CALLBACK_URL,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        callbackUrl: env.MICROSOFT_CALLBACK_URL,
      },
    },
    mail: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.MAIL_FROM,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    aws: {
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      s3Bucket: env.AWS_S3_BUCKET,
    },
    aiProvider: env.AI_PROVIDER,
    aiFailover: env.AI_FAILOVER,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      imageModel: env.OPENAI_IMAGE_MODEL,
      videoModel: env.OPENAI_VIDEO_MODEL,
      reasoningEffort: env.OPENAI_REASONING_EFFORT,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      textModel: env.TEXT_MODEL,
    },
    agents: {
      encryptionKey: env.AGENT_ENCRYPTION_KEY,
      imageProvider: env.IMAGE_PROVIDER,
      imageModel: env.IMAGE_MODEL,
      videoModel: env.VIDEO_MODEL,
      publicAssetsBaseUrl: env.PUBLIC_ASSETS_BASE_URL,
      meta: {
        appId: env.META_APP_ID,
        appSecret: env.META_APP_SECRET,
        redirectUrl: env.META_REDIRECT_URL,
      },
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        redirectUrl: env.LINKEDIN_REDIRECT_URL,
      },
    },
    twoFactor: {
      appName: env.TWO_FACTOR_APP_NAME,
    },
    throttle: {
      ttl: env.THROTTLE_TTL,
      limit: env.THROTTLE_LIMIT,
    },
    cors: {
      origins: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    },
  };
};
