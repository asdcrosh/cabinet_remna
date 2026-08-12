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
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED_AT=unknown
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_BUILD_REVISION=${BUILD_REVISION}
ENV APP_BUILD_CREATED_AT=${BUILD_CREATED_AT}

RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN ./node_modules/.bin/esbuild \
  scripts/payment-reconciler.ts \
  scripts/broadcast-worker.ts \
  scripts/watch-worker.ts \
  scripts/node-provisioning-worker.ts \
  scripts/cleanup-retention.ts \
  scripts/bootstrap-superuser.ts \
  prisma/seed.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=cjs \
  --outdir=.next/ops \
  --entry-names='[name]' \
  --external:@prisma/client \
  --external:pg

FROM node:24-alpine AS provisioner
WORKDIR /app
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED_AT=unknown
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_BUILD_REVISION=${BUILD_REVISION}
ENV APP_BUILD_CREATED_AT=${BUILD_CREATED_AT}
ENV ANSIBLE_CONFIG=/app/deploy/provisioner/ansible/ansible.cfg
ENV GEOIP_DATADIR=/app/geoip-data
ENV PATH=/opt/ansible/bin:${PATH}
ENV HOME=/home/provisioner

LABEL org.opencontainers.image.revision=${BUILD_REVISION}
LABEL org.opencontainers.image.created=${BUILD_CREATED_AT}

RUN apk add --no-cache \
      ca-certificates \
      openssh-client \
      openssl \
      python3 \
      py3-pip \
      py3-virtualenv \
      sshpass \
      tini \
  && python3 -m venv /opt/ansible \
  && /opt/ansible/bin/pip install --no-cache-dir \
      ansible-core==2.19.10 \
      ansible-runner==2.4.3 \
      pexpect==4.9.0 \
  && addgroup -S -g 10001 provisioner \
  && adduser -S -D -h /home/provisioner -u 10001 provisioner -G provisioner

COPY --chown=provisioner:provisioner --from=builder /app/.next/standalone ./
COPY --chown=provisioner:provisioner --from=builder /app/.next/ops ./ops
COPY --chown=provisioner:provisioner deploy/provisioner ./deploy/provisioner
COPY --chown=provisioner:provisioner --from=deps /app/node_modules/geoip-country/data ./geoip-data
COPY --chown=provisioner:provisioner --from=deps /app/node_modules/geoip-country/LICENSE ./licenses/geoip-country/LICENSE
COPY --chown=provisioner:provisioner --from=deps /app/node_modules/geoip-country/EULA ./licenses/geoip-country/EULA

RUN mkdir -p /tmp/ansible-runner \
  && chown provisioner:provisioner /tmp/ansible-runner \
  && OPS_STARTUP_CHECK=true node ops/node-provisioning-worker.js

USER provisioner
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "ops/node-provisioning-worker.js"]

FROM node:24-alpine AS release
WORKDIR /app
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED_AT=unknown
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP_BUILD_REVISION=${BUILD_REVISION}
ENV APP_BUILD_CREATED_AT=${BUILD_CREATED_AT}

LABEL org.opencontainers.image.revision=${BUILD_REVISION}
LABEL org.opencontainers.image.created=${BUILD_CREATED_AT}

RUN apk add --no-cache openssl wget \
  && addgroup -S nextjs \
  && adduser -S nextjs -G nextjs

COPY --chown=nextjs:nextjs --from=builder /app/public ./public
COPY --chown=nextjs:nextjs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nextjs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nextjs --from=builder /app/.next/ops ./ops
COPY --chown=nextjs:nextjs --from=builder /app/scripts/check-env.mjs ./ops/check-env.mjs
COPY --chown=nextjs:nextjs --from=builder /app/prisma ./prisma

# Fail the image build if a bundled worker references a dependency that is not
# present in the final release image.
RUN OPS_STARTUP_CHECK=true node ops/payment-reconciler.js \
  && OPS_STARTUP_CHECK=true node ops/broadcast-worker.js \
  && OPS_STARTUP_CHECK=true node ops/watch-worker.js \
  && OPS_STARTUP_CHECK=true node ops/bootstrap-superuser.js

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
