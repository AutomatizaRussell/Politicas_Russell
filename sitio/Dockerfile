# syntax=docker/dockerfile:1
#
# Policy site of one legal entity: built with Astro, served by nginx.
# Coolify builds it with base directory /sitio and the build argument
# ENTIDAD=gct or ENTIDAD=glt, one application per entity.
# Every image is pinned to an exact version so a rebuild is reproducible.

FROM node:24.16.0-alpine AS build
WORKDIR /app
# pnpm comes from Corepack at the exact version in package.json#packageManager;
# the build is non-interactive, so Corepack must never stop to ask.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG ENTIDAD
# The build itself rejects a missing or unknown ENTIDAD and any legal source
# whose fingerprint does not match contenido/<entidad>/versiones.json.
RUN ENTIDAD="$ENTIDAD" pnpm build

FROM nginx:1.31.6-alpine
# Replaces the image's default server; the header snippet lives outside
# conf.d so nginx does not load it a second time at http level.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/cabeceras.inc /etc/nginx/cabeceras.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
