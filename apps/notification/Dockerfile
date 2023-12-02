###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:20-alpine AS development
RUN apk add --no-cache libc6-compat

WORKDIR /usr/src/app
ENV NODE_ENV dev

COPY --chown=node:node . .
RUN yarn set version berry

RUN yarn install --immutable
RUN chown -R node:node node_modules/prisma && chown -R node:node node_modules/.prisma

USER node

###################
# BUILD FOR PRODUCTION
###################

FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat

WORKDIR /usr/src/app
ENV NODE_ENV prod

COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

RUN yarn build:notification-app
RUN yarn install --immutable && yarn cache clean

RUN chown -R node:node node_modules/prisma && chown -R node:node node_modules/.prisma
USER node

###################
# PRODUCTION
###################

FROM node:20-alpine AS production
RUN apk add --no-cache libc6-compat

COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

RUN chown -R node:node node_modules/prisma && chown -R node:node node_modules/.prisma

USER node

EXPOSE 3000

CMD [ "node", "dist/apps/notification/main.js" ]
