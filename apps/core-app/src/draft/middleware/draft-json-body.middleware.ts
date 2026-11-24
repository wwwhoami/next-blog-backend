import { json, Router } from 'express';

/**
 * Applies a 16 MiB JSON body limit to `POST /draft` and `PUT /draft/:id`.
 *
 * Mount after Helmet and CORS setup and before Nest registers its default
 * body parsers. Other routes continue through Nest's default parsers.
 *
 * @returns An Express router that parses JSON for draft saves.
 */
export function createDraftJsonBodyMiddleware(): Router {
  const router = Router();
  const draftJson = json({ limit: '16mb' });

  router.post('/draft', draftJson);
  router.put('/draft/:id', draftJson);

  return router;
}
