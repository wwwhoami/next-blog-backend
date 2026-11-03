import { PrismaService } from '@app/prisma';
import { ConflictException, Injectable } from '@nestjs/common';
import { DraftStatus, MediaTarget, Prisma } from 'prisma/generated/client';

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
      include: { media: true },
    });
  }

  findMany(ownerId: string) {
    return this.prisma.draft.findMany({
      where: { ownerId, status: DraftStatus.ACTIVE },
      include: {
        media: true,
        draftMedia: { include: { media: true } },
        post: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      include: {
        media: true,
        draftMedia: { include: { media: true } },
        post: true,
      },
    });
  }

  async findActiveRevision(postId: number) {
    return this.prisma.draft.findFirst({
      where: {
        postId,
        status: { in: [DraftStatus.ACTIVE, DraftStatus.PUBLISHING] },
      },
      include: {
        media: true,
        draftMedia: { include: { media: true } },
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
            Media: true,
          },
        });
        if (!post || post.authorId !== ownerId) return null;

        const active = await tx.draft.findFirst({
          where: {
            postId,
            status: { in: [DraftStatus.ACTIVE, DraftStatus.PUBLISHING] },
          },
          include: {
            media: true,
            draftMedia: { include: { media: true } },
            post: true,
          },
        });
        if (active?.status === DraftStatus.PUBLISHING) return active;
        if (active && active.sourceVersion === post.version) return active;
        if (active) {
          await tx.draft.update({
            where: { id: active.id },
            data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
          });
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
              ({ publicUrl }) => publicUrl === post.coverImage,
            )?.id,
            draftMedia: {
              create: post.Media.map(({ id }) => ({ mediaId: id })),
            },
          },
          include: {
            media: true,
            draftMedia: { include: { media: true } },
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
  update(id: string, data: Record<string, unknown>) {
    return this.prisma.draft.update({
      where: { id },
      data,
      include: {
        media: true,
        draftMedia: { include: { media: true } },
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
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.ACTIVE, validationError: error },
      include: { media: true },
    });
  }

  /**
   * Deletes archived revisions older than the retention cutoff.
   *
   * Draft-media history is removed by the draft foreign-key cascade. Media
   * records themselves are retained because they may still be referenced by a
   * post, comment, or another revision.
   *
   * @param cutoff - Revisions archived before this timestamp are eligible.
   * @returns The number of deleted archived revisions.
   */
  deleteArchivedBefore(cutoff: Date) {
    return this.prisma.draft.deleteMany({
      where: {
        status: DraftStatus.ARCHIVED,
        sourceVersion: { not: null },
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

  findAttachableMedia(ownerId: string, mediaIds: string[]) {
    return this.prisma.media.findMany({
      where: {
        id: { in: mediaIds },
        ownerId,
        target: MediaTarget.POST,
      },
    });
  }

  attachMedia(id: string, mediaIds: string[]) {
    return this.prisma.$transaction([
      this.prisma.media.updateMany({
        where: { draftId: id },
        data: { draftId: null },
      }),
      this.prisma.media.updateMany({
        where: { id: { in: mediaIds } },
        data: { draftId: id },
      }),
      this.prisma.draftMedia.deleteMany({ where: { draftId: id } }),
      this.prisma.draftMedia.createMany({
        data: mediaIds.map((mediaId) => ({ draftId: id, mediaId })),
        skipDuplicates: true,
      }),
    ]);
  }

  clearCoverMedia(id: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { coverMediaId: null },
    });
  }

  findCoverCandidate(id: string, ownerId: string, mediaId: string) {
    return this.prisma.media.findFirst({
      where: {
        id: mediaId,
        ownerId,
        target: MediaTarget.POST,
        OR: [{ draftId: id }, { DraftMedia: { some: { draftId: id } } }],
      },
    });
  }

  setCoverMedia(id: string, mediaId: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { coverMediaId: mediaId },
    });
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
      categoryNames: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          content: data.content,
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

      await tx.media.updateMany({
        where: { draftId },
        data: { draftId: null, postId: post.id },
      });

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
      categoryNames: string[];
      sourceVersion: number;
      postId: number;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: {
          id: data.postId,
          authorId: ownerId,
          version: data.sourceVersion,
        },
      });
      if (!post) {
        throw new ConflictException(
          'Post changed since this revision was created',
        );
      }

      await tx.postToCategory.deleteMany({ where: { postId: post.id } });
      if (data.categoryNames.length) {
        await tx.postToCategory.createMany({
          data: data.categoryNames.map((categoryName) => ({
            postId: post.id,
            categoryName,
          })),
        });
      }

      await tx.post.update({
        where: { id: post.id },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          coverImage: data.coverImage,
          version: { increment: 1 },
        },
      });

      const revisionMedia = await tx.draftMedia.findMany({
        where: { draftId },
        select: { mediaId: true },
      });
      await tx.media.updateMany({
        where: { postId: post.id },
        data: { postId: null },
      });
      if (revisionMedia.length) {
        await tx.media.updateMany({
          where: { id: { in: revisionMedia.map(({ mediaId }) => mediaId) } },
          data: { postId: post.id, draftId: null },
        });
      }

      await tx.draft.update({
        where: { id: draftId },
        data: {
          status: DraftStatus.ARCHIVED,
          archivedAt: new Date(),
          validationError: null,
        },
      });

      return tx.post.findUniqueOrThrow({
        where: { id: post.id },
        include: {
          author: { select: { name: true, image: true } },
          categories: { include: { category: true } },
        },
      });
    });
  }

  archiveRevision(id: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.ARCHIVED, archivedAt: new Date() },
    });
  }
}
