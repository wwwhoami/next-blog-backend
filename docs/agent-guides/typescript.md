# TypeScript Conventions

Run `pnpm lint` before handing off TypeScript changes. Use `pnpm lint:fix` for automatic ESLint fixes and `pnpm format` to apply the repository's Prettier formatting.

Follow Prettier's configured style: two-space indentation, single quotes, and trailing commas. ESLint permits intentionally unused values only when their names start with `_`.

Use kebab-case filenames, such as `media-events.service.ts`. Use PascalCase for classes and DTOs, such as `CreateDraftDto`. Retain NestJS role suffixes: `.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, and `.entity.ts`.
