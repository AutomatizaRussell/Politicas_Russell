# syntax=docker/dockerfile:1
#
# Consent service. Coolify builds it with base directory /servicio. Node runs the
# TypeScript sources directly by stripping types, so there is no compile stage;
# development dependencies stay out of the image.

FROM node:24.16.0-alpine
WORKDIR /app
# pnpm comes from Corepack at the exact version in package.json#packageManager;
# the build is non-interactive, so Corepack must never stop to ask.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
COPY migraciones ./migraciones
COPY recursos ./recursos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PUERTO||3000)+'/salud').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/servidor.ts"]
