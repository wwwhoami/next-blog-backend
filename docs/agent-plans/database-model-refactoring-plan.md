# Refactor the blog data model

Make attachment rows the source of truth for managed media. An author can reuse an upload across their own posts and drafts, or across their own comments. Upload targets stay distinct. Preserve existing client contracts except where a field can no longer represent shared usage.

## Implementation

1. **Consolidate media attachments.** Add `PostMedia`, reuse `DraftMedia`, and keep ordered `CommentMedia`. Give each table a composite primary key on content ID and media ID, plus an index for reverse lookup by media ID. Link originals only and resolve variant URLs to their original for ownership and usage checks. Remove `Media.postId`, `commentId`, `draftId`, and stored `refCount`. Keep uploader ownership, variant parentage, and avatar selection as separate relations. Make `Draft.coverMediaId` a nullable FK with `ON DELETE SET NULL` and validate that the selected cover belongs to the draft’s attachments.

2. **Update upload, edit, and publication paths.** Deduplicate identical processed uploads by owner, target, type, and hash across drafts. Enforce uniqueness for live originals in PostgreSQL and use the same scope for upload reservations. A draft-bound upload creates its `DraftMedia` link even on a deduplication hit. Publishing writes the post’s links and retains the archived draft’s links. Revising or deleting one post removes only its own links. For comment Markdown, every managed image URL must resolve to an owner-held `COMMENT` original in the effective gallery. Validate the resulting body and gallery together on create and partial update. External Markdown image URLs remain frontend-rendered and create no media rows.

3. **Make usage and deletion work with shared files.** Add owner-only `GET /media/:id/references`, returning referencing post IDs, draft IDs and statuses, comment IDs, and avatar use. Remove singular attachment IDs and `refCount` from media responses. Use the same reference rules for this endpoint, delete conflicts, and automatic cleanup. Preserve explicit force-delete and the existing publishing-draft guard. Keep daily archive cleanup with `DRAFT_REVISION_RETENTION_DAYS` defaulting to 30. Expiry releases only that archive’s links. Keep storage deletion records, upload reservations, and variant write intents because they coordinate database and object-storage operations across failures.

4. **Simplify the remaining models.** Rename follow navigation to `outgoingFollows` and `incomingFollows`. Use consistent singular and plural Prisma relation names elsewhere. Retain explicit category and like joins for the existing queries and uniqueness rules. Keep stored like counts for sorting. Maintain them from like-row inserts and deletes with PostgreSQL triggers, including cascade deletes, and remove application-side counter updates. Preserve notification actor and recipient UUIDs as event history, comment ancestry and soft deletion, and draft source-version checks. Remove the duplicate unique declaration on `Category.name` and duplicate ordinary indexes on `Post.slug` and `Media.key`. Preserve SQL-only indexes for search and active-revision uniqueness.

5. **Ship against disposable databases.** Commit a forward Prisma migration and update raw SQL, repositories, DTOs, seeders, and fixtures together. Use a fresh database for verification. Existing environments can reset and reseed at cutover. No legacy backfill or mixed-version deployment is required.

## Acceptance criteria

- Concurrent uploads of the same processed image by one owner for one target return one original ID. Two drafts can attach and publish it independently. Deleting either post preserves the other post’s image. Different owners and targets remain isolated.
- Comment create and update accept external Markdown images and reject managed inline images missing from the resulting gallery. A managed variant URL matches its original gallery entry. Reordering a gallery preserves the requested display order.
- Only the media owner can list references, including archived drafts. Automatic cleanup preserves referenced originals and variants. Archive expiry releases its links. Explicit force-delete removes shared media and records storage cleanup, while a publishing draft blocks deletion.
- Follower and following endpoints return the correct users for a one-way follow. Stored like counts match like rows after concurrent requests, duplicate likes, unlikes, comment soft deletion, and account deletion. Notification history remains readable after actor deletion.
- Fresh migration and seed succeed. Run `pnpm build`, the unit suite, and core and notification E2E suites against a verified disposable database. Exercise ranked queries, category filtering, search, and revision conflicts through their normal entry points.

## Risks

- **Force-delete has wider impact with deduplication.** Two separate uploads can now identify the same file. The owner reference list must show all affected content before deletion. Force-delete can leave broken URLs in saved Markdown and post covers.
- **Cleanup can race with attachment or publication.** Lock affected originals in stable order and recheck references inside the write transaction. Verify concurrent attach, publish, delete, and cleanup against PostgreSQL.
- **Counter maintenance moves into database migrations.** Remove manual increments, decrements, and soft-delete resets in the same change as the triggers to avoid double counting. Verify cascade behavior and indexes on a freshly migrated database.
