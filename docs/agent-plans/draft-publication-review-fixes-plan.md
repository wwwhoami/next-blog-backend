# Fix draft publication, feed visibility, and validation

Cover all 12 review findings. A publish request that never reaches the queue returns the draft to editing with a retryable error. Only a new author action may start another publication attempt.

## Implementation

1. **Make publication recovery specific to each attempt.** Add a nullable publication-attempt UUID to `Draft` through a Prisma migration. In one transaction, claim the active draft, assign the UUID, and read the `PUBLISHING` response snapshot. Use the UUID as the BullMQ job ID. After enqueue succeeds, return that snapshot. Require the same UUID in worker reads, final publication transactions, and failure updates. Clear it when the attempt ends so delayed jobs and callbacks cannot affect a later retry.

2. **Recover missing and terminal jobs within one minute.** Run a reconciliation pass at startup and every 15 seconds, independently of the publication queue. Give new claims 30 seconds to reach Redis. Restore a matching draft to `ACTIVE` with an actionable error when BullMQ confirms the job is missing after that grace period or terminally failed. Keep waiting, active, delayed, and retrying jobs intact. Use terminal job state in the failure handler as well. Treat Redis lookup errors and ambiguous enqueue acknowledgments as unknown outcomes until reconciliation can verify them.

3. **Fix public article discovery and URLs.** Use left joins in the feed and exclude null category rows from the aggregate so uncategorized posts return `categories: []`. Preserve category filtering, ranking, and pagination. Share slug generation between draft publication and `POST /post`. Keep routable title-derived slugs and generate a UUID-based fallback for empty slugs and the path segments `.` and `..`. Preserve existing slugs on revision publication. Map unique violations to the actual constraint so a slug or category conflict gets an accurate error.

4. **Align draft writes with the editor contract.** Reject duplicate category names on create and update using exact-name equality. Validate them again before publication so an already-stored duplicate produces an actionable error. Reject explicit `null` for non-null fields, preserve omission on partial updates, and accept `coverMediaId: null` to clear the cover. Apply a 16 MiB JSON limit specifically to `POST /draft` and `PUT /draft/:id`. Use the DTO’s 2,000,000-character counting rule during publication too, so emoji-heavy content accepted on save passes the same length check in the worker.

5. **Correct revision lifecycle and setup.** Derive revision mode from `sourceVersion != null`, including version zero. Refresh the parent draft’s `updatedAt` in the attachment transaction for both new and reused uploads. Reject negative retention settings at startup and keep zero as immediate eligibility. Update README and AGENTS setup instructions to use the `packageManager` pin, currently pnpm 12.21.0.

## Acceptance criteria

- With real Postgres and Redis, interrupt publication after the claim but before enqueue. The draft becomes editable with an error within 60 seconds while dependencies are healthy, and no post appears. Exceeding BullMQ’s stall limit before the third attempt produces the same recovery. A queued retry stays claimed.
- A fast worker can finish before the HTTP response and the endpoint still returns the claimed `PUBLISHING` snapshot. A late job or failure callback from an earlier attempt cannot publish, unlock, or overwrite the current attempt. Concurrent requests produce at most one publication.
- An uncategorized article appears once in the unfiltered feed with `categories: []` and is excluded by a category filter. Two distinct titles that produce empty slugs create independently reachable articles. Exercise both creation routes and verify a revision preserves its URL.
- HTTP tests cover omitted fields, explicit nulls, clearing the cover, duplicate categories, a 150 KB save, and the 2M-character boundary with multibyte text. Content over the character limit gets a validation error. A draft body over 16 MiB gets HTTP 413. Other routes retain their existing parser limits.
- Cleanup tests cover fresh and reused attachments on an old revision, zero-day eligibility, and startup rejection of either negative setting. Mode tests cover a published new draft and a version-zero revision whose source post was deleted.
- Run `pnpm build:core`, the full unit suite, and core E2E against a verified disposable database. The review baseline is 342 passing unit tests. Core E2E remains unverified.

## Risks and rollout

- The fresh-rollout assumption removes the need to migrate existing draft jobs. Apply the schema migration before starting the updated API and workers. Existing posts with empty slugs remain outside the agreed repair scope.
- Redis unavailability can extend the editing lock because absence cannot be confirmed. Log reconciliation failures and the age of the oldest pending claim. Exercise a backlog large enough to verify the one-minute target across multiple scan batches.
- The 16 MiB cap increases peak memory per concurrent draft save. Verify that the deployment proxy accepts the same limit. Heavily escaped JSON can reach the byte cap before reaching 2M characters.
