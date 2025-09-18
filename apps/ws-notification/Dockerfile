FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app
RUN apt-get update && apt-get -y install openssl
COPY . .

###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM base AS development
ENV NODE_ENV dev
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

###################
# PROD DEPENDENCIES
###################

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
RUN cd /usr/src/app && pnpm dlx prisma@5.20.0 generate

###################
# BUILD FOR PRODUCTION
###################

FROM base AS build
ENV NODE_ENV prod
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN cd /usr/src/app && pnpm prisma generate
RUN pnpm build:ws-notification

###################
# PRODUCTION
###################

FROM node:20-slim AS production
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
RUN apt-get update && apt-get -y install openssl

ENV NODE_ENV prod

EXPOSE 3000

CMD [ "node", "dist/apps/ws-notification/main.js" ]
