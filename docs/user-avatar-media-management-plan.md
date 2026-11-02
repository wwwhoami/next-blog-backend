# User avatar media management and cleanup

## Goal

Define a reliable lifecycle for media used as user avatars. Avatar media must
not be removed by post/comment orphan cleanup while it is still the user's
active avatar, and replacing or clearing an avatar must eventually release the
previous asset and its generated variants.

The current schema stores `User.image` as a URL while `Media` stores uploaded
objects separately. This makes active avatar ownership difficult to determine
from the database. The preferred solution is to add an explicit relation
between a user and their avatar media.

## Recommended data model

Add a nullable `avatarMediaId` foreign key to `User`:

- `User.avatarMediaId` points to the current avatar `Media` record.
- `User.image` should become a derived/public URL or be removed after callers
  migrate to the media relation.
- `Media` remains the owner of storage keys, variants, target, and processing
  status.
- The relation must be one-to-one from a user to the current avatar media.
- Avatar media must have `target = USER_AVATAR` and belong to the same user.

Keep the relation nullable so users may have no avatar. Existing URL-based
avatars require a migration decision:

1. Import URLs that refer to managed storage into `Media` records and connect
   them to users.
2. Preserve external URLs as legacy values until the user uploads a managed
   avatar.
3. Keep `User.image` temporarily for backward compatibility, but never claim
   an arbitrary external URL is an owned `Media` record.

The migration must not delete existing avatar URLs or media records.

## Avatar upload flow

1. The authenticated user uploads a file with `target=USER_AVATAR`.
2. The media service validates the file using the avatar policy and creates a
   media record owned by that user.
3. Processing generates the configured avatar variants.
4. The user update operation atomically replaces `User.avatarMediaId`.
5. The previous avatar is detached and becomes an orphan candidate.
6. The response returns the selected avatar URL and variant metadata.

Prefer completing media processing before making the new avatar active. If the
product allows an immediately active original, the API must document fallback
behavior while variants are pending.

## Replacement and removal behavior

### Replace avatar

Replacing an avatar must update the user relation and detach the old media in
one database transaction. The old object must not be deleted before the new
relation is committed.

The old media is eligible for retention cleanup only when it has no other
draft, post, comment, or user-avatar references. Shared media must remain
available until all references are gone.

### Remove avatar

Removing an avatar should:

- Set `User.avatarMediaId` to `null`.
- Clear the legacy `User.image` value if it still mirrors the managed avatar.
- Leave the media record temporarily available for recovery or reuse only if
  that behavior is explicitly supported.
- Otherwise mark it as detached and let the retention cleanup job remove it.

The API should distinguish “remove current avatar” from deleting an arbitrary
media asset. A user must not be able to delete another user's active avatar.

## Cleanup eligibility

The cleanup query should treat a media record as deletable only when all of the
following are true:

- It is older than the configured retention cutoff.
- It has no `user.avatarMediaId` reference.
- It has no `draftId`, `postId`, or `commentId` reference.
- It is an avatar or another supported target whose retention policy allows
  cleanup.
- It is not currently processing, being replaced, or protected by a retry
  state.

The current cleanup behavior excludes `USER_AVATAR` because avatar ownership is
represented only by `User.image`. After adding `avatarMediaId`, avatar records
can be included safely using the explicit relation check.

Cleanup should delete generated variants and the original storage object before
deleting the database record, with retryable handling for partial storage
failures. A failed storage deletion must not silently remove the database
record.

## Repository and service boundaries

Keep Prisma access in repositories:

- `UserRepository` owns selecting, replacing, and clearing
  `avatarMediaId`.
- `MediaRepository` owns media lookup, reference checks, and deletion
  eligibility.
- `MediaService` coordinates authorization, storage operations, and repository
  calls without direct Prisma access.
- The cleanup processor asks `MediaRepository` for eligible records and
  removes storage objects before deleting records.

Avatar replacement should expose a transaction-capable repository operation so
the user relation and media detachment cannot diverge.

## API contract

The exact route may reuse the existing user update endpoint or expose explicit
avatar operations:

```text
POST /media?target=USER_AVATAR
PUT /user/avatar
DELETE /user/avatar
```

Whichever contract is selected must define:

- Ownership and authentication requirements.
- Whether a new upload replaces the current avatar immediately.
- Whether external avatar URLs remain supported.
- The response shape for original and variant URLs.
- Behavior while image processing is pending.
- Whether detached avatars can be reused or only cleaned up later.

Avoid allowing a client to set `avatarMediaId` directly without server-side
ownership, target, and processing-state validation.

## Testing plan

Add focused unit and e2e coverage for:

- Uploading and activating an avatar.
- Rejecting non-avatar media as an avatar.
- Rejecting another user's media ID.
- Replacing an avatar while preserving the previous asset until cleanup.
- Removing an avatar and clearing the user reference.
- Excluding an active avatar from cleanup.
- Including a detached old avatar in cleanup after the retention period.
- Preserving media referenced by another entity.
- Deleting original and variant objects after cleanup.
- Retry behavior when storage deletion fails.
- Legacy external `User.image` compatibility during migration.
- Authorization failures for avatar update and removal.

## Implementation sequence

1. Decide whether managed and external legacy avatar URLs must coexist.
2. Add `User.avatarMediaId`, relation constraints, indexes, and migration.
3. Add repository operations for avatar lookup, activation, replacement, and
   clearing.
4. Update upload and user APIs to activate avatars through server-side checks.
5. Update user/media responses to use the managed avatar relation.
6. Extend cleanup eligibility to include detached `USER_AVATAR` media.
7. Add retry and recovery handling for storage/database partial failures.
8. Migrate or preserve existing URL-based avatars according to the selected
   compatibility strategy.
9. Add unit and e2e tests, then update media and user API documentation.

## Risks and decisions

- **Legacy URL ownership:** external URLs cannot be safely matched to media
  records; preserve them until an explicit migration or replacement occurs.
- **Storage/database inconsistency:** use transactional relation changes and
  retryable cleanup rather than silent deletion.
- **Variant readiness:** define whether activation waits for variants or serves
  the original temporarily.
- **Shared media:** reference checks must include users, drafts, posts, and
  comments before deletion.
- **Retention window:** use a configurable delay to protect against accidental
  replacement or removal.
- **Privacy:** avatar media should use the existing owner checks and should not
  become publicly mutable through arbitrary media IDs.
