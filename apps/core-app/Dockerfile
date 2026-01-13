# FROM node:24-slim AS base
# ENV PNPM_HOME="/pnpm"
# ENV PATH="$PNPM_HOME:$PATH"
# RUN corepack enable
# RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# WORKDIR /usr/src/app
#
#
# ###################
# # BUILD FOR LOCAL DEVELOPMENT
# ###################
#
# FROM base AS development
# ENV NODE_ENV=dev
# ENV POSTGRES_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
#
# COPY . .
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# RUN pnpm prisma generate && pnpm build:core
#
# EXPOSE 3000
#
# CMD [ "node", "dist/apps/core-app/main.js" ]
#
#
# ###################
# # BUILD FOR PRODUCTION
# ###################
#
# FROM base AS build
# ENV NODE_ENV=prod
# ENV POSTGRES_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
#
# copy package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# copy apps/core-app/package.json ./apps/core-app/
# copy prisma/schema.prisma ./prisma/
# copy prisma.config.ts ./
#
# COPY . .
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
# RUN pnpm dlx prisma@7.2.0 generate && pnpm build:core
#
# ###################
# # PRODUCTION
# ###################
#
# FROM node:24-slim AS production
# RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# WORKDIR /usr/src/app
#
# COPY --from=build /usr/src/app/node_modules ./node_modules
# COPY --from=build /usr/src/app/prisma/generated ./prisma/generated
# COPY --from=build /usr/src/app/dist/apps/core-app ./dist/apps/core-app
#
# ENV NODE_ENV=prod
# USER node
#
# EXPOSE 3000
#
# CMD [ "node", "dist/apps/core-app/main.js" ]


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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

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
