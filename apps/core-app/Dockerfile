FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app
# openssl is required for Prisma to work properly
RUN apt-get update -y && apt-get -y install openssl && rm -rf /var/lib/apt/lists/*
COPY . .

###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM base AS development
ENV NODE_ENV=dev
# Postgres URL is required to generate the Prisma client
ENV POSTGRES_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm prisma generate

###################
# PROD DEPENDENCIES
###################

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

###################
# BUILD FOR PRODUCTION
###################

FROM base AS build
ENV NODE_ENV=prod
# Postgres URL is required to generate the Prisma client
ENV POSTGRES_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm prisma generate && pnpm build:core

###################
# PRODUCTION
###################

FROM node:24-slim AS production
ENV NODE_ENV=prod
WORKDIR /usr/src/app

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/prisma/generated ./prisma/generated
COPY --from=build /usr/src/app/dist ./dist

RUN apt-get update -y && apt-get -y install openssl && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

CMD [ "node", "dist/apps/core-app/main.js" ]
