# Repository Structure

Deployable NestJS services are in `apps/`: `core-app` is the primary API, while `notification` and `ws-notification` handle notifications.

Within an app, organize feature code as `src/<feature>/`. Keep a feature's module, controller, service, repository, DTOs, entities, and `test/` directory together. For example, post tests live at `apps/core-app/src/post/test/`.

Cross-service code belongs in `libs/`: authentication in `libs/auth`, Prisma access in `libs/prisma`, and shared entities, errors, and utilities in `libs/shared`. Fixtures are in `data/`; deployment and local-service definitions are in `docker-compose*.yml`. Put design and implementation plans in `docs/`.
