# Next Blog Backend

A TypeScript and NestJS backend for writing and publishing blog posts. Authors can save drafts and upload media. Readers can comment, leave likes, and receive live notifications.

## Architecture

| Application                                    | Responsibility                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Core API](apps/core-app/src/)                 | Serves HTTP routes for accounts, drafts, posts, categories, comments, media, and notifications. BullMQ workers handle background work such as draft publishing and media processing. |
| [Notification service](apps/notification/src/) | Consumes comment and like events from Kafka, stores notifications, and handles requests to list them or mark them as read.                                                           |
| [WebSocket gateway](apps/ws-notification/src/) | Receives updates through Redis and delivers them to connected Socket.IO clients.                                                                                                     |

PostgreSQL stores blog records through Prisma. MinIO stores uploaded files through its S3-compatible API. Kafka lets the notification service process activity independently of the HTTP request, while Redis backs the job queues and live notification delivery.

## Getting started

Use Node.js 24, pnpm 10.28.0, and Docker with Compose. Run these commands from the repository root.

### 1. Install and configure

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
```

Open `.env` and choose local passwords and separate access and refresh JWT secrets. For the default local stack, set the following values after the MinIO root credentials. Keep your populated environment files out of Git.

```dotenv
KAFKA_NODE_ID=1
MINIO_ACCESS_KEY=${MINIO_ROOT_USER}
MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD}
MINIO_ENDPOINT=http://localhost:9000
MINIO_PUBLIC_URL=http://localhost:9000
```

### 2. Start dependencies and initialize storage

Docker reads `.env`, while the apps and Prisma scripts read `.env.dev`. Copy your settings, or update `.env.dev` by hand if it already exists.

```sh
cp -n .env .env.dev
pnpm docker:compose:local:up
docker compose -f docker-compose-local.yml ps
```

Once PostgreSQL and MinIO are accepting connections, generate the Prisma client, apply migrations, and create the upload bucket on first setup.

```sh
pnpm exec dotenvx run -f .env.dev -- pnpm prisma generate
pnpm db:migrate
pnpm minio:create-bucket
```

### 3. Run the apps

Run each command in a separate terminal.

```sh
pnpm start:dev:core
pnpm start:dev:notification-app
pnpm start:dev:ws-notification
```

Open **Swagger UI at [http://localhost:3000/api](http://localhost:3000/api)** to browse endpoints and try requests. To check the API and database together, list the categories:

```sh
curl --fail http://localhost:3000/category
```

Protected routes accept an access JWT. Call `POST /auth/sign-up` or `POST /auth/login`, then use the returned `accessToken` in Swagger’s **Authorize** dialog or send it as `Authorization: Bearer <accessToken>`. The API sets the refresh token in an HTTP-only cookie.

To stop local dependencies while keeping their volumes, run `docker compose -f docker-compose-local.yml --env-file .env down`. The `docker:compose:local:down` script currently omits the final `down` argument.

## Configuration

| File                         | When it is used                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [.env.example](.env.example) | Tracked template for database, Redis, Kafka, JWT, and media settings.                                                                                  |
| `.env`                       | Local Compose, the MinIO bucket script, and Nest apps started with `NODE_ENV=prod`.                                                                    |
| `.env.dev`                   | Development and debug servers, Prisma `db:*` scripts, and local end-to-end tests. Match connection settings to the ports published by local Compose.   |
| `.env.docker-compose`        | Full-stack and CI Compose runs. Use service names such as `postgres` for connections between containers. GitHub Actions creates its copy from secrets. |

`POSTGRES_URL` selects the database. `CLIENT_URL` sets the browser origin allowed by the core API. `APP_CORE_PORT` and `APP_WS_NOTIFICATION_PORT` default to 3000 and 3001. The [configuration schema](config.schema.ts) lists required values and defaults.

## Development

Run scripts with `pnpm <script>`. For example, `pnpm build:core` builds the API. The app suffixes are `core`, `notification-app`, and `ws-notification`. See [package.json](package.json) for the full commands.

| Task             | Scripts                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run or debug     | `start` starts the default app. Use `start:dev:<app>` for watch mode or `start:debug:<app>` to attach a debugger.                                                                   |
| Build            | `build` builds all three apps. Use `build:<app>` for one, `prebuild` to clear compiled output, or `core:gen-metadata` to refresh Swagger metadata.                                  |
| Check code       | `lint`, `lint:fix`, `format`.                                                                                                                                                       |
| Unit tests       | `test`, `test:watch`, `test:cov`, `test:debug`.                                                                                                                                     |
| End-to-end tests | `test:e2e` runs all suites. Use `test:e2e:<suite>` for one and append `:watch` or `:cov` as needed. Suite names are the three app suffixes plus `notification-gateway`.             |
| Database         | `db:migrate` creates and applies development migrations. `db:push` syncs the schema directly. `db:seed` loads sample data. `db:reset` erases the database and reapplies migrations. |
| CI containers    | `docker:compose:ci:up`, `docker:compose:ci:test`, `docker:compose:ci:down`.                                                                                                         |

**Use a disposable database for end-to-end tests.** Each suite migrates the database before starting Jest, and the core suite deletes records. Verify the effective `POSTGRES_URL` loaded with `.env.dev`. Nest also checks `.env.testing` during tests, but that file alone cannot redirect the migration.

### Finding your way around

- **Features and tests.** In the [post feature](apps/core-app/src/post/), follow the controller to the service for behavior and the repository for database queries. Unit tests sit alongside the feature. Each app’s top-level `test/` directory covers end-to-end behavior.
- **Shared code.** [libs/](libs/) contains authentication, the NestJS Prisma module, and shared types, errors, and messaging helpers.
- **Database and fixtures.** [prisma/](prisma/) holds the schema, migrations, and seeders. Regenerate the client after schema changes. [data/](data/) contains sample posts, media, and fixture generators.
- **Infrastructure.** The [local Compose file](docker-compose-local.yml) defines dependencies and ports. [scripts/](scripts/) contains the Kafka and MinIO setup scripts.

## Deployment

To run a compiled service, complete the Prisma generation step, run `pnpm build`, and use its production script, for example `pnpm start:prod:core`.

For containers, [docker-compose.yml](docker-compose.yml) builds the production target for each app and includes the infrastructure services. Configure `.env.docker-compose` with container-reachable addresses and a browser-reachable media URL. The stack starts with `pnpm docker:compose:up` and stops with `pnpm docker:compose:down`. Database migration and upload bucket provisioning are separate deployment steps.

For the media variant rollout, stop old producers from enqueueing jobs and let old workers finish waiting, delayed, and active variant jobs. Stop the old workers, apply the revised Prisma migrations, and start the updated workers before enabling updated producers. Retained terminal jobs can be retried by the updated upload path.

## Contributing

Use scoped Conventional Commits and include validation commands plus any schema or configuration changes in the pull request. See the [pull request guide](docs/agent-guides/git-workflow.md) and [testing guide](docs/agent-guides/testing.md). The package is marked private and `UNLICENSED`.
