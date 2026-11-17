# Post editing with draft revisions

## Problem and proposed approach

Extend the existing draft publication workflow so an author can edit any
existing post they own without changing the live post until publication. A
revision is a `Draft` linked to its source post, with a captured content
version and a `DraftMedia` relation representing the revision's desired media
set.

The planning documents live in the repository's `docs/` folder:

- `docs/post-editing-draft-revisions-plan.md`
- `docs/media-model-refactoring-plan.md`

No implementation code is included in this planning document.

Authors retain post authorship and are the only users allowed to edit post
content. Administrators may delete posts and may publish or unpublish them,
but cannot modify content. The existing direct post update route becomes an
administrator-only publication-state operation; author content changes use
revisions.

The implementation will preserve public slugs, preserve the current
`published` state when a revision is published, reject title uniqueness
conflicts, and use optimistic concurrency with a content-only `Post.version`.

## Decisions

- One active revision per post globally.
- `POST /post/:id/draft` returns an existing ACTIVE revision and returns a
  structured conflict for PUBLISHING, including its draft ID and status.
- Only the post author may create, read, update, attach media to, and publish
  a content revision. Administrators cannot take over or edit content.
- Revisions apply to all posts owned by the author, published or unpublished.
- Revision publication preserves the post's existing `published` state.
- Administrators use `PATCH /post/:id/publication` with `{ published }`;
  content fields are rejected.
- Existing `PUT /post/:id` is narrowed to the admin state-only contract.
- `Post.version` increments for content, title, categories, and media changes,
  but not for publication-state changes. A future moderation migration may add
  a separate publication counter.
- Revision publication preserves the existing slug. The unique title
  constraint remains and conflicting titles fail publication with a clear
  conflict.
- Add `DraftMedia` for revision membership while preserving existing
  `Media.postId` and `Media.commentId` columns. Existing post media remains
  post-attached while also being referenced by the revision.
- On creation, copy all current post media into `DraftMedia`. The editor sends
  a complete media set; publication requires every retained media item to be
  referenced in Markdown or selected as the cover.
- Retain `DraftMedia` rows for archived revisions. Use configurable
  two-stage retention: archive inactive ACTIVE revisions, then delete old
  ARCHIVED revisions and their historical links.
- Use bounded publication retries. After final infrastructure failure, return
  the revision to ACTIVE with an error. Validation and stale conflicts also
  return ACTIVE and persist `validationError`.
- A stale revision is archived and a fresh snapshot is created automatically
  when the author starts editing again.
- On post deletion, archive ACTIVE revisions, reject deletion while a revision
  is PUBLISHING, and retain the deleted source post ID in a non-FK audit field.
- No dedicated preview endpoint; clients preview using `GET /draft/:id`.
- Deferred full media relation refactoring is documented separately in
  `doc/media-model-refactoring-plan.md`.

## Current-state constraints to address

- `Draft.postId` is currently globally unique, which prevents archived
  revisions and future edits for the same post. Replace it with a relation
  design that permits history plus a database-enforced single-active
  invariant, likely using a raw partial unique index for ACTIVE/PUBLISHING.
- `Post` has no version field.
- Draft publication always creates a new post.
- Draft media attachment currently treats `draftId` as exclusive and clears
  all prior draft links.
- The worker currently uses one queue attempt and can leave a draft in
  PUBLISHING after infrastructure failure.
- `PUT /post/:id` currently allows administrators through the broad
  `IsAdminOrAuthorGuard`.
- Post deletion currently relies on foreign-key behavior and does not
  coordinate linked revisions.

## Implementation todos

1. **Modeling and migration**
   - Add `Post.version`.
   - Add immutable revision source-version metadata and deleted-source audit
     identifier to `Draft`.
   - Add `DraftMedia` with composite key, foreign keys, and indexes.
   - Replace the global `Draft.postId @unique` invariant with a single-active
     revision constraint while permitting archived history.
   - Add migration/backfill coverage for existing drafts and media.

2. **Revision creation and authorization**
   - Add `POST /post/:id/draft`.
   - Authorize only the post author.
   - Snapshot post fields, categories, cover, source version, and media.
   - Return existing ACTIVE revisions; conflict on PUBLISHING; archive stale
     ACTIVE revisions and create a fresh snapshot.

3. **Draft reads, updates, and media**
   - Extend draft responses with revision mode, linked post, source version,
     and effective media.
   - Keep all existing draft ownership checks.
   - Update media synchronization to maintain `DraftMedia`, draft uploads,
     cover selection, and complete media-set semantics.
   - Validate retained media against Markdown references and cover selection.

4. **Transactional revision publication**
   - Branch worker publication between new-post drafts and revisions.
   - Validate the target post and content-only version atomically.
   - Preserve slug and `published`.
   - Synchronize categories and media in one transaction.
   - Archive the revision and retain its historical `DraftMedia`.
   - Convert title uniqueness and stale-version failures into persisted,
     retryable ACTIVE errors.

5. **Administrator state and deletion**
   - Add `PATCH /post/:id/publication`.
   - Narrow or replace direct `PUT /post/:id` so content fields are rejected.
   - Coordinate deletion with linked revisions: archive ACTIVE, reject
     PUBLISHING, preserve source ID audit data, and release media safely.

6. **Worker recovery and retention**
   - Add bounded retries and recovery from PUBLISHING to ACTIVE.
   - Add scheduled configurable archival of inactive ACTIVE revisions.
   - Add scheduled configurable deletion of old ARCHIVED revisions and
     historical DraftMedia, without deleting still-referenced media.

7. **Tests and documentation**
   - Add focused repository, service, processor, controller, and e2e tests.
   - Cover author-only content editing, admin state/delete behavior,
     idempotent active revision creation, publishing conflicts, stale restart,
     media synchronization, title conflicts, retry recovery, retention, and
     unchanged public reads.
   - Update OpenAPI metadata and editor integration documentation.

## Acceptance criteria

- An author can create exactly one active revision for any owned post.
- Creating an edit while ACTIVE returns the same revision; PUBLISHING returns a
  structured conflict.
- Creating or updating a revision never changes the public post.
- Unauthorized users and administrators cannot edit post content through
  revision or direct post-update APIs.
- Administrators can publish, unpublish, and delete, but cannot change title,
  excerpt, content, categories, slug, cover, or media.
- Publishing a valid revision updates the post, categories, and effective
  media atomically, increments `Post.version`, preserves slug and published
  state, and archives the revision.
- A stale source version, title collision, invalid content, or invalid media
  leaves the post unchanged and returns the revision to ACTIVE with a useful
  `validationError`.
- Stale revision restart archives the old revision and snapshots current post
  state into a new revision.
- Removed media is detached only when no live post/comment/draft reference
  remains; shared media is not deleted prematurely.
- A failed publication is retryable and cannot remain indefinitely in
  PUBLISHING after the configured retry/recovery path.
- Inactive revision retention releases active locks and eventually removes
  archived revision data according to configurable thresholds.
- Existing new-post drafts continue to publish with their current behavior.

## Risks and mitigations

- **Partial unique index portability:** use an explicit SQL migration and
  integration coverage for the ACTIVE/PUBLISHING invariant.
- **Media state complexity:** centralize effective-media calculation and
  reconcile references only inside the publication transaction.
- **Stale drafts:** persist the conflict, archive on restart, and never force
  overwrite newer content.
- **Worker races:** claim states atomically, use bounded retries, and reject
  deletion while PUBLISHING.
- **Archived-history growth:** use configurable two-stage retention and keep
  cleanup reference-aware.
- **API compatibility:** document the narrowed PUT contract and migrate
  editorial callers to revision and publication endpoints.
- **Future moderation:** document separate publication-version migration rather
  than adding speculative moderation state now.
