# Post-creation reliability fixes

## Summary

Make successful draft publication immediately public, formalize Lexical-compatible inline-image Markdown, and make media attachment ownership/lifecycle safe for drafts, revisions, and generated variants. The test worker-handle warning is out of scope.

## Key changes

- Set `published: true` when a new draft is successfully published; revisions preserve the existing post’s publication state. Keep the admin publication endpoint for explicit unpublish/republish operations.
- Add `unified` and `remark-parse` and replace regex validation with an MDAST-based validation service:
  - Accept only normal inline image nodes: `![alt](https://...)`.
  - Reject `imageReference` nodes, reference definitions, and all raw HTML nodes.
  - Validate each inline URL against the attached original-media URLs or the configured HTTPS host allowlist.
  - Count only parsed inline image nodes toward the 100-image limit.
- Make original media the only editor attachment unit:
  - Generated variants retain only `parentId`; they must not receive `draftId`, appear in draft manifests, or require Markdown references.
  - When publishing, transfer an original and all of its variants together to the target post.
  - Revision snapshots and `DraftMedia` contain original media only.
  - Add a data migration that removes draft links and `DraftMedia` rows for existing variants, preserving their parent-original relationship.
- Make draft attachment state exclusive and transactional:
  - A media original may be attached to one active editor draft at a time; archived revision history may retain its snapshot links.
  - Attaching to a draft clears/replaces only that draft’s active attachment set and rejects media already attached to another active draft.
  - Deleting a draft media reference clears its direct draft relation and removes the current draft’s `DraftMedia` link; it must not leave variants or revision links publishable.
  - Publication derives the effective media set from originals and transfers only that set plus each original’s variants.
- Make deduplication ownership-safe:
  - Remove the global `hash,type` uniqueness constraint and replace it with a non-unique owner/hash/type/target lookup index.
  - Reuse an existing record only when owner, target, and attachment context are identical (same draft, or both unattached).
  - Do not increment `refCount` for an idempotent duplicate upload to the same attachment context; create a distinct asset for another user or draft.
  - Add a migration for the new index and update repository queries accordingly.
- Harden the publish transaction by re-checking owner and `PUBLISHING` status inside the transaction before creating/updating a post, so duplicate or stale jobs cannot alter an archived draft.

## API and client contract

- `POST /draft/:id/publish` continues to return the claimed `PUBLISHING` draft; a successful worker result creates a publicly visible post.
- Draft content supports Lexical’s custom image transformer output only:

  ```md
  ![alt text](https://media-host/path.webp)
  ```

- Reference-style Markdown images and raw HTML are rejected with a persisted validation error and the draft returns to `ACTIVE`.
- The frontend’s Lexical `ImageNode` transformer must export the inline format above and supply original media IDs in `mediaIds`; variants are never submitted as attachments.

## Test plan

- Unit and e2e coverage for:
  - A published draft appearing in public list, slug, and article endpoints.
  - Original-image-only drafts and revisions publishing successfully after variants have completed.
  - Inline allowed internal/external images succeeding; disallowed hosts, reference-style images, definitions, and HTML image markup failing deterministically.
  - Detaching, moving, and reattaching media without stale `DraftMedia` links or variant leakage.
  - Cross-user and cross-draft identical uploads creating isolated assets; same-context retries remaining idempotent.
  - Stale/duplicate publish jobs leaving an archived draft unchanged.
- Run migration validation, targeted tests, full unit tests, lint, and the core build.

## Assumptions

- The backend repository remains the scope; the Lexical transformer is an integration requirement for the frontend client.
- Generated variants are derivative delivery assets, not independently editable or referenceable content assets.
- Existing global deduplicated media may remain as historical records; only future uploads use the safe ownership-scoped reuse rule.
