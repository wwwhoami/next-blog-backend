# Post creation workflow implementation plan

The overview copy is also stored separately in `post-creation-overview-plan.md` in this session folder for later review.

## Problem and current state

The API already supports authenticated image uploads, S3-compatible storage, image validation/resizing, asynchronous variants, media retrieval, and reference-count-based removal. Post creation/update currently accepts `coverImage` as a URL and stores `content` as opaque text. The `Media` schema has optional `postId`/`commentId` fields, but uploads do not bind media to a post or draft, and Markdown image URLs are not reconciled with media records.

The frontend workflow is:

1. The editor keeps a client-local draft in `localStorage`.
2. The user explicitly saves a draft to the backend.
3. The backend persists a separate server-side draft.
4. The frontend uploads cover/content images through the media API after the draft exists.
5. Markdown content references uploaded media URLs.
6. The user publishes the draft later; external images may be used only from configured HTTPS domains.
7. Removing an image detaches it; it is not immediately deleted.

## Decisions captured

- Use a separate `Draft` model rather than incomplete `Post` rows.
- Create a server draft on first explicit save, not when the editor opens.
- Keep client-local autosave; server autosave is not required.
- Treat uploaded media as durable user assets, with future retention cleanup for unattached assets.
- Allow external image URLs only from a backend-configured HTTPS host allowlist; preserve those URLs.
- Internal media references must resolve at publish time.
- Removing an image detaches it and relies on retention cleanup rather than immediate deletion.
- Repeated publish requests are rejected after publication.
- The media-reference contract remains an explicit design alternative to compare: draft-bound uploads plus manifest, custom `media:<id>` Markdown tokens, or URL parsing on save/publish.
- Draft-to-post lifecycle remains undecided and must be compared: convert in place, create-and-delete/archive, or retain a linked draft.

## Proposed architecture

### Draft domain

- Add a `Draft` persistence model owned by a user, containing editor fields, Markdown content, optional cover-media reference, categories, timestamps, and an explicit lifecycle/status.
- Add authenticated draft endpoints for create, read, update/save, list, and publish.
- Enforce owner/admin authorization consistently with existing post/media guards.
- Validate required post fields and media references when publishing, rather than allowing incomplete `Post` records.
- Make publish behavior idempotency-safe at the service boundary even though repeat requests are rejected after publication.

### Media ownership and attachment

- Extend upload metadata or add an attachment operation so an upload can be bound to an existing draft.
- Validate that the draft and media belong to the authenticated user and that the media target is valid for post content.
- Track cover media and body media separately or through a normalized attachment relation; avoid treating a public URL as the ownership source of truth.
- Preserve existing media processing and variant APIs, but ensure generated variants inherit the attachment context.
- Add a user-scoped media listing endpoint with filters for attached/unattached, target, and lifecycle state.
- Add retention metadata/cleanup processing for unattached media while preserving explicit user deletion and durable attached assets.
- Define detach semantics and reference-count updates transactionally.
- Add a repository documentation page describing the editor workflow, draft lifecycle, media-reference contract, publish validation, and cleanup behavior.

### Markdown/reference contract alternatives

1. **Draft-bound upload plus explicit manifest (recommended baseline):**
   - Create the draft first.
   - Upload/attach media with `draftId`.
   - Save Markdown plus a list of media IDs/roles.
   - Validate ownership and that internal URLs correspond to the manifest.
   - Pros: conventional Markdown, no full-document parser on every read, deterministic cleanup.
   - Cons: frontend must keep the manifest synchronized.

2. **Custom `media:<id>` Markdown tokens:**
   - Store stable media IDs in content and resolve them while rendering/serving.
   - Pros: one canonical reference in content; no URL matching.
   - Cons: custom renderer/parser coupling, migration/export complexity, and less portable Markdown.

3. **Parse Markdown URLs on save/publish:**
   - Extract image URLs only at write/publish boundaries and resolve internal URLs.
   - Pros: minimal frontend contract and portable Markdown.
   - Cons: parser edge cases, duplicate references, URL normalization concerns, and additional write-time complexity; avoid parsing on every read.

The implementation plan should select one contract after reviewing frontend integration cost. Regardless of the choice, publish must validate internal references and configured external URLs.

### Publish lifecycle alternatives

- **Convert in place:** simplest ownership continuity, but couples draft and published identity.
- **Create Post then archive/delete Draft:** preserves the current complete `Post` invariant and cleanly separates domains; requires transactional/idempotent coordination.
- **Create Post and retain linked Draft:** best for revision history, but expands scope with versioning and lifecycle rules.

Recommendation: create a complete `Post` from the draft and archive the draft, retaining a link for traceability without exposing it as an active editor draft.

## Acceptance criteria

- A user can create a server draft with incomplete editor fields only through the draft API; incomplete data cannot create a `Post`.
- A user can save/update only their own draft, and an admin policy is explicit.
- A user can upload cover and body media after draft creation and receive stable media identifiers plus variant URLs.
- Uploaded media is attached to the draft or represented by the selected manifest/token contract; ownership is verified server-side.
- A user can list their media and distinguish attached, unattached, and retained/expired candidates.
- Removing an image from a draft detaches it without immediately deleting the stored asset.
- Publishing rejects missing internal media references and disallowed external domains, while accepting configured HTTPS external URLs.
- Successful publish creates exactly one complete `Post`, associates its internal media, and transitions the draft according to the selected lifecycle.
- A repeated publish request after transition returns the documented rejection and never creates a duplicate post.
- Post deletion and media retention behavior are covered by tests, including abandoned drafts/uploads and authorization failures.
- OpenAPI documentation describes draft, attachment, media listing, and publish contracts.
- Repository docs describe the finalized architecture and frontend integration contract.

## Risks and mitigations

- **Frontend manifest drift:** use server-side ownership/reference validation and return precise validation errors.
- **Orphaned uploads:** retain assets temporarily, expose listing/delete operations, and run a scheduled cleanup job with a configurable retention period.
- **Storage/database inconsistency:** use transactional attachment state changes, compensating cleanup, and explicit retry-safe processing.
- **Duplicate publish requests:** persist a terminal draft state and enforce a unique draft-to-post relationship.
- **Markdown parser ambiguity:** parse only at write/publish boundaries if URL parsing is selected; add fixtures for nested, escaped, and repeated image syntax.
- **External URL abuse or instability:** enforce exact configured HTTPS hosts and do not proxy/import them.
- **Variant timing:** distinguish original-upload readiness from asynchronous variant readiness and define whether publishing requires only the original or all required variants.
- **Schema migration complexity:** preserve the existing `Post` contract and migrate only new draft/attachment structures.

## Implementation sequence

1. Finalize media-reference and draft-to-post lifecycle choices with the frontend contract.
2. Add Prisma models, constraints, indexes, and migration for drafts, attachments, and lifecycle state.
3. Implement draft DTOs, repository, service, controller, authorization, and publish transaction.
4. Extend media attachment/listing/detach behavior and retention cleanup.
5. Add Markdown/external URL validation at the selected boundary.
6. Document the finalized workflow and API contract in repository docs.
7. Update OpenAPI metadata and focused unit/e2e tests.
8. Run formatting, lint, targeted tests, migration checks, and the relevant e2e suite.
