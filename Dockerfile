# Multi-stage production build for the Flow NestJS backend.
# The README already documented this file's behaviour (Alpine Node 20,
# non-root `nestjs` user, multi-stage) before it existed — this is that
# description made real.

# ---------- Stage 1: dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app

# Prisma's engines need these on Alpine.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# `npm ci` is reproducible from the lockfile. Prisma's postinstall generates
# the client, which needs prisma/schema.prisma to already be present above.
RUN npm ci


# ---------- Stage 2: build ----------
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# Drop dev dependencies so we copy a lean node_modules into the runner.
RUN npm prune --omit=dev


# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl dumb-init

ENV NODE_ENV=production
ENV PORT=3000

# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist        ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma      ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3000

# Hits the liveness endpoint added in src/modules/health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# dumb-init gives us correct PID-1 signal handling so SIGTERM reaches Nest
# and onModuleDestroy hooks (Prisma/Redis disconnect) actually run.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
