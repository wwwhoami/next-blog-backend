# Media model refactoring

## Purpose

Refactor media relationships after the post-revision feature so that media
attachments are represented by explicit relation tables rather than nullable
`postId`, `commentId`, and `draftId` columns on `Media`.

This is intentionally deferred from the post-revision implementation. The
revision feature should add a `DraftMedia` relation while preserving the
existing post and comment columns.

## Current model

`Media` currently has nullable foreign keys for `Post`, `Comment`, and `Draft`.
The same record can technically hold more than one relation, but repository
methods interpret those columns as attachment state. Cleanup, upload
deduplication, draft attachment, and publication logic all depend on those
implicit invariants.

## Target model

Introduce explicit join models:

- `MediaPost(mediaId, postId)`
- `MediaComment(mediaId, commentId)`
- `MediaDraft(mediaId, draftId)`

Each join must have foreign keys, a composite primary key, and appropriate
indexes. A media asset may be referenced by multiple posts, comments, and
drafts without duplicating the stored file.

## Migration strategy

1. Inventory all reads and writes of `Media.postId`, `Media.commentId`, and
   `Media.draftId`.
2. Add the join tables and backfill them from existing nullable columns.
3. Update upload, attachment, publication, cleanup, and authorization queries
   to use joins.
4. Preserve API response compatibility while the persistence model changes.
5. Verify reference-aware cleanup and shared-media retention.
6. Remove the nullable columns only after all callers and migrations no longer
   depend on them.

## Design questions

- Whether media ownership remains `Media.ownerId` or becomes derived from
  references.
- Whether a draft may reference media owned by another user.
- Whether cover selection should be a join attribute or remain on `Draft`.
- Whether a single media asset may have multiple roles on the same target.
- How variants and `refCount` interact with reference-table counts.
- Whether archived drafts retain `MediaDraft` rows for auditability.

## Risks

- Backfill errors could orphan existing attachments.
- Cleanup must not delete assets while any relation remains.
- Replacing scalar foreign keys with joins can increase query complexity.
- API and editor behavior must remain stable during the migration.
