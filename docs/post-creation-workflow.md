# Post creation workflow

## Client flow

The editor may autosave locally, but the API draft starts on the first explicit save:

1. `POST /draft` creates an incomplete server-side draft.
2. `PUT /draft/:id` saves title, excerpt, Markdown content, categories, cover media, and the explicit media manifest.
3. `POST /media` uploads images. Include `draftId`, `target=POST`, and `role=COVER` or `role=BODY` to attach an upload to the draft.
4. `GET /media?attached=true` lists the authenticated user's attached assets. `GET /media?attached=false` lists unattached assets.
5. `POST /draft/:id/publish` validates and publishes the draft.

The draft is owned by the authenticated user. Draft-bound uploads must use the same owner and remain attached until explicitly detached with `DELETE /media/:id`.

## Markdown and media references

The current contract keeps standard Markdown image URLs and uses attached media IDs as the explicit manifest. The frontend should include the IDs in `mediaIds` when saving a draft and use each uploaded asset's `publicUrl` in Markdown.

At publish time:

- URLs matching attached media are accepted.
- HTTPS URLs are accepted only when their hostname is in `EXTERNAL_MEDIA_DOMAINS`.
- Other image URLs reject publication.

Removing an image detaches the media record and does not immediately delete the stored object. A future retention job can clean up unattached assets.

The media processor schedules a daily cleanup job for unattached POST and COMMENT assets older than `MEDIA_UNATTACHED_RETENTION_DAYS` (30 days by default). Cover/body assets moved to a post are never eligible for this cleanup.

## Publish lifecycle

Publishing requires non-empty title, excerpt, content, and an attached cover media asset. The API creates a complete `Post`, moves draft media to the post, and archives the draft in one database transaction. A second publish request is rejected and cannot create a duplicate post.

## Configuration

Set `EXTERNAL_MEDIA_DOMAINS` to a comma-separated list of exact HTTPS hostnames, for example:

```env
EXTERNAL_MEDIA_DOMAINS=images.example.com,cdn.example.org
```

Keep the list narrow. External images are preserved as URLs and are not proxied or imported into managed storage.
