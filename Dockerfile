FROM node:24-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS prisma-cli
WORKDIR /app

# `migrate deploy` needs the schema engine, but not Studio assets, generated
# client templates or the query engine duplicated inside the CLI packages.
RUN rm -rf \
  node_modules/prisma/libquery_engine-* \
  node_modules/prisma/prisma-client \
  node_modules/prisma/build/public \
  node_modules/@prisma/engines/libquery_engine-*

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN ./node_modules/.bin/esbuild \
  scripts/payment-reconciler.ts \
  scripts/broadcast-worker.ts \
  scripts/cleanup-retention.ts \
  prisma/seed.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=cjs \
  --outdir=.next/ops \
  --entry-names='[name]' \
  --external:@prisma/client \
  --external:@sentry/nextjs \
  --external:pg

FROM node:24-alpine AS release
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache openssl wget \
  && addgroup -S nextjs \
  && adduser -S nextjs -G nextjs

COPY --chown=nextjs:nextjs --from=builder /app/public ./public
COPY --chown=nextjs:nextjs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nextjs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nextjs --from=builder /app/.next/ops ./ops
COPY --chown=nextjs:nextjs --from=builder /app/scripts/check-env.mjs ./ops/check-env.mjs
COPY --chown=nextjs:nextjs --from=builder /app/prisma ./prisma

# Prisma CLI is needed only for `migrate deploy`. Workers and seed are bundled
# above, so the image does not need source files, tsx or full node_modules.
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/prisma ./node_modules/prisma
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --chown=nextjs:nextjs --from=prisma-cli /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform

RUN mkdir -p /app/public/uploads \
  && chown -R nextjs:nextjs /app/public/uploads

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
