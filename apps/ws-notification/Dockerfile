###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:20-alpine AS development
WORKDIR /usr/src/app
COPY --chown=node:node package.json ./
RUN yarn set version berry
COPY --chown=node:node yarn.lock .yarn .yarnrc.yml ./
RUN yarn install
COPY --chown=node:node . .
USER node

###################
# BUILD FOR PRODUCTION
###################

FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock .yarn .yarnrc.yml ./
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .
RUN yarn build:ws-notification
ENV NODE_ENV prod
RUN yarn install --immutable && yarn cache clean
USER node

###################
# PRODUCTION
###################

FROM node:20-alpine AS production

COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

EXPOSE 3001

CMD [ "node", "dist/apps/ws-notification/main.js" ]
