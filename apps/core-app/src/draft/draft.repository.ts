import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftStatus, MediaTarget, Prisma } from 'prisma/generated/client';
import {
  ManagedMedia,
  lockOriginalMedia,
  originalMedia,
} from '../media/util/managed-media';
import { markdownImages } from '../media/util/markdown-images';

import { CreateDraftDto } from './dto/create-draft.dto';

const includeDraftMedia = {
  draftMedia: { where: { media: originalMedia }, include: { media: true } },
} satisfies Prisma.DraftInclude;

@Injectable()
export class DraftRepository {
  private readonly managedMedia: ManagedMedia;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.managedMedia = new ManagedMedia(config);
  }

  async getAuthorId(id: string): Promise<{ authorId: string }> {
    const { ownerId } = await this.prisma.draft.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });

    return { authorId: ownerId };
  }

  /**
   * Creates a draft and attaches the owner's original post media referenced
   * by managed image URLs in the Markdown content. Variant URLs resolve to
   * their originals, which stay locked until the draft and its links commit.
   *
   * @param ownerId - Draft owner's user ID.
   * @param data - Initial draft fields, including any Markdown content.
   * @returns The created draft with its attached original media.
   * @throws {BadRequestException} If a managed image is unavailable, ineligible,
   * or resolves to a different original while acquiring the locks.
   */
  create(ownerId: string, data: Record<string, unknown>) {
    const keys = this.managedMedia.keys(
      typeof data.content === 'string' ? markdownImages(data.content).urls : [],
    );

    const create = (tx: Prisma.TransactionClient, mediaIds: string[] = []) =>
      tx.draft.create({
        data: {
          ...data,
          ownerId,
          ...(mediaIds.length && {
            draftMedia: { create: mediaIds.map((mediaId) => ({ mediaId })) },
          }),
        },
        include: includeDraftMedia,
      });

    if (!keys.length) return create(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      const mediaIds = await this.managedMedia.lockAndResolve(
        tx,
        keys,
        ownerId,
        MediaTarget.POST,
      );

      return create(tx, mediaIds);
    });
  }

  findMany(ownerId: string) {
    return this.prisma.draft.findMany({
      where: { ownerId, status: DraftStatus.ACTIVE },
      include: {
        ...includeDraftMedia,
        post: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      include: {
        ...includeDraftMedia,
        post: true,
      },
    });
  }

  findVariantUrls(originalIds: string[]) {
    return this.prisma.media.findMany({
      where: { parentId: { in: originalIds } },
      select: { parentId: true, publicUrl: true, key: true },
    });
  }

  /**
   * Finds the post's revision in `ACTIVE` or `PUBLISHING` status.
   *
   * @param postId - ID of the post being revised.
   * @param tx - Optional transaction client for the lookup.
   * @returns The revision with its post and attached original media, or
   * `null` when no revision matches.
   */
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
        ...includeDraftMedia,
        post: true,
      },
    });
  }

  /**
   * Opens a revision for a post owned by the specified author.
   *
   * Locks the post for the transaction and reuses a publishing revision or
   * an active revision based on the current post version. Otherwise, it
   * archives any stale active revision and snapshots the post's editable
   * fields, categories, and source version.
   *
   * The snapshot links existing attachments and originals resolved from
   * managed image URLs, and selects a cover when it can match the post's
   * cover URL to an original. Missing managed URLs can remain in the content
   * for the author to repair.
   *
   * @param ownerId - Expected post author's user ID.
   * @param postId - ID of the post being revised.
   * @returns The existing or newly created revision, or `null` if the post
   * is missing, belongs to another author, or no revision can be found after
   * a concurrent creation conflict.
   * @throws {BadRequestException} If media is ineligible or a managed URL
   * resolves to a new or different original during attachment locking.
   */
  async createRevision(ownerId: string, postId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize revision creation, publication and post deletion.
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`;

        const post = await tx.post.findUnique({
          where: { id: postId },
          include: {
            categories: true,
            postMedia: {
              include: {
                media: {
                  include: { variants: { select: { publicUrl: true } } },
                },
              },
            },
          },
        });
        if (!post || post.authorId !== ownerId) return null;

        // Check for an existing revision before creating a new one
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

        const media = await this.resolveRevisionMedia(tx, post, ownerId);
        if (media.revision) return media.revision;

        const { mediaIds, coverMediaId } = media;
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
            coverMediaId,
            draftMedia: {
              create: mediaIds.map((mediaId) => ({ mediaId })),
            },
          },
          include: {
            ...includeDraftMedia,
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

  /**
   * Locks the original media linked to the post or referenced by its managed
   * image URLs. After locking, checks for a reusable revision and revalidates
   * the media before selecting the cover. Missing managed URLs are tolerated.
   *
   * @param tx - Transaction used to create the revision and hold the locks.
   * @param post - Post with its cover URL, Markdown, attachments, and variants.
   * @param ownerId - Expected media owner's user ID.
   * @returns Distinct original media IDs and an optional cover ID, or an
   * existing active or publishing revision found after acquiring the locks.
   * @throws {BadRequestException} If media is ineligible or a managed URL
   * resolves to a new or different original during locking.
   */
  private async resolveRevisionMedia(
    tx: Prisma.TransactionClient,
    post: {
      id: number;
      coverImage: string;
      content: string;
      postMedia: {
        media: {
          id: string;
          publicUrl: string;
          variants: { publicUrl: string }[];
        };
      }[];
    },
    ownerId: string,
  ) {
    const coverKey = this.managedMedia.key(post.coverImage);
    const keys = this.managedMedia.keys([
      post.coverImage,
      ...markdownImages(post.content).urls,
    ]);
    // Confirmed deletion can leave URLs behind for the author to repair.
    const referenced = await this.managedMedia.resolveByKey(
      tx,
      keys,
      ownerId,
      MediaTarget.POST,
      { allowMissing: true },
    );
    const attached = post.postMedia.map(({ media }) => media);
    const attachedIds = attached.map(({ id }) => id);
    const lockIds = [...new Set([...attachedIds, ...referenced.values()])];
    let currentReferences = referenced;

    if (lockIds.length) {
      await lockOriginalMedia(tx, lockIds);

      const current = await this.findActiveRevision(post.id, tx);
      if (current) return { revision: current };

      currentReferences = await this.managedMedia.resolveByKey(
        tx,
        keys,
        ownerId,
        MediaTarget.POST,
        { allowMissing: true },
      );
      if (
        [...currentReferences].some(([key, id]) => referenced.get(key) !== id)
      ) {
        throw new BadRequestException(
          'Managed image changed. Retry the request.',
        );
      }
    }

    const currentAttachments = await tx.postMedia.findMany({
      where: { postId: post.id, mediaId: { in: attachedIds } },
      select: { mediaId: true },
    });
    const mediaIds = [
      ...new Set([
        ...currentAttachments.map(({ mediaId }) => mediaId),
        ...currentReferences.values(),
      ]),
    ];
    await this.assertOwnedOriginals(tx, ownerId, mediaIds);

    const coverMediaId =
      coverKey === undefined
        ? attached.find(
            ({ id, publicUrl, variants }) =>
              mediaIds.includes(id) &&
              (publicUrl === post.coverImage ||
                variants.some(
                  (variant) => variant.publicUrl === post.coverImage,
                )),
          )?.id
        : currentReferences.get(coverKey);

    return { mediaIds, coverMediaId };
  }

  /**
   * Identifies the unique constraint that allows one active or publishing
   * revision per post. Prisma can report the target as the field name,
   * column name, or partial index name.
   *
   * @param error - Prisma unique constraint error (`P2002`).
   * @returns Whether the error target matches the revision constraint.
   */
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
   * Persists editable draft fields and returns the current attachments.
   *
   * Attachment membership is synchronized separately by `attachMedia`;
   * this method only updates scalar draft fields such as content, categories,
   * and the selected cover identifier.
   *
   * @param id - Draft identifier.
   * @param data - Validated scalar fields to update.
   * @returns The updated draft with directly attachments.
   */
  update(
    id: string,
    data: CreateDraftDto & { coverMediaId?: string | null },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.draft.update({
      where: { id },
      data,
      include: {
        ...includeDraftMedia,
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
   * @returns The claimed snapshot, or null if another request already claimed the draft.
   */
  markPublishing(id: string, ownerId: string, publicationAttemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.draft.updateMany({
        where: { id, ownerId, status: DraftStatus.ACTIVE },
        data: {
          publicationAttemptId,
          status: DraftStatus.PUBLISHING,
          validationError: null,
        },
      });
      if (!claim.count) return null;
      return tx.draft.findUniqueOrThrow({
        where: { id },
        include: { ...includeDraftMedia, post: true },
      });
    });
  }

  /**
   * Lists publishing drafts with a recorded attempt for queue reconciliation.
   *
   * @param after - Exclusive draft ID cursor. Omit to start at the first ID.
   * @returns Up to 100 claims ordered by draft ID, with attempt IDs for job
   * lookup and update timestamps for measuring claim age.
   */
  pendingClaims(after?: string) {
    return this.prisma.draft.findMany({
      where: {
        status: DraftStatus.PUBLISHING,
        publicationAttemptId: { not: null },
        id: { gt: after },
      },
      select: { id: true, publicationAttemptId: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: 100,
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
   * @returns The number of matching claims restored.
   */
  markValidationFailed(
    id: string,
    publicationAttemptId: string,
    error: string,
  ) {
    return this.prisma.draft.updateMany({
      where: { id, publicationAttemptId, status: DraftStatus.PUBLISHING },
      data: {
        status: DraftStatus.ACTIVE,
        publicationAttemptId: null,
        validationError: error,
      },
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
        archivedAt: { lte: cutoff },
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
        updatedAt: { lte: cutoff },
      },
      data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  /**
   * Verifies that each media ID identifies an undeleted post media original
   * owned by the specified user.
   *
   * @param tx - Transaction client for the eligibility check.
   * @param ownerId - Expected media owner's user ID.
   * @param mediaIds - Distinct media IDs to validate. An empty list passes.
   * @throws {BadRequestException} If any media ID fails the eligibility check.
   */
  private async assertOwnedOriginals(
    tx: Prisma.TransactionClient,
    ownerId: string,
    mediaIds: string[],
  ) {
    if (!mediaIds.length) return;
    const count = await tx.media.count({
      where: {
        id: { in: mediaIds },
        ownerId,
        target: MediaTarget.POST,
        ...originalMedia,
      },
    });
    if (count !== mediaIds.length) {
      throw new BadRequestException('One or more media assets are invalid');
    }
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
   * @throws {ConflictException} If the draft is inactive.
   */
  async attachMedia(
    id: string,
    ownerId: string,
    requestedMediaIds: string[] | undefined,
    data: CreateDraftDto,
    coverMediaId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [draft] = await tx.$queryRaw<
        {
          ownerId: string;
          content: string;
          status: DraftStatus;
          coverMediaId: string | null;
        }[]
      >`
        SELECT "owner_id" AS "ownerId", "content", "status", "cover_media_id" AS "coverMediaId"
        FROM "Draft" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE
      `;
      if (!draft || draft.ownerId !== ownerId) {
        throw new NotFoundException('Draft not found');
      }
      if (draft.status !== DraftStatus.ACTIVE) {
        throw new ConflictException('Draft is not editable while publishing');
      }

      const content =
        typeof data.content === 'string'
          ? data.content
          : requestedMediaIds
            ? draft.content
            : undefined;
      const keys = this.managedMedia.keys(
        content ? markdownImages(content).urls : [],
      );
      const referenced = await this.managedMedia.resolve(
        tx,
        keys,
        ownerId,
        MediaTarget.POST,
      );
      const requested = [
        ...new Set(requestedMediaIds?.map((mediaId) => mediaId.toLowerCase())),
      ];
      // Lock outgoing and incoming attachments in the same order.
      const existing = await this.findDraftOriginalIds(tx, id);
      await lockOriginalMedia(tx, [...existing, ...requested, ...referenced]);
      const currentReferences = await this.managedMedia.resolve(
        tx,
        keys,
        ownerId,
        MediaTarget.POST,
      );
      if (currentReferences.some((mediaId) => !referenced.includes(mediaId))) {
        throw new BadRequestException(
          'Managed image changed. Retry the request.',
        );
      }
      const previous = requestedMediaIds ? requested : existing;
      const mediaIds = [...new Set([...previous, ...currentReferences])];
      await this.assertOwnedOriginals(tx, ownerId, mediaIds);
      if (coverMediaId && !mediaIds.includes(coverMediaId.toLowerCase())) {
        throw new BadRequestException(
          'Cover media must be attached to the draft',
        );
      }

      if (!requestedMediaIds && mediaIds.length === previous.length) {
        return this.update(
          id,
          {
            ...data,
            ...(coverMediaId !== undefined && { coverMediaId }),
          },
          tx,
        );
      }

      await tx.draftMedia.deleteMany({
        where: { draftId: id, mediaId: { notIn: mediaIds } },
      });
      if (mediaIds.length) {
        await tx.draftMedia.createMany({
          data: mediaIds.map((mediaId) => ({ draftId: id, mediaId })),
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

  private async findDraftOriginalIds(
    tx: Prisma.TransactionClient,
    draftId: string,
  ) {
    const rows = await tx.draftMedia.findMany({
      where: { draftId },
      select: { mediaId: true },
    });
    return rows.map(({ mediaId }) => mediaId);
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
   * @returns The current original IDs ready for publication.
   * @throws {ConflictException} If the manifest changed.
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
    const outgoing =
      postId === undefined
        ? []
        : await tx.postMedia.findMany({
            where: { postId },
            select: { mediaId: true },
          });
    await lockOriginalMedia(tx, [
      ...validated.mediaIds,
      ...outgoing.map(({ mediaId }) => mediaId),
    ]);
    const current = await this.findDraftOriginalIds(tx, draftId);
    if (
      coverMediaId !== validated.coverMediaId ||
      !current.includes(validated.coverMediaId) ||
      current.length !== validated.mediaIds.length ||
      current.some((id) => !validated.mediaIds.includes(id))
    ) {
      throw new ConflictException(
        'Draft attachments changed during publication',
      );
    }
    await this.assertOwnedOriginals(tx, ownerId, current);
    return current;
  }

  /**
   * Publishes a new-post draft in one transaction.
   *
   * Creates the post and its category links, links the draft’s media to
   * the new post, and archives the draft with its created post
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
      publicationAttemptId: string;
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
          publicationAttemptId: data.publicationAttemptId,
          status: DraftStatus.PUBLISHING,
          postId: null,
        },
        select: { coverMediaId: true },
      });
      if (!draft) throw new ConflictException('Draft is no longer publishing');

      await this.checkPublicationCategories(tx, data.categoryNames);
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

      await this.replacePostMedia(tx, post.id, originalIds);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          publicationAttemptId: null,
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
   * categories, replaces the live post’s media links, increments the
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
      publicationAttemptId: string;
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
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${data.postId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;
      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          ownerId,
          publicationAttemptId: data.publicationAttemptId,
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
      await this.checkPublicationCategories(tx, data.categoryNames);
      const originalIds = await this.validatePublicationMedia(
        tx,
        draftId,
        ownerId,
        data,
        draft.coverMediaId,
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

      await this.replacePostMedia(tx, postId, originalIds);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          publicationAttemptId: null,
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

  private async checkPublicationCategories(
    tx: Prisma.TransactionClient,
    names: string[],
  ) {
    if (!names.length) return;
    // Hold the category keys until their post links commit.
    const rows = await tx.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Category" WHERE name IN (${Prisma.join(names)})
      ORDER BY name FOR KEY SHARE
    `;
    const existing = new Set(rows.map(({ name }) => name));
    const missing = names.filter((name) => !existing.has(name));
    if (missing.length)
      throw new BadRequestException(
        `Remove or replace unavailable categories: ${missing.join(', ')}`,
      );
  }

  private async replacePostMedia(
    tx: Prisma.TransactionClient,
    postId: number,
    originalIds: string[],
  ) {
    await tx.postMedia.deleteMany({
      where: { postId, mediaId: { notIn: originalIds } },
    });
    await tx.postMedia.createMany({
      data: originalIds.map((mediaId) => ({ postId, mediaId })),
      skipDuplicates: true,
    });
  }

  archiveRevision(id: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
    });
  }
}
