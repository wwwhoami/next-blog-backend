import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DraftStatus,
  MediaTarget,
  MediaVariant,
  Prisma,
} from 'prisma/generated/client';

const originalMedia = {
  parentId: null,
  variant: MediaVariant.ORIGINAL,
} as const;

@Injectable()
export class DraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthorId(id: string): Promise<{ authorId: string }> {
    const { ownerId } = await this.prisma.draft.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });

    return { authorId: ownerId };
  }

  create(ownerId: string, data: Record<string, unknown>) {
    return this.prisma.draft.create({
      data: { ...data, ownerId },
      include: { media: { where: originalMedia } },
    });
  }

  findMany(ownerId: string) {
    return this.prisma.draft.findMany({
      where: { ownerId, status: DraftStatus.ACTIVE },
      include: {
        media: { where: originalMedia },
        draftMedia: {
          where: { media: originalMedia },
          include: { media: true },
        },
        post: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      include: {
        media: { where: originalMedia },
        draftMedia: {
          where: { media: originalMedia },
          include: { media: true },
        },
        post: true,
      },
    });
  }

  findVariantUrls(originalIds: string[]) {
    return this.prisma.media.findMany({
      where: { parentId: { in: originalIds } },
      select: { parentId: true, publicUrl: true },
    });
  }

  async findActiveRevision(
    postId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.draft.findFirst({
      where: {
        postId,
        status: { in: [DraftStatus.ACTIVE, DraftStatus.PUBLISHING] },
      },
      include: {
        media: { where: originalMedia },
        draftMedia: {
          where: { media: originalMedia },
          include: { media: true },
        },
        post: true,
      },
    });
  }

  /**
   * Creates or reuses the author's revision snapshot for an existing post.
   *
   * The operation runs in a transaction to keep revision creation consistent
   * with the post's current version. An active revision for that version is
   * returned unchanged, a publishing revision is preserved for conflict
   * handling, and an outdated active revision is archived before a new
   * snapshot is created with the post's content, categories, cover media, and
   * media links.
   *
   * @param ownerId - The authenticated author's identifier.
   * @param postId - The identifier of the post being revised.
   * @returns The existing or newly created revision, or `null` when the post
   * does not exist or is not owned by the requested author.
   */
  async createRevision(ownerId: string, postId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const post = await tx.post.findUnique({
          where: { id: postId },
          include: {
            categories: true,
            Media: {
              where: originalMedia,
              include: { Variants: { select: { publicUrl: true } } },
            },
          },
        });
        if (!post || post.authorId !== ownerId) return null;

        const active = await this.findActiveRevision(postId, tx);
        if (active?.status === DraftStatus.PUBLISHING) return active;
        if (active && active.sourceVersion === post.version) return active;
        if (active) {
          const archived = await tx.draft.updateMany({
            where: { id: active.id, status: DraftStatus.ACTIVE },
            data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
          });
          if (!archived.count) {
            const current = await this.findActiveRevision(postId, tx);
            if (current) return current;
          }
        }

        const mediaIds = post.Media.map(({ id }) => id);
        if (mediaIds.length) {
          await this.lockOriginals(tx, mediaIds);
          const current = await this.findActiveRevision(postId, tx);
          if (current) return current;
          await this.assertClaimableMedia(
            tx,
            ownerId,
            mediaIds,
            undefined,
            postId,
          );
        }

        const draft = await tx.draft.create({
          data: {
            ownerId,
            postId,
            sourceVersion: post.version,
            title: post.title,
            excerpt: post.excerpt,
            content: post.content,
            categoryNames: post.categories.map(
              ({ categoryName }) => categoryName,
            ),
            coverMediaId: post.Media.find(
              ({ publicUrl, Variants }) =>
                publicUrl === post.coverImage ||
                Variants.some(
                  (variant) => variant.publicUrl === post.coverImage,
                ),
            )?.id,
            draftMedia: {
              create: post.Media.map(({ id }) => ({ mediaId: id })),
            },
          },
          include: {
            media: { where: originalMedia },
            draftMedia: {
              where: { media: originalMedia },
              include: { media: true },
            },
            post: true,
          },
        });
        return draft;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        this.isActiveRevisionConflict(error)
      ) {
        return this.findActiveRevision(postId);
      }
      throw error;
    }
  }

  private isActiveRevisionConflict(
    error: Prisma.PrismaClientKnownRequestError,
  ): boolean {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return (
        target.length === 1 &&
        (target[0] === 'postId' || target[0] === 'post_id')
      );
    }

    return (
      target === 'postId' ||
      target === 'post_id' ||
      target === 'Draft_one_active_revision_per_post_idx'
    );
  }

  /**
   * Finds a draft for validating media attachment ownership and lifecycle.
   */
  findForMediaAttachment(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      select: { ownerId: true, status: true },
    });
  }

  /**
   * Persists editable draft fields and returns the direct draft media.
   *
   * Revision media membership is synchronized separately by `attachMedia`;
   * this method only updates scalar draft fields such as content, categories,
   * and the selected cover identifier.
   *
   * @param id - Draft identifier.
   * @param data - Validated scalar fields to update.
   * @returns The updated draft with directly attached media.
   */
  update(
    id: string,
    data: Record<string, unknown>,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.draft.update({
      where: { id },
      data,
      include: {
        media: { where: originalMedia },
        draftMedia: {
          where: { media: originalMedia },
          include: { media: true },
        },
        post: true,
      },
    });
  }

  /**
   * Claims an active draft for asynchronous publication.
   *
   * The conditional update makes claiming atomic so concurrent publish
   * requests cannot both transition the same draft.
   *
   * @param id - Draft identifier.
   * @param ownerId - Expected draft owner.
   * @returns The number of drafts successfully claimed.
   */
  markPublishing(id: string, ownerId: string) {
    return this.prisma.draft.updateMany({
      where: { id, ownerId, status: DraftStatus.ACTIVE },
      data: { status: DraftStatus.PUBLISHING, validationError: null },
    });
  }

  /**
   * Restores a publishing draft to `ACTIVE` and records its latest failure.
   *
   * This is used for validation failures and after the final failed worker
   * attempt so the draft remains editable and publication can be retried.
   *
   * @param id - Draft identifier.
   * @param error - User-facing or infrastructure failure description.
   * @returns The restored draft with directly attached media.
   */
  markValidationFailed(id: string, error: string) {
    return this.prisma.draft.updateMany({
      where: { id, status: DraftStatus.PUBLISHING },
      data: { status: DraftStatus.ACTIVE, validationError: error },
    });
  }

  /**
   * Deletes archived drafts older than the retention cutoff.
   *
   * Draft-media history is removed by the draft foreign-key cascade. Media
   * records themselves are retained because they may still be referenced by a
   * post, comment, or another revision.
   *
   * @param cutoff - Drafts archived before this timestamp are eligible.
   * @returns The number of deleted archived drafts.
   */
  deleteArchivedBefore(cutoff: Date) {
    return this.prisma.draft.deleteMany({
      where: {
        status: DraftStatus.ARCHIVED,
        archivedAt: { lt: cutoff },
      },
    });
  }

  /**
   * Archives inactive active revisions before historical cleanup.
   *
   * @param cutoff - Revisions not updated since this timestamp are archived.
   * @returns The number of revisions archived.
   */
  archiveInactiveRevisionsBefore(cutoff: Date) {
    return this.prisma.draft.updateMany({
      where: {
        postId: { not: null },
        sourceVersion: { not: null },
        status: DraftStatus.ACTIVE,
        updatedAt: { lt: cutoff },
      },
      data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  /**
   * Locks requested originals and existing draft or post families in ID
   * order.
   *
   * @param tx - Transaction that holds the locks until it ends.
   * @param mediaIds - Explicitly requested original IDs.
   * @param draftId - Draft whose current attachments should also be locked.
   * @param postId - Source post whose attachments should also be locked.
   */
  private async lockOriginals(
    tx: Prisma.TransactionClient,
    mediaIds: string[],
    draftId?: string,
    postId?: number,
  ) {
    const requested = mediaIds.length
      ? Prisma.sql`"id" IN (${Prisma.join(mediaIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.sql`FALSE`;
    await tx.$queryRaw`
      SELECT "id" FROM "Media"
      WHERE "parentId" IS NULL AND "media_variant" = 'ORIGINAL'
        AND (
          ${requested} OR "draft_id" = ${draftId ?? null}::uuid
          OR "postId" = ${postId ?? null}::integer
          OR "id" IN (
            SELECT COALESCE(m."parentId", m."id") FROM "Media" m
            WHERE m."draft_id" = ${draftId ?? null}::uuid OR m."postId" = ${postId ?? null}::integer
              OR EXISTS (SELECT 1 FROM "DraftMedia" dm WHERE dm."media_id" = m."id"
                AND dm."draft_id" = ${draftId ?? null}::uuid)
              OR EXISTS (SELECT 1 FROM "Draft" d WHERE d."cover_media_id" = m."id"
                AND d."id" = ${draftId ?? null}::uuid)
          )
        )
      ORDER BY "id"
      FOR UPDATE
    `;
  }

  /**
   * Checks locked families for competing claims and permits media from the
   * revision’s source post.
   *
   * @param tx - Transaction holding the original locks.
   * @param ownerId - Draft owner requesting the claim.
   * @param mediaIds - Requested original IDs.
   * @param draftId - Destination draft to exclude from conflict checks.
   * @param sourcePostId - Revision source post whose attachments can be retained.
   * @returns The checked originals and their attachment metadata.
   * @throws {BadRequestException} If any requested original is invalid or ineligible by ownership.
   * @throws {ConflictException} If a family has a competing or unresolved claim.
   */
  private async assertClaimableMedia(
    tx: Prisma.TransactionClient,
    ownerId: string,
    mediaIds: string[],
    draftId?: string,
    sourcePostId?: number,
  ) {
    if (!mediaIds.length) return [];

    const links = {
      postId: true,
      commentId: true,
      Draft: { select: { id: true, status: true } },
      DraftMedia: {
        select: { draft: { select: { id: true, status: true } } },
      },
    } as const;
    const media = await tx.media.findMany({
      where: {
        id: { in: mediaIds },
        target: MediaTarget.POST,
        ...originalMedia,
      },
      select: {
        ...links,
        id: true,
        ownerId: true,
        Variants: { select: { ...links, id: true } },
      },
    });
    if (media.length !== mediaIds.length) {
      throw new BadRequestException('One or more media assets are invalid');
    }

    const destinationId = draftId?.toLowerCase();
    for (const original of media) {
      for (const member of [original, ...original.Variants]) {
        if (member.postId != null && member.postId !== sourcePostId) {
          throw new ConflictException('Media is attached to another post');
        }
        if (member.commentId != null) {
          throw new ConflictException('Media is attached to a comment');
        }
        if (
          [member.Draft, ...member.DraftMedia.map(({ draft }) => draft)].some(
            (draft) =>
              draft &&
              draft.id !== destinationId &&
              (draft.status === DraftStatus.ACTIVE ||
                draft.status === DraftStatus.PUBLISHING),
          )
        ) {
          throw new ConflictException(
            'Media is attached to another active draft',
          );
        }
      }
      if (
        original.Variants.some(
          ({ Draft, DraftMedia }) =>
            (Draft != null && Draft.id === destinationId) ||
            DraftMedia.some(({ draft }) => draft.id === destinationId),
        )
      ) {
        throw new ConflictException(
          'Media has an unresolved variant draft claim',
        );
      }
      if (
        original.ownerId !== ownerId &&
        (sourcePostId === undefined || original.postId !== sourcePostId)
      ) {
        throw new BadRequestException('One or more media assets are invalid');
      }
    }
    const legacyCoverIds = media.flatMap(({ Variants }) =>
      Variants.map(({ id }) => id),
    );
    const competingCover = await tx.draft.findFirst({
      where: {
        id: { not: destinationId },
        status: { in: [DraftStatus.ACTIVE, DraftStatus.PUBLISHING] },
        coverMediaId: { in: [...mediaIds, ...legacyCoverIds] },
      },
      select: { id: true },
    });
    const ownLegacyCover =
      destinationId &&
      (await tx.draft.findFirst({
        where: { id: destinationId, coverMediaId: { in: legacyCoverIds } },
        select: { id: true },
      }));
    if (ownLegacyCover)
      throw new ConflictException(
        'Media has an unresolved variant cover claim',
      );
    if (competingCover)
      throw new ConflictException('Media is the cover of another active draft');
    return media;
  }

  /**
   * Saves draft fields and, when supplied, replaces the attachment manifest
   * under row locks.
   *
   * @param id - Draft ID.
   * @param ownerId - Expected draft owner.
   * @param requestedMediaIds - Replacement manifest. Omit to retain the current attachments.
   * @param data - Validated draft fields to save.
   * @param coverMediaId - New original cover ID, or null to clear it. Omit to retain a cover that is still attached.
   * @returns The saved draft with its media and post relations.
   * @throws {NotFoundException} If the draft is missing or belongs to another owner.
   * @throws {BadRequestException} If an asset is invalid or the cover is outside the manifest.
   * @throws {ConflictException} If the draft is inactive or an attachment claim conflicts.
   */
  async attachMedia(
    id: string,
    ownerId: string,
    requestedMediaIds: string[] | undefined,
    data: Record<string, unknown>,
    coverMediaId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [draft] = await tx.$queryRaw<
        {
          ownerId: string;
          status: DraftStatus;
          coverMediaId: string | null;
          postId: number | null;
          sourceVersion: number | null;
        }[]
      >`
        SELECT "owner_id" AS "ownerId", "status", "cover_media_id" AS "coverMediaId", "post_id" AS "postId", "source_version" AS "sourceVersion"
        FROM "Draft" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (!draft || draft.ownerId !== ownerId) {
        throw new NotFoundException('Draft not found');
      }
      if (draft.status !== DraftStatus.ACTIVE) {
        throw new ConflictException('Draft is not editable while publishing');
      }

      // Lock outgoing and incoming attachments in the same order.
      const requested = [
        ...new Set(requestedMediaIds?.map((mediaId) => mediaId.toLowerCase())),
      ];
      await this.lockOriginals(tx, requested, id);
      const mediaIds = requestedMediaIds
        ? requested
        : await this.findDraftOriginalIds(tx, id);
      const media = await this.assertClaimableMedia(
        tx,
        ownerId,
        mediaIds,
        id,
        draft.sourceVersion === null ? undefined : (draft.postId ?? undefined),
      );
      if (coverMediaId && !mediaIds.includes(coverMediaId.toLowerCase())) {
        throw new BadRequestException(
          'Cover media must be attached to the draft',
        );
      }

      if (!requestedMediaIds) {
        await this.assertNoLegacyDraftClaims(id, tx);
        return this.update(
          id,
          {
            ...data,
            ...(coverMediaId !== undefined && { coverMediaId }),
          },
          tx,
        );
      }

      await tx.media.updateMany({
        where: { draftId: id, id: { notIn: mediaIds } },
        data: { draftId: null },
      });
      await tx.draftMedia.deleteMany({
        where: { draftId: id, mediaId: { notIn: mediaIds } },
      });
      if (mediaIds.length) {
        await tx.media.updateMany({
          where: { id: { in: mediaIds }, ownerId },
          data: { draftId: id },
        });
        await tx.draftMedia.createMany({
          data: [
            ...mediaIds.map((mediaId) => ({ draftId: id, mediaId })),
            ...media.flatMap(({ id: mediaId, ownerId: mediaOwnerId, Draft }) =>
              mediaOwnerId === ownerId && Draft?.status === DraftStatus.ARCHIVED
                ? [{ draftId: Draft.id, mediaId }]
                : [],
            ),
          ],
          skipDuplicates: true,
        });
      }

      return this.update(
        id,
        {
          ...data,
          coverMediaId:
            coverMediaId !== undefined
              ? coverMediaId
              : draft.coverMediaId && mediaIds.includes(draft.coverMediaId)
                ? draft.coverMediaId
                : null,
        },
        tx,
      );
    });
  }

  /**
   * Removes the direct attachment and its snapshot link, clearing the cover
   * if it used that media.
   *
   * @param draftId - ID of the active draft.
   * @param mediaId - ID of the directly attached original.
   * @throws {ConflictException} If the draft is inactive or the direct attachment changed.
   */
  async detachMedia(draftId: string, mediaId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;
      const draft = await tx.draft.findUnique({
        where: { id: draftId },
        select: { status: true },
      });
      if (draft?.status !== DraftStatus.ACTIVE) {
        throw new ConflictException('Draft is no longer active');
      }
      const detached = await tx.media.updateMany({
        where: { id: mediaId, draftId, parentId: null },
        data: { draftId: null },
      });
      if (!detached.count) {
        throw new ConflictException('Media attachment changed');
      }
      await tx.draftMedia.deleteMany({ where: { draftId, mediaId } });
      await tx.draft.updateMany({
        where: { id: draftId, coverMediaId: mediaId },
        data: { coverMediaId: null },
      });
    });
  }

  private async findDraftOriginalIds(
    tx: Prisma.TransactionClient,
    draftId: string,
  ) {
    const rows = await tx.media.findMany({
      where: {
        ...originalMedia,
        OR: [{ draftId }, { DraftMedia: { some: { draftId } } }],
      },
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }

  /**
   * Rejects unresolved draft links and cover references that still point to
   * a variant.
   *
   * @param draftId - Draft to check.
   * @param tx - Transaction to read from, when supplied.
   * @throws {ConflictException} If a variant still has a direct, snapshot, or cover claim.
   */
  async assertNoLegacyDraftClaims(
    draftId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const draft = await tx.draft.findUnique({
      where: { id: draftId },
      select: { coverMediaId: true },
    });
    const legacy = await tx.media.findFirst({
      where: {
        parentId: { not: null },
        OR: [
          { draftId },
          { DraftMedia: { some: { draftId } } },
          ...(draft?.coverMediaId ? [{ id: draft.coverMediaId }] : []),
        ],
      },
      select: { id: true },
    });
    if (legacy)
      throw new ConflictException(
        'Media has an unresolved variant draft claim',
      );
  }

  /**
   * Locks the affected media and verifies that the validated manifest and
   * cover still match.
   *
   * @param tx - Publication transaction.
   * @param draftId - Publishing draft ID.
   * @param ownerId - Expected draft owner.
   * @param validated - IDs of the originals and cover validated by the worker.
   * @param coverMediaId - Current cover ID read under the draft lock.
   * @param postId - Source post ID when publishing a revision.
   * @returns The current original IDs ready for transfer.
   * @throws {ConflictException} If the manifest changed or a claim conflicts.
   * @throws {BadRequestException} If a requested original is invalid or ineligible by ownership.
   */
  private async validatePublicationMedia(
    tx: Prisma.TransactionClient,
    draftId: string,
    ownerId: string,
    validated: { mediaIds: string[]; coverMediaId: string },
    coverMediaId: string | null,
    postId?: number,
  ) {
    await this.lockOriginals(tx, validated.mediaIds, draftId, postId);
    await this.assertNoLegacyDraftClaims(draftId, tx);
    const current = await this.findDraftOriginalIds(tx, draftId);
    if (
      coverMediaId !== validated.coverMediaId ||
      current.length !== validated.mediaIds.length ||
      current.some((id) => !validated.mediaIds.includes(id))
    ) {
      throw new ConflictException(
        'Draft attachments changed during publication',
      );
    }
    await this.assertClaimableMedia(tx, ownerId, current, draftId, postId);
    return current;
  }

  /**
   * Publishes a new-post draft in one transaction.
   *
   * Creates the post and its category links, transfers media ownership from
   * the draft to the new post, and archives the draft with its created post
   * identifier. If any step fails, the transaction rolls back all changes.
   *
   * @param draftId - The identifier of the draft being published.
   * @param ownerId - The authenticated owner's identifier.
   * @param data - Validated post content, cover image, slug, and categories.
   * @returns The newly created post with its author and categories.
   */
  publish(
    draftId: string,
    ownerId: string,
    data: {
      title: string;
      slug: string;
      excerpt: string;
      content: string;
      coverImage: string;
      coverMediaId: string;
      mediaIds: string[];
      categoryNames: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;
      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          ownerId,
          status: DraftStatus.PUBLISHING,
          postId: null,
        },
        select: { coverMediaId: true },
      });
      if (!draft) throw new ConflictException('Draft is no longer publishing');

      const originalIds = await this.validatePublicationMedia(
        tx,
        draftId,
        ownerId,
        data,
        draft.coverMediaId,
      );
      const post = await tx.post.create({
        data: {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          content: data.content,
          published: true,
          coverImage: data.coverImage,
          authorId: ownerId,
          categories: {
            create: data.categoryNames.map((name) => ({
              category: { connect: { name } },
            })),
          },
        },
        include: {
          author: { select: { name: true, image: true } },
          categories: { include: { category: true } },
        },
      });

      await this.transferMediaToPost(tx, originalIds, draftId, post.id);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          status: DraftStatus.ARCHIVED,
          postId: post.id,
          archivedAt: new Date(),
        },
      });

      return post;
    });
  }

  /**
   * Publishes an existing post revision using optimistic version control.
   *
   * Within one transaction, verifies that the post is still owned by the
   * author and has the revision's source version, replaces its content and
   * categories, transfers revision media to the live post, increments the
   * post version, and archives the revision. A changed post causes the
   * transaction to fail without applying partial updates.
   *
   * @param draftId - The identifier of the revision being published.
   * @param ownerId - The authenticated author's identifier.
   * @param data - Validated revision content, media, categories, and source
   * version information.
   * @returns The updated post with its author and categories.
   * @throws {Error} If the post no longer matches the revision's owner or
   * source version.
   */
  publishRevision(
    draftId: string,
    ownerId: string,
    data: {
      title: string;
      excerpt: string;
      content: string;
      coverImage: string;
      coverMediaId: string;
      mediaIds: string[];
      categoryNames: string[];
      sourceVersion: number;
      postId: number;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;
      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          ownerId,
          status: DraftStatus.PUBLISHING,
          postId: data.postId,
        },
        select: { sourceVersion: true, coverMediaId: true },
      });
      if (!draft) throw new ConflictException('Draft is no longer publishing');

      const postId = data.postId;
      if (draft.sourceVersion !== data.sourceVersion) {
        throw new ConflictException(
          'Post changed since this revision was created',
        );
      }
      const originalIds = await this.validatePublicationMedia(
        tx,
        draftId,
        ownerId,
        data,
        draft.coverMediaId,
        postId,
      );
      const outgoing = await tx.media.findMany({
        where: {
          parentId: null,
          OR: [{ postId }, { Variants: { some: { postId } } }],
        },
        select: { id: true, postId: true },
      });
      if (outgoing.some((row) => row.postId !== postId)) {
        throw new ConflictException(
          'Post has an unresolved variant media claim',
        );
      }
      await this.assertClaimableMedia(
        tx,
        ownerId,
        outgoing
          .filter(({ id }) => !originalIds.includes(id))
          .map(({ id }) => id),
        draftId,
        postId,
      );

      const updated = await tx.post.updateMany({
        where: { id: postId, authorId: ownerId, version: data.sourceVersion },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          coverImage: data.coverImage,
          version: { increment: 1 },
        },
      });
      if (!updated.count) {
        throw new ConflictException(
          'Post changed since this revision was created',
        );
      }

      await tx.postToCategory.deleteMany({ where: { postId } });
      if (data.categoryNames.length) {
        await tx.postToCategory.createMany({
          data: data.categoryNames.map((categoryName) => ({
            postId,
            categoryName,
          })),
        });
      }

      await tx.media.updateMany({
        where: { postId },
        data: { postId: null },
      });
      await this.transferMediaToPost(tx, originalIds, draftId, postId);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          status: DraftStatus.ARCHIVED,
          archivedAt: new Date(),
          validationError: null,
        },
      });

      return tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: {
          author: { select: { name: true, image: true } },
          categories: { include: { category: true } },
        },
      });
    });
  }

  private async transferMediaToPost(
    tx: Prisma.TransactionClient,
    originalIds: string[],
    draftId: string,
    postId: number,
  ) {
    await tx.media.updateMany({
      where: { id: { in: originalIds }, draftId },
      data: { draftId: null },
    });
    await tx.media.updateMany({
      where: {
        OR: [{ id: { in: originalIds } }, { parentId: { in: originalIds } }],
      },
      data: { postId },
    });
  }

  archiveRevision(id: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
    });
  }
}
