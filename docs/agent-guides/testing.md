# Testing

Jest discovers `*.spec.ts` files under `apps/` and `libs/`. Keep unit tests alongside their feature, usually in `src/<feature>/test/`, and name cases for observable behavior. Add or update tests for behavior changes.

Use `pnpm test` for the unit suite and `pnpm test:cov` when coverage is needed; results are written to `coverage/`.

E2E configurations are under each app's `test/` directory. Start required local dependencies with `pnpm docker:compose:local:up`, which reads `.env`. Use the narrowest E2E script for the service you changed.

Before running `pnpm test:e2e:core`, verify that the effective `POSTGRES_URL` loaded with `.env.dev` points to a disposable test database. The script runs migrations, and the suite deletes users, posts, categories, comments, and notifications during setup and teardown.
