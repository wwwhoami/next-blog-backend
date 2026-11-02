# Post editing with draft revisions

## Goal

Allow authors and administrators to edit an already published post without
changing the live post while it is being edited, validated, reviewed, or
abandoned. The existing draft publication workflow should be extended so that a
draft can either create a new post or represent a revision of an existing
post.

## Editorial workflow

1. An authorized user selects **Edit** for a published post.
2. The API creates an active draft revision linked to the post and copies the
   current title, excerpt, Markdown content, categories, and cover reference
   into it.
3. The editor updates the draft and uploads or detaches draft-bound media.
4. Preview reads the draft revision; public reads continue to return the
   unchanged published post.
5. The user submits **Publish changes**.
6. The publication queue claims the revision and validates its fields, cover,
   Markdown references, and external image URLs.
7. A database transaction updates the post, synchronizes categories and media
   references, and archives the revision.
8. Validation failures return the revision to `ACTIVE` with a persisted
   `validationError`. The published post remains unchanged.

## Domain model

Extend `Draft` with an optional relation to the post being revised:

- `postId`: nullable foreign key to `Post`.
- A draft with `postId = null` is a new-post draft.
- A draft with `postId` set is an edit revision.
- The post should expose its active or archived revisions only where the
  editorial API requires them.

The post must remain complete and publicly readable throughout the editing
process. A revision must preserve the source post identity and capture the
source version used to initialize it, preferably through a post version number
or an `updatedAt` snapshot.

Recommended constraints:

- At most one active revision per post and author unless competing revisions
  are an explicit product requirement.
- A revision can be published only once.
- A revision cannot switch between new-post and edit-post modes.
- Archived revisions retain their `postId` for traceability.

## API changes

Add an authenticated endpoint to begin an edit:

```text
POST /post/:id/draft
```

It should authorize the caller, copy the current post into a new revision, and
return the draft. If an active revision already exists, return it or return a
documented conflict; choose one behavior consistently.

Reuse the existing draft endpoints for reading and updating the revision:

```text
GET /draft/:id
PUT /draft/:id
POST /draft/:id/publish
```

The draft response should identify whether it is a new-post draft or a
revision, and include the linked `postId` when applicable.

Add a preview endpoint only if the existing draft read response is not suitable
for the editor:

```text
GET /draft/:id/preview
```

Preview must use the draft content and media while never exposing the draft as
the public post.

## Publication behavior

The worker should branch by draft type after validation:

- **New-post draft:** create one complete `Post`, transfer draft media, and
  archive the draft.
- **Edit revision:** update the linked `Post`, synchronize categories and
  cover/body media, and archive the revision.

The revision publication transaction must:

- Verify that the target post still exists.
- Check the source version or timestamp for stale edits.
- Prevent a second publication.
- Keep the post and media references consistent if any operation fails.
- Preserve the post's existing publication state unless an explicit
  moderation or scheduling rule changes it.

If the source post changed after the revision was created, reject publication
with a conflict and keep the revision editable. Do not silently overwrite
newer content.

## Media handling

Revision uploads should use the existing draft-bound media contract. New
uploads remain attached to the revision while it is active and are moved to
the post only after successful publication.

When publishing a revision:

- Media still referenced by the revision remains attached to the post.
- Media removed from the revision is detached from the post.
- Shared media must not be deleted while another post, comment, or draft
  references it.
- Detached assets remain subject to the existing retention cleanup policy.
- The cover remains sourced from `Draft.coverMediaId` until the transaction
  updates the post.

The implementation should define whether media uploaded before revision
creation can be selected, or whether revisions may use only newly attached
media and media already attached to the target post.

## Authorization and editorial roles

- Authors may create revisions for posts they own, subject to the existing
  author policy.
- Administrators may create revisions for any post.
- Direct `PUT /post/:id` remains an administrative maintenance/import path or
  is deprecated after all editorial callers migrate.
- Draft ownership and linked-post authorization must be checked on every
  read, update, media attachment, and publish operation.

If moderation is required later, add review states separately rather than
making `PUBLISHING` represent both queue processing and editorial approval.

## Testing plan

Add focused unit and e2e coverage for:

- Creating a revision from an owned post.
- Administrator revision creation for another author's post.
- Updating and previewing a revision without changing the live post.
- Draft-bound media upload, cover selection, attachment, and detachment.
- Successful revision publication and post update.
- Validation failure with the original post unchanged.
- Stale revision conflict after the source post changes.
- Duplicate publish protection and worker retry behavior.
- Shared media retention and cleanup after media synchronization.
- New-post drafts continuing to use the existing publication behavior.

## Implementation sequence

1. Confirm authorization, active-revision policy, preview requirements, and
   stale-edit behavior.
2. Add the nullable draft-to-post relation, source-version metadata, indexes,
   and migration.
3. Add repository operations for revision creation, lookup, and transactional
   publication.
4. Add the post-to-draft endpoint and extend draft DTOs and responses.
5. Extend worker validation/publication to update an existing post.
6. Implement transactional category and media synchronization.
7. Add conflict handling, retry behavior, and persisted validation errors.
8. Add unit and e2e tests for ownership, concurrency, media, and publication.
9. Update OpenAPI metadata and editor integration documentation.
10. Deprecate or retain direct post updates based on migrated callers.

## Risks and decisions

- **Concurrent editors:** use a source version check; do not silently
  overwrite newer changes.
- **Multiple active revisions:** default to one active revision per post and
  author to simplify media ownership and editor UX.
- **Media cleanup:** synchronize references transactionally and retain detached
  assets until the existing cleanup job removes them.
- **Worker failure:** add retry and recovery handling so a revision cannot
  remain indefinitely in `PUBLISHING`.
- **Audit requirements:** retaining archived revisions provides basic
  traceability; full revision history and rollback should be a separate scope.
- **Publication state:** preserve the current post's published status unless
  scheduling, moderation, or unpublish behavior is explicitly added.
