# Repository Guidelines

Next Blog Backend is a pnpm-managed NestJS monorepo for the core blog API and notification services.

- Use the pnpm version pinned in `package.json` under `packageManager`. Use pnpm to install dependencies and leave `package-lock.json` untouched.
- Build all applications with `pnpm build`, or build the core API with `pnpm build:core`; the repository has no standalone typecheck script.
- Never edit generated Prisma client files in `prisma/generated/` or commit credentials from `.env*` files.

Read the guide relevant to the task before changing code:

- [Repository structure](docs/agent-guides/structure.md)
- [TypeScript conventions](docs/agent-guides/typescript.md)
- [Testing](docs/agent-guides/testing.md)
- [Database and configuration](docs/agent-guides/database.md)
- [Git and pull requests](docs/agent-guides/git-workflow.md)
